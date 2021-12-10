const { Consumer } = require('../Lib/EventHandler/consumer/consumer');
const kafka = require('kafka-node');
const Producer = kafka.Producer;
const KeyedMessage = kafka.KeyedMessage;

class ctrlConsumer extends Consumer{
    constructor(kafkaHost, options, dhDaemon, conf){
        const topics = [ {topic:'send.datahub', partitions:0 } ];
        super(kafkaHost, topics, options);
        this.daemon = dhDaemon;
        this.conf = conf;
        this.referenceHubIP = conf.get('ReferenceHub', 'ip');
        this.referenceHubPort = conf.get('ReferenceHub', 'port');
    }
    onMessage = function(){
        console.log('[RUNNING] Kafka consumer for control signal is running ');
        const that = this;
        this.consumer.on('message', function(message){

            // JSON parsing error
            try {
                const message_ = JSON.parse(message.value);
                const event = message_.operation;
                const msg = message_.content;
                that.eventSwitch(event, msg);
            } catch (e){
                console.log(e);
                return;
            }
        });
    };
    eventSwitch = function(event, msg){
        switch(event){
            case 'START':
                this.daemon._rmSyncInit();
                break;
            case 'UPDATE':
                this.daemon._dhSearchUpdateInterestTopic(msg.interest);
                this.daemon._vcUpdateReferenceModel(msg.reference_model);
                this.daemon._smUpdateNegotiation(msg.negotiation_option);
                break;
            case 'SYNC_ON':
                if (this.daemon._smSyncOn() === -1)
                    this.daemon._raiseError('UPDATE IS NOT YET COMPLETED');
                break;
            default:
                break;
        }
    };
}


exports.ctrlProducer = function(kafkaHost){
    this.client = new kafka.KafkaClient({kafkaHost: kafkaHost});
    this.producer = new Producer(this.client);
    this.topic = 'recv.datahub';
};

exports.ctrlProducer.prototype.createCtrlTopics = async function(){
    // create topics for DHDaemon
    await this.client.createTopics([
        { topic: 'recv.datahub', partitions: 1 , replicationFactor: 1},
        { topic: 'send.datahub', partitions: 1, replicationFactor: 1},
        { topic: 'recv.asset', partitions: 1 , replicationFactor: 1},
        { topic: 'send.asset', partitions: 1, replicationFactor: 1}], function (err, data) {
    });
};

exports.ctrlProducer.prototype._produce = function(msg){
    const payloads = [{ topic: this.topic, value: msg }];
    this.producer.send(payloads, function(err, data){
        if(err) console.log(err);
    });
};

exports.ctrlProducer.prototype.sendError = function(errorCode){
    this._produce({'operation':'ERROR', 'error_code': errorCode});
};

exports.ctrlProducer.prototype.sendUpdate = function(id, data){
    this._produce({'operateion':'UPDATE', 'content':{'id':id, 'data':data}});
};

exports.ctrlConsumer = ctrlConsumer;