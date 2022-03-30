const fs = require('fs');
const path = require('path');
const diff_parser = require('../../../DH/Lib/diff_parser');
var kafka = require('kafka-node');
const {parentPort, workerData} = require('worker_threads');
const {publishVC,subscribeVC } = require('../../VersionControl/versionController')
const PROTO_PATH = __dirname + '/../proto/rmSessionSync.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const execSync = require('child_process').execSync;
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    })
const session_sync = grpc.loadPackageDefinition(packageDefinition).RMSessionSyncModule;
const session = require(__dirname + '/rmSession');
const debug = require('debug')('sodas:session');


/// Constructor
// workerData -> my_session_id, my_ip, my_portNum
exports.Session = function() {
    debug("[LOG] RH Session Created");
    debug(workerData);
    this.count_msg = 0;
    this.id = workerData.session_id;
    this.pubRM_dir = workerData.pubvc_root;
    this.VC= new publishVC(this.pubRM_dir);
    //this.VC.init();
    this.msg_storepath = this.pubRM_dir+'/msgStore.json'
    // Mutex_Flag for Git
    this.flag = workerData.mutex_flag; // mutex flag

    // FirstCommit Extraction from PubVC
    this._reset_count(this.VC.returnFirstCommit(this.VC, this.pubRM_dir));

    // Run gRPC Server
    this.ip = workerData.dh_ip;
    this.my_port = workerData.dh_port;
    this.server = new grpc.Server();
    var self = this;
    this.server.addService(session_sync.RMSessionSync.service, {
        // (1): Subscription from counter session
        SessionComm: (call, callback) => {
            self.Subscribe(self, call, callback);
        }
    });

    /// Thread Calls from Parent
    parentPort.on('message', message => {
        debug("[Session ID: " + this.id + "] Received Thread Msg ###");
        debug(message);
        switch(message.event) {
            // Information to init the Session
            case 'INIT':
                //this._init();
                break;
            // Information about counter session
            case 'TRANSMIT_NEGOTIATION_RESULT':
                // Get the counter session's address + port
                this.target = message.data.end_point.ip + ':' + message.data.end_point.port;
                console.log('[LOG] Target:' + this.target);
                debug('[LOG] Target:' + this.target);
                // gRPC client creation
                this.grpc_client = new session_sync.RMSessionSync(this.target, grpc.credentials.createInsecure());
                this.session_desc = message.data.session_desc;
                this.sn_options = message.data.sn_options; // sync_interest_list, data_catalog_vocab, sync_time, sync_count, transfer_interface
                break;
            // Things to publsih
            case 'UPDATE_REFERENCE_MODEL':
                this.count_msg += 1;
                this.prePublish(message.data);
                break;
        }
    });
}

/// Initiate Session
exports.Session.prototype._init = function() {
    const addr = this.ip+':'+this.my_port;
    this.server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), ()=> {
        this.server.start();
    });
}

/// [4]: hanldes the msg from Session Manager
// message: dict. data part of thread call "UPDATE_PUB_ASSET"
exports.Session.prototype.prePublish = function(message) {
    // save the things in message in a file as log
    // change log: Now only the commit number is needed
    // ToDo: Rather than calling this function whenever receiving the thread call from SM, call this function just like the vcModule calls commit function
    var content = this.__read_dict();
    content.stored = content.stored + 1;
    content.commit_number.push(message.data.commit_number);
    this.__save_dict(content);
    
    // When condition is met, publish things to the counter session
    if (this.__check_MaxCount()) this.onMaxCount();
}

/// If the count / sync time reaches some point, extract the git diff and publish it to other session
exports.Session.prototype.onMaxCount = async function() {
    this.count_msg = 0;
    debug("[LOG] onMaxCount");
    // Read file first and reset the file
    const topublish = this.__read_dict();
    this._reset_count(topublish.commit_number[topublish.commit_number.length - 1]);
    // git diff extraction
    this.extractGitDiff(topublish).then((git_diff) => {
        // Send gRPC message 
        this.Publish(git_diff);
    });
}

/// To extract git diff using two git commit numbers
// topublish: dict. Result of reading log file
exports.Session.prototype.extractGitDiff = async function(topublish) {
    // mutex 적용
    if (this.flag[0] == 1) {
        // retry diff
        const timeOut = 100;
        setTimeout(this.extractGitDiff.bind(this), timeOut, topublish);
    }
    else {
        // mutex on
        this.flag[0] = 1;
        var git_diff = execSync('cd ' + this.pubRM_dir + ' && git diff --no-color ' + topublish.previous_last_commit + ' ' + topublish.commit_number[topublish.stored - 1]);
        this.flag[0] = 0;
        // mutex off
        debug(git_diff);
        return git_diff;
    }
}

/// Reset count after publish
// last_commit: string. commit # of last git commit
exports.Session.prototype._reset_count = function(last_commit) {
    this.count_msg = 0;
    var lc = (typeof last_commit  === 'undefined') ? "" : last_commit;
    // 파일 초기화
    const content = {
        stored: 0,
        commit_number: [],
        previous_last_commit: lc
    }
    this.__save_dict(content);
}

/// [5]: Publish to the counter Session
// git_patch: string. Git diff Extraction result
exports.Session.prototype.Publish = function(git_patch) {
    debug("[LOG] Publish");
    // Change Log -> Now, does not send the related and filepath information through the gRPC. Subscriber extracts that information from git diff file

    // Make the message body to send
    var toSend = {'transID': new Date() + Math.random().toString(10).slice(2,3),
                  'git_patch': git_patch,
                  'receiver_id': this.session_desc.session_id};

    // gRPC transmittion
    this.grpc_client.SessionComm(toSend, function(err, response) {
        if (err) throw err;
        if (response.transID = toSend.transID && response.result == 0) {
            debug("[LOG] Publish Communication Successfull");
        }
        else {
            debug("[ERROR] Error on Publish Communication");
        }
    });
}

// Publish Condition Check
exports.Session.prototype.__check_MaxCount = function() {
    // If count is or is over sync_count
    // sync_count: [a,b] -> don't know the meaning yet 
    if (this.count_msg >= this.sn_options.sync_desc.sync_count[0]) return true;
    // TODO: If sync_time has passed -> need to implelement

    // Otherwise return false
    return false;
}

// Data Storing
exports.Session.prototype.__save_dict = function(content) {
    const contentJSON = JSON.stringify(content);
    fs.writeFileSync(this.msg_storepath, contentJSON);
}

exports.Session.prototype.__read_dict = function() {
    return JSON.parse(fs.readFileSync(this.msg_storepath.toString()));
}

const ss = new session.Session();
