import {
  NormalizedConfig,
  SDataManagerConfig,
  StrategyConfig,
  StrategyWeights,
} from '../types/sdatamanager-config';
import fse from 'fs-extra';
import { validateConfig } from './config.schema';
import _ from 'lodash';
import { logger } from '../utils/logger';

const defaultsStrategyWeights: StrategyWeights = {
  dbFilesWeight: 50,
  newFilesWeight: 50,
};

const srdFirstStrategyWeights: StrategyWeights = {
  dbFilesWeight: 80,
  newFilesWeight: 10,
};

const newfileFirstStrategyWeights: StrategyWeights = {
  dbFilesWeight: 20,
  newFilesWeight: 80,
};

function getNormalizedWeights(strategy: StrategyConfig): StrategyWeights {
  switch (strategy) {
    case 'default':
      return defaultsStrategyWeights;
    case 'srdFirst':
      return srdFirstStrategyWeights;
    case 'newFileFirst':
      return newfileFirstStrategyWeights;
    default: {
      // normaliz weights to percentage based weights
      const weights = [strategy.dbFilesWeight, strategy.newFilesWeight];
      const totalWeights = _.sum(weights);
      if (totalWeights > 0) {
        const normalized = _.map(weights, (w) => (w / totalWeights) * 100);
        return {
          dbFilesWeight: normalized[0],
          newFilesWeight: normalized[1],
        };
      }

      logger.warn('invalid strategy weights configured, using default weights');
      return defaultsStrategyWeights;
    }
  }
}

export function normalizeConfig(config: SDataManagerConfig): NormalizedConfig {
  return {
    ...config,
    scheduler: {
      ...config.scheduler,
      strategy: getNormalizedWeights(config.scheduler.strategy),
    },
  };
}

export async function loadConfig(file: string): Promise<NormalizedConfig> {
  const c = await fse.readFile(file, 'utf8');
  const config = validateConfig(JSON.parse(c));
  return normalizeConfig(config);
}
