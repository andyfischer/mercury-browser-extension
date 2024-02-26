
import { Stream, callbackToStream } from '../rqe'

export interface ClientScriptEvent {
    t: 'action'
    actionCode: 'click'
    success: boolean
    message?: string
    selector?: string
    failureCode?: string
}

export class ClientScriptHelper {
    output = new Stream<ClientScriptEvent>();

    tryClick(selector: string): boolean {
        const el = document.querySelector(selector) as HTMLElement;
        const message = `tried to click: ` + el;

        if (!el) {
            this.output.put({
                t: 'action',
                actionCode: 'click',
                selector,
                success: false,
                failureCode: 'element_not_found',
            });
            return false;
        }

        el.click();

        this.output.put({ t: 'action', actionCode: 'click', selector, success: true, });

        return true;
    }

    runCallback(functionStr: string, params: any[]) {
        // compile function
        console.log('RunFunction: ' + functionStr);
        const fn = new Function(`return (${functionStr})`)();

        params = [this].concat(params);

        callbackToStream(() => {
            return fn(params)
        }, this.output);
    }
}
