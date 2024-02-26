/**

Helper class for calling a function, but not calling it too often.

Every call is delayed by `delayMs` (default 0). Only one call is made
for each delay.

*/

export class Debounce {
    callback = null;
    delayMs: number
    pending = null;
    pendingArgs: any[]

    constructor(callback: (...args: any[]) => void, delayMs: number = 0) {
        this.delayMs = delayMs;
        this.callback = callback;
    }

    post(...args: any[]) {
        this.pendingArgs = args;
        if (!this.pending) {
            this.pending = setTimeout(() => this._fire(), this.delayMs);
        }
    }

    _fire() {
        delete this.pending;
        const args = this.pendingArgs;
        delete this.pendingArgs;
        this.callback.apply(null, args);
    }

    cancel() {
        clearTimeout(this.pending);
        delete this.pending;
    }
}

export function debounceCallback(delayMs: number, callback: () => void) {
    const debounce = new Debounce(callback, delayMs);
    return () => debounce.post();
}
