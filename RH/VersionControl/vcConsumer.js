const { Consumer } = require('../../DH/Lib/EventHandler/consumer/consumer');
const debug = require('debug')('sodas:vcConsumer');

class vcConsumer extends Consumer{
    constructor(kafkaHost, options, VC) {
        const topics = [ {topic:'recv2.rdf', partitions:0} ];
        console.log(kafkaHost,topics,options);
        super(kafkaHost, topics, options); 
        this.VC = VC; 
    }
    run(){
        debug('[RUNNING] kafka consumer for VC of RH is running');
        const that = this;
        this.consumer.on('message', function(message) {
            that.handler(message, that);
        });
    }
    // Kafka message received event handler
    handler(message, self){
        debug('[LOG] Kafka Message for RH is received');
        const message_ = JSON.parse(message.value);
        const event = message_.operation;
        const filepath = self.VC.vc.vcRoot + '/' + message_.type+ '/'+ message_.id + '.rdf';
        // do the operation right away
        self.VC.editFile(event, filepath,message_.type, message_.contents).then(() => {
            const commitMessage = message_.id;
            self.VC.commit(self.VC, filepath, commitMessage, message_);
        });
    }
}

exports.vcConsumer = vcConsumer;
