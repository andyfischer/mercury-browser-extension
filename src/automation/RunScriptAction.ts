
import { exposeFunc, Stream, captureException, ErrorItem, compileSchema, c_item, c_close, c_fail, c_done } from '../rqe'
import { ClientScriptEvent } from './ClientScriptHelper'

export type AttemptUpdate = AttemptSuccess | AttemptFail | AttemptPermanentFail

export interface AttemptSuccess {
    t: 'success'
    result: any
}

export interface AttemptFail {
    t: 'attempt_fail'
    error: ErrorItem
    attemptCount?: number
}

export interface AttemptPermanentFail {
    t: 'permanent_fail'
    error: ErrorItem
    attemptCount?: number
}

interface Args {
    tabId: number
    runFunction: string | Function
    params: any[]
    connection: any
}

export class RunScriptAction {
    args: Args
    output = new Stream<AttemptUpdate>()
    attemptCallback: () => Promise<AttemptUpdate>
    attemptCount = 0;
    retryTimer: any
    maxAttempts = 20
    retryDelay = 500

    constructor(args: Args) {
        this.args = args;
        // this.attemptCallback = attemptCallback;
        setImmediate(() => this._attempt());
    }

    _attempt() {

        // console.log('starting attempt..');

        let functionStr: string;

        if (typeof this.args.runFunction === 'string')
            functionStr = this.args.runFunction;
        else
            functionStr = this.args.runFunction.toString();
        
        const response = this.args.connection.sendRequest({
            t: 'ContentScriptRequest',
            tabId: this.args.tabId,
            request: {
                t: 'RunFunction',
                functionStr,
                params: this.args.params,
            }
        });

        let hasFailed = false;

        const onError = (error: ErrorItem) => {
            if (hasFailed)
                return;
            
            hasFailed = true;
            response.closeByDownstream();
            clearTimeout(timeout);

            if (this.attemptCount >= this.maxAttempts) {
                this.output.put({ t: 'permanent_fail', attemptCount: this.attemptCount, error });
                this.output.finish();
                return;
            }

            this.output.put({ t: 'attempt_fail', attemptCount: this.attemptCount, error });

            if (this.retryTimer)
                clearTimeout(this.retryTimer);

            this.attemptCount++;
            this.retryTimer = setTimeout((() => {
                this._attempt();
            }), this.retryDelay);
        }

        const timeout = setTimeout(() => {
            onError({ errorType: 'timed_out' });
        }, 5000);

        response.sendTo(evt => {
            if (hasFailed)
                return;

            // console.log('RunFunction response', evt)

            switch (evt.t) {

            case c_item: {
                const update: ClientScriptEvent = evt.item;
                // console.log('RunFunction update', update)
                break;
            }

            case c_done:
                clearTimeout(timeout);
                break;

            case c_fail: {
                onError(evt.error);
                break;
            }
            }
        });
    }

    wait() {
        let resolve, reject;
        const promise = new Promise((_res, _rej) => { resolve = _res, reject = _rej })

        this.output.sendTo(evt => {

            // console.log('RunScriptAction.wait saw', evt);

            switch (evt.t) {
            case c_item:
                const update: AttemptUpdate = evt.item;
                switch (update.t) {
                case 'success':
                    resolve();
                    break;
                case 'permanent_fail':
                    reject(update.error);
                    break;
                }
                break;
            }
        });

        return promise;
    }

    /*
    onResult(result: AttemptUpdate) {
        switch (result.t) {
            case 'fail': {
                this.output.put(result);

                if (this.attemptCount >= this.maxAttempts) {
                    this.output.put({ t: 'permanent_fail' });
                    this.output.finish();
                    return;
                }

                if (this.retryTimer)
                    clearTimeout(this.retryTimer);

                this.attemptCount++;
                this.retryTimer = setTimeout((() => {
                    this._attempt();
                }), this.retryDelay);
            }
            break;

            case 'success':
                this.output.put(result);
                this.output.finish();
                break;
            default:
                console.error('RunScriptAction.onResult unrecognized', result);
        }
    }
    */

    cancel() {
        this.output.closeByDownstream()
        clearTimeout(this.retryTimer);
    }
}
