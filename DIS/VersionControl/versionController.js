const { Git } = require(__dirname + '/../Lib/git');
const { ref_parser } = require('../Lib/ref_parser');
const debug = require('debug')('sodas:versionController|');

class VC {

    static Flag = false;
    static FirstCommit = 'asdfasdf';

    constructor(gitDir, refRootdir) {
        this.vcRoot = gitDir;
        this.git = new Git(this.vcRoot);
        this.dir_list = [];
        this.isInit = false;
        if(typeof refRootdir === 'string') this.rp = new ref_parser(this.vcRoot, refRootdir);
    }

    async init(){
        var value = '';
        await this.git.init()
            .then((commnum) => {
            value = (' ' + commnum).slice(1);
            })
            .catch((e) => {debug(e)});
        this.isInit = true;
        return value;
    }

    // Change Log -> Below two functions need self as new argument
    addReferenceModel(self, ReferenceModel) {
        self.rp.addReferenceModel(ReferenceModel);
    }

    returnFirstCommit(self, dir) {
        return self.git.getInitCommit(dir);
    }
}

class publishVC extends VC{
    // static class variable (mutex)
    constructor(gitDir, refRootdir) {
        super(gitDir, refRootdir);
    }
    async commit(filepath, message, vm){
        // Flag가 0이면 열린 상태, 1이면 잠긴 상태
        if(vm.flag[0] == 1){
            // retry commit
            const timeOut = 100;
            setTimeout(this.commit.bind(this), timeOut, filepath, message, vm);
        }else{
            // MUTEX ON
            vm.lockMutex(vm);
            debug('[PublishVC Event]: - bind because of Mutex');
            debug(message);
            var commitNum = await this.git.commit(filepath, message);
            debug(commitNum);
            // MUTEX OFF
            vm.unlockMutex(vm);
            debug('[PublishVC Event]: - Mutex unlock');
            debug(message);
            if (commitNum != '') vm.reportCommit(vm, commitNum);
        }
    }
}

class subscribeVC extends VC{
    constructor(gitDir, refRootdir) {
        super(gitDir, refRootdir);
    }
    
    async commit(filepath, message){
        // commit 처리할 때 mutex 없게 수정해야함
        await this.git.commit(filepath, message);
    }

    apply(gitPatch) {
        this.git.apply(gitPatch);
    }
}


exports.VC = VC;
exports.publishVC = publishVC;
exports.subscribeVC = subscribeVC;