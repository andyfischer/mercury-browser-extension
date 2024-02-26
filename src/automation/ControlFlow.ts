
// import { RunScriptAction, AttemptUpdate } from './ActionAttempt'
import { exposeFunc, Stream, captureException, ErrorItem, compileSchema, c_item, c_close } from '../rqe'

const VerboseLog = true;

/*
const actionList_schema = compileSchema<{id?: number, action: ActionAttempt, closed: boolean}>({
    name: 'ActionList',
    attrs: [
        'id(auto)',
        'action',
        'closed',
    ],
    funcs: [
        'get(id)',
        'each',
    ]
});

export async function waitFor(...actionsList: ActionAttempt[]) {
    let resolve, reject;

    const promise = new Promise((_res, _rej) => { resolve = _res, reject = _rej });

    function stop() {
        setImmediate(() => {
            for (const action of actions.each())
                action.action.cancel();
        });
    }

    if (VerboseLog)
        console.log('waitFor started');

    const actions = actionList_schema.createTable();

    for (const action of actionsList) {
        actions.insert({ action, closed: false });
    }

    function onClose(id) {
        console.log('waitFor: one operation has closed: ' + id);

        actions.get_with_id(id).closed = true;

        let anyOpen = false;
        for (const action of actions.each()) {
            if (!action.closed)
                anyOpen = true;
        }

        if (!anyOpen) {
            // All failed
            reject(new Error("all actions failed"))
        }
    }

    for (const action of actions.each()) {
        action.action.output.sendTo(evt => {
            switch (evt.t) {
            case c_item:
                const update: AttemptUpdate = evt.item;
                switch (update.t) {
                    case 'success':
                        console.log(`waitFor: one operation has succeeded (${action.id})`, update);
                        resolve(update.result);
                        break;
                    case 'permanent_fail':
                        onClose(action.id);
                        break;
                }
                break;
            case c_close:
                onClose(action.id);
                break;
            }
        });
    }

    return promise;
}
*/

export async function wait(secs:number) {
    await new Promise(resolve => setTimeout(resolve, secs * 1000));
}
