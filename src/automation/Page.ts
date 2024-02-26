
import { ActiveTabs } from '../station/ActiveTabs'
import { wait } from './ControlFlow'
import { RunScriptAction } from './RunScriptAction'
import { AutomationContext } from './AutomationContext'
import { c_item } from '../rqe'

export class Page {
    connection: any
    tabId: number

    constructor(connection: any, tabId: number) {
        this.connection = connection;
        this.tabId = tabId;
    }

    async updateUrl(url: string) {
        await this.connection.sendRequest({
            t: 'UpdateTab',
            tabId: this.tabId,
            update: {
                url,
            }
        });

        await this.waitForConnection();
    }

    async waitForConnection() {
        let attempts = 0;
        while (attempts < 5) {
            const found = ActiveTabs.get_with_tabId(this.tabId)
            if (found) {
                return;
            }
            await wait(0.5);
        }
        throw new Error("waitForConnection failed");
    }

    async runTask(callback: () => void) {
        const ctx = new AutomationContext(callback);
        ctx.contextVars.set('page', this);
        ctx.progress.sendTo(evt => {
            switch (evt.t) {
                case c_item:
                    console.log('task progress', evt.item);
                    break;
            }
        })
        await ctx.runUntilSettled();
    }

    async runScript(handler: Function) {

        /*
        const action = new RunScriptAction({
            tabId: this.tabId,
            connection: this.connection,
            params,
            runFunction
        });

        return action.wait();
        */

        /*
        if (typeof callback === 'function')
            callback = callback.toString();

        return action(() => {
            console.log('trying to RunFunction: ', callback);

            return this.connection.sendRequest({
                t: 'ContentScriptRequest',
                tabId: this.tabId,
                request: {
                    t: 'RunFunction',
                    functionStr: callback,
                    params,
                }
            });
        })
        */
    }
}
