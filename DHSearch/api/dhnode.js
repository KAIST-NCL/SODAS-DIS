const crypto = require('crypto');
const { networkInterfaces } = require('os');

var util = require('../kademlia/utils');
var bucket = require('../kademlia/bucket');
var knode = require('../kademlia/knode');
var constants = require('../kademlia/constants');

exports.DHNode = function(desc) {
    this._address = this.getIpAddress()
    this._port = desc.port;
};

exports.getIpAddress = function() {

    const nets = networkInterfaces();
    const results = Object.create(null);

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {

            if (net.family === 'IPv4' && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
            else if (net.family === 'IPv6' && !net.internal){
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }

    return results["en0"][1];

}

exports.seedNodeInfo = function(desc){

    let seedNode = {
        nodeId: null,
        address: desc.address,
        port: desc.port,
        slPortNum: desc.slPortNum
    };

    seedNode.nodeId = crypto.createHash('sha1').update(seedNode.address + ':' + seedNode.port).digest('hex');

    return seedNode;

};
