const PROTO_PATH = __dirname + '/protos/dhdaemon.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const DS = require('./daemonServer');
const { parentPort, workerData } = require('worker_threads');
const debug = require('debug')('sodas:daemon:server\t|');

// daemonServer
dServer = function(){

    // grpc option
    var packageDefinition = protoLoader.loadSync(
        PROTO_PATH,
        {keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.ds = this.protoDescriptor.daemonServer;
    this.port = workerData.dmPortNum;
    this.ip = workerData.disIp;
    this.knownHosts = workerData.knownHosts;
    this.name = workerData.name;
    this.dhList = [];
    this.sessList = [];
    this.rm = [];
};
// This method is only for test
dServer.prototype.testSetting = function(){
    this.dhList = [
        {name: 'KAIST', ip:'127.0.0.1', portNum:'50049', syncInterestList:['DO1.CA1', 'DO1.CA2']},
        {name: 'ETRI', ip:'127.0.0.1', portNum:'50048', syncInterestList:['DO1.CA1.CA11', 'DO1.CA3']}
    ];
    this.sessList = [
        {name: 'KAIST', ip:'127.0.0.1', portNum:'50049', syncInterestList:['DO1.CA1'],
            minSyncTime: 30, maxSyncTime: 500, syncCount: 10, transferInterface: 'gRPC', dataCatalogVocab: 'DCAT:V2'},
    ];
};
// gRPC service function (여기서는 this 대신 ds 사용해야함)
dServer.prototype.getDhList = function(call, callback){
    callback(null, {dhList: ds.dhList});
};
dServer.prototype.getSessionList = function(call, callback){
    callback(null, {sessionList: ds.sessList});
};
dServer.prototype.setInterest = function(call, callback){
    ds.syncInterestList = call.request.syncKeywords;
    ds._dmSetInterest(ds.syncInterestList);
    var DataHub = {
        name: ds.name,
        ip: ds.ip,
        portNum: ds.port,
        syncInterestList: ds.syncInterestList
    };
    callback(null,DataHub);
};
dServer.prototype.startSignal = function(call, callback){
    ds._dmStart();
    callback(null, null);
};
dServer.prototype.syncOnSignal = function(call, callback){
    ds._dmSyncOn();
    callback(null, null);
};
dServer.prototype.getDaemonServer = function(){
    this.server = new grpc.Server();
    this.server.addService(this.ds.daemonServer.service, {
        getDhList: this.getDhList,
        getSessionList: this.getSessionList,
        setInterest: this.setInterest,
        startSignal: this.startSignal,
        syncOnSignal: this.syncOnSignal
    });
    return this.server;
};
dServer.prototype.start = function(){
    self = this;
    this.daemonServer = this.getDaemonServer();
    this.daemonServer.bindAsync('0.0.0.0:'+ this.port,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('[RUNNING] DataHub daemon is running with '+ this.ip +':'+ this.port);
            this.daemonServer.start();
        });
    parentPort.on('message', function(message) {self._parentSwitch(message)});
};
// dServer methods
dServer.prototype._dmSetInterest = function(interestList){
    parentPort.postMessage({
        event: 'UPDATE_INTEREST_TOPIC',
        data: {interest: interestList}
    });
};
dServer.prototype._dmStart = function(){
    parentPort.postMessage({
        event: 'START',
        data: null
    });
};
dServer.prototype._dmSyncOn = function(){
    parentPort.postMessage({
        event: 'SYNC_ON',
        data: null
    });
};
dServer.prototype._parentSwitch = function(message){
    switch(message.event){
        case 'UPDATE_BUCKET_LIST':
            // TODO : parsing & fit the configuration
            this.dhList = message.data;
            break;
        case 'UPDATE_REFERENCE_MODEL':
            this.rm = message.data;
            break;
        case 'UPDATE_SESSION_LIST':
            this.sessionList = message.data;
            break;
        default:
            debug('[ERROR] DM-Server message error', message);
    }
};

exports.dServer = dServer;

// run daemonServer
const ds = new DS.dServer();
ds.testSetting(); // This function should be called only for test!
ds.start();
