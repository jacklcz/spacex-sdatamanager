# spacex-sdatamanager
sDataManager (Storage Manager) is a file picking bot which continuously picking and handling files from SpaceX Network. Node operators can customize this module to implement their own file handling strategy. sDataManager maintains a local database to help making decision on pulling files.

## Local Database
The local database stores below information:
1. **File Records**: The files metadata(tips, size, replicas count, expire time etc.) on SpaceX Network.
2. **File and Owner Relationship**: sDataManager also maintains the relationship between a file and an on-chain account. This information will help making better pulling decision.
3. **Chain Metadata**: e.g. the block and time on chain.
4. **Pin Records**: The pin history of files.
5. **Cleanup Records**: The files needs to removed from local filesystem, normally this is triggered when a file expires on SpaceX Network.

Checkout [Db Schema](db-schema.md) for the schema details.

## Components
sDataManager was designed to have serveral tasks running independently. Tasks are either scheduled by the block event or by configured intervals. Each task plays as an actor which consumes/produces some information and communicate with other tasks through the db or applicaion context.

sDataManager follows the **Fails Early** priciple which means it will shutdown on any unexpected error. To support this priciple, tasks are designed to be recoverable after application restarts.

Below are a list of components that sDataManager has implemented.
### Indexers
Indexers extract information into the local database from various data sources. Currently sDataManager has implemented below indexers:
1. **Chain Database Indexer**: indexes file records from the SpaceX Network on-chain database.
2. **Chain Event Indexer**: indexes file records by listening latest chain event.
3. **Chain Time Indexer**: a simple indexer which push the latest block height and it's timestamp to the config table.

### Simple Tasks
Simple tasks are speciualized tasks which runs periodly. Currently sDataManager has implemented below tasks:
1. **Group Info Updater**: Update storager identity information from storager api.
2. **Ipfs Gc**: Schedule ipfs gc periodly.
3. **Telemetry Reporting**: Report sDataManager statistics information to the telemetry server.
4. **Pull Scheduler**: Schedule file pulling based on configured strategey.
5. **Seal Status Updater**: Update sealing status periodly.
6. **File Retry Task**: Retry pulling if possible.
7. **File Cleanup Task**: Cleanup deleted files from local filesystem.

## Usage

1. Clone repo

```shell
git clone https://github.com/mannheim-network/spacex-sdatamanager
```

2. Installing
It's recommended to use `volta` as the node version manager. Please follow the [volta docs](https://docs.volta.sh/guide/getting-started) to install it.

```shell
cd spacex-sdatamanager && npm i
```

3. Debug

```shell
npm run dev
```

4. Run in Prod
```shell
npm run build
npm start
```

It's recommended to run sDataManager using Docker with the `restart=always` restart policy.

A daemon guard should be configured if you want to run sDataManager natively without docker. Tools like `pm2` and `nodemon` could be used.

## Configuration

Checkout [sdatamanager-config.example.json](data/sdatamanager-config.example.json)

Those config items will be configured in the sDataManager configuration setup process. The meaning of each item is as follows:

* chain.account: your member account
* chain.endPoint: your chain endpoint
* storager.endPoint: your storager endpoint
* ipfs.endPoint: your IPFS endpoint
* dataDir: the directory of the database of sDataManager
* scheduler.minSrdRatio: a minimum ratio of SRD that one node can start to accept storage orders.

    > For example, if the ratio is 30, then your node will start to accept storage order once the ratio of SRD capacity is higher than 30%

* scheduler.strategy.dbFilesWeight: how much bandwidth of this node will be used to fetch and store the history storage orders(Storage orders in the past four months).
* scheduler.strategy.newFilesWeight: how much bandwidth of this node will be used to fetch and store the newest storage orders.
