
export function timedOut(p: Promise<any>, ms: number): Promise<boolean> {
    return new Promise(resolve => {

        p.then(() => resolve(false)).catch(() => resolve(false));

        const timer = new Promise(resolve => setTimeout(resolve, ms));

        timer.then(() => resolve(true));
    });
}

type Trigger = Promise<void> & { finish(val?:any): void, error(err?:any): void }

export function newTrigger(): Trigger {
    let _resolve;
    let _reject;

    const promise: Promise<any> = new Promise((resolve, reject) => {
        _resolve = resolve;
        _reject = reject;
    });

    (promise as Trigger).finish = _resolve;
    (promise as Trigger).error = _resolve;

    return promise as Trigger;
}
