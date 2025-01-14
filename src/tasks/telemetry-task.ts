import axios from 'axios';
import _ from 'lodash';
import { Logger } from 'winston';
import StoragerApi from '../storager';
import { AppContext } from '../types/context';
import { PinStatus } from '../types/database';
import { NormalizedConfig } from '../types/sdatamanager-config';
import { WorkloadInfo } from '../types/storager';
import { SimpleTask } from '../types/tasks';
import {
  PinStats,
  QueueInfo,
  SDataManagerInfo,
  TelemetryData,
  StoragerStats,
} from '../types/telemetry';
import { formatError, getTimestamp, toQuotedList } from '../utils';
import { Dayjs } from '../utils/datetime';
import { PendingStatus } from './pull-utils';
import { makeIntervalTask } from './task-utils';

const ReportSlotDuration = Dayjs.duration({
  hours: 24,
}).asSeconds();

async function handleReport(context: AppContext, logger: Logger) {
  const telemetryUrl = context.config.telemetry.endPoint;
  if (_.isEmpty(telemetryUrl)) {
    logger.warn('telemetry endpoint not configured, skip report');
    return;
  }
  const stats = await collectStats(context, logger);
  if (stats.storager) {
    logger.info('reporting stats to telemtry: %o', stats);
    try {
      const resp = await axios.post(telemetryUrl, stats, {
        timeout: 120 * 1000,
      });
      logger.info('telemetry response: %s', JSON.stringify(resp.data));
    } catch (ex) {
      logger.warn('telemetry report failed');
    }
  } else {
    logger.info('not report to telemetry, storager is offline');
  }
}

async function collectStats(
  context: AppContext,
  logger: Logger,
): Promise<TelemetryData> {
  const { api, config, database, storagerApi } = context;
  const account = api.getChainAccount();
  const smangerInfo = collectSDataManagerInfo(config, context);

  const timeStart = getTimestamp() - ReportSlotDuration;
  const queueStats = await collectQueueInfo(database);
  const pinStats = await getPinStats(database, timeStart);

  const { deletedCount } = await database.get(
    `select count(*) as deletedCount from cleanup_record
      where status = "done" and last_updated > ? `,
    [timeStart],
  );
  const workload = await getStoragerWorkload(storagerApi, logger);
  let reportWL: StoragerStats;
  if (workload) {
    reportWL = {
      srd: {
        srd_complete: workload.srd.srd_complete,
        srd_remaining_task: workload.srd.srd_remaining_task,
        disk_available_for_srd: workload.srd.disk_available_for_srd,
        disk_available: workload.srd.disk_available,
        disk_volume: workload.srd.disk_volume,
        sys_disk_available: workload.srd.sys_disk_available,
        srd_volumn_count: Object.keys(workload.srd.srd_detail).length,
      },
      files: workload.files,
    };
  } else {
    reportWL = null;
  }

  return {
    chainAccount: account,
    smangerInfo,
    pinStats,
    storager: reportWL,
    groupInfo: context.groupInfo || {
      groupAccount: '',
      totalMembers: 0,
      nodeIndex: 0,
    },
    queueStats,
    cleanupStats: {
      deletedCount,
    },
    hasSealCoordinator: !!context.sealCoordinator,
  };
}

async function getStoragerWorkload(
  storagerApi: StoragerApi,
  logger: Logger,
): Promise<WorkloadInfo | null> {
  try {
    return await storagerApi.workload();
  } catch (e) {
    logger.error('failed to load storager workload: %s', formatError(e));
    return null;
  }
}

async function collectQueueInfo(database): Promise<QueueInfo> {
  const { pendingCount } = await database.get(
    `select count(*) as pendingCount from file_record
      where status in (${toQuotedList(PendingStatus)}) `,
  );
  const { pendingSize } = await database.get(
    `select sum(size) as pendingSize from file_record
      where status in (${toQuotedList(PendingStatus)}) `,
  );

  return {
    pendingCount,
    pendingSizeTotal: pendingSize || 0,
  };
}

function collectSDataManagerInfo(
  config: NormalizedConfig,
  context: AppContext,
): SDataManagerInfo {
  const schedulerConfig = config.scheduler;
  const version = process.env.npm_package_version || 'unknown';
  const uptime = Dayjs.duration(Dayjs().diff(context.startTime)).asSeconds();
  return {
    version,
    uptime,
    schedulerConfig,
  };
}

async function getPinStats(database, timeStart: number): Promise<PinStats> {
  const getPinRecordCountByStatus = async (status: PinStatus) => {
    return database.get(
      `select count(*) as count from pin_record where status = ? and last_updated > ?`,
      [status, timeStart],
    );
  };
  const { count: sealedCount } = await getPinRecordCountByStatus('sealed');
  const { count: failedCount } = await getPinRecordCountByStatus('failed');
  const { count: sealingCount } = await getPinRecordCountByStatus('sealing');
  const { sizeTotal } = await database.get(
    `select sum(size) as sizeTotal from pin_record
      where status = ? and last_updated > ?`,
    ['sealed', timeStart],
  );
  return {
    sealingCount,
    sealedCount,
    failedCount,
    sealedSize: sizeTotal || 0,
  };
}

export async function createTelemetryReportTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const reportInterval = Dayjs.duration({
    hours: 1,
  }).asMilliseconds();
  return makeIntervalTask(
    300 * 1000,
    reportInterval,
    'telemetry-report',
    context,
    loggerParent,
    handleReport,
  );
}
