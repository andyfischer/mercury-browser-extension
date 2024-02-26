
import { IDSource } from '../rqe'
import { Page } from './Page'
import { exposeFunc, Stream, captureException, ErrorItem, compileSchema, c_item, c_close, c_fail, c_done } from '../rqe'

let _currentAutomationContext: AutomationContext;

interface Operation {
    id?: number
    operationIndex: number
    name: string
    status: 'in_progress' | 'success' | 'temporary_failure' | 'permanent_failure'
    retryCount: number
    retryLimit: number

    responseStream?: Stream
    result?: any
}

type FailureType = 'temporary_failure' | 'permanent_failure'

type ProgressUpdate = {
    t: 'success'
} | {
    t: 'operation_success'
    id: number
    name: string
} | {
    t: 'operation_temporary_failure'
    id: number
    name: string
    message?: string
} | {
    t: 'operation_permanent_failure'
    id: number
    name: string
    message?: string
} | {
    t: 'starting_operation'
    id: number
    isRetry: boolean
    name: string
    message?: string
}

const OperationList = compileSchema<Operation>({
    name: 'Operation',
    attrs: [
        'id(auto)'
    ],
    funcs: [
        'get(id)',
        'get(operationIndex)',
        'count',
    ]
});

export class AutomationContext {
    operationIndex = 0
    operations = OperationList.createTable()
    ids = new IDSource()
    contextVars = new Map()
    retryTimer: any
    callback: () => void
    progress = new Stream<ProgressUpdate>()
    hasHadInitialRun = false

    constructor(callback) {
        this.callback = callback;
    }

    async runUntilSettled() {
        this.attempt();
    }

    isSettled() {
        if (!this.hasHadInitialRun)
            return false;

        let anyUnresolved = false;
        for (const op of this.operations.each()) {
            if (op.status === 'in_progress' || op.status === 'temporary_failure')
                anyUnresolved = true;
        }

        if (anyUnresolved)
            return false;

        return true;
    }

    attempt() {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
        
        if (this.isSettled()) {
            clearTimeout(this.retryTimer);
            return;
        }

        this.startAttempt();

        try {
            this.callback();
        } catch (err) {
            console.error('unhandled error in attempt', err);

        } finally {
            this.finishAttempt();

            if (!this.retryTimer)
                this.retryTimer = setTimeout(() => this.attempt(), 1000);
        }
    }

    startAttempt() {
        this.operationIndex === 0;

        if (_currentAutomationContext)
            throw new Error("AutomationContext.startAttempt: already have a context");

        _currentAutomationContext = this;
    }

    finishAttempt() {
        if (!_currentAutomationContext)
            throw new Error("AutomationContext.finishAttempt: no context in progress");

        _currentAutomationContext = null;
    }

    checkOrCreate({ name, startFn }) {
        let shouldExecute = false;
        let isRetry = false;
        let operation: Operation;

        if (this.operationIndex >= this.operations.count()) {
            operation = this.operations.insert({
                name,
                operationIndex: this.operationIndex,
                status: 'in_progress',
                retryCount: 0,
                retryLimit: 5,
            });
            this.operationIndex++;
            shouldExecute = true
        } else {
            operation = this.operations.get_with_operationIndex(this.operationIndex);
            if (operation.name !== name) {
                throw new Error(`context failure: expected (${name}) saw (${name})`)
            }
        }

        if (operation.status === 'temporary_failure') {
            if (operation.responseStream) {
                operation.responseStream.closeByDownstream();
                operation.responseStream = null;
            }
            shouldExecute = true;
            isRetry = true;
            operation.retryCount++;
        }

        if (shouldExecute) {
            setImmediate(() => {
                this.progress.put({ t: 'starting_operation', id: operation.id, name, isRetry });
                startFn(this, operation);
            });
        }

        return operation;
    }

    onOperationDone(id: number) {
        const op = this.operations.get_with_id(id);
        if (!op)
            throw new Error("not found");
        if (op.status !== 'in_progress')
            return;

        op.status = 'success'
        this.progress.put({ t: 'operation_success', id, name: op.name });
    }

    onOperationError(id: number) {
        const op = this.operations.get_with_id(id);
        if (!op)
            throw new Error("not found");
        if (op.status !== 'in_progress')
            return;

        let message = null;
        let failureType: FailureType = 'temporary_failure';

        if (op.retryCount >= op.retryLimit) {
            failureType = 'permanent_failure';
            message = `reached retry limit ${op.retryLimit}`
        }

        op.status = failureType;
        this.progress.put({
            t: (failureType == 'temporary_failure') ? 'operation_temporary_failure' : 'operation_permanent_failure',
            id,
            name: op.name,
            message
        });
    }
}

function assertContext() {
    if (!_currentAutomationContext)
        throw new Error("no context in progress");

    return _currentAutomationContext;
}

export function tryClick(selector: string) {
    const name = `tryClick(${selector})`;
    const ctx = assertContext();

    const op = ctx.checkOrCreate({
        name,
        startFn(ctx, operation) {
            const page: Page = ctx.contextVars.get('page');

            op.responseStream = page.connection.sendRequest({
                t: 'ContentScriptRequest',
                tabId: page.tabId,
                request: {
                    t: 'Automation/Click',
                    selector,
                }
            });

            op.responseStream.sendTo(evt => {
                // console.log(`operation result ${(operation.name)}: `, evt)
                switch (evt.t) {
                    case c_item:
                        op.result = evt.item;
                        break;
                    case c_done:
                        ctx.onOperationDone(op.id);
                        break;
                    case c_fail:
                        ctx.onOperationError(op.id);
                        break;
                }
            })

        }
    });
}
