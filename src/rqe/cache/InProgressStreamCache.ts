
import { StreamReceiver, StreamEvent, c_done, c_fail } from '../Stream'

interface Options {
    onFinish(stream: InProgressStreamCache): void
}

export class InProgressStreamCache {
    /*
     * InProgressStreamCache
     *
     * Stores all events in a list for later caching.
     *
     * Also supports having any number of downstream listeners. When a listener
     * is added it will receive all the past events.
     */

    receivedEvents: StreamEvent[] = []
    listeners: StreamReceiver[] = []
    sawError = false
    options: Options

    constructor(options: Options) {
        this.options = options;
    }

    addListener(receiver: StreamReceiver) {
        this.listeners.push(receiver);

        for (const evt of this.receivedEvents)
            receiver.receive(evt);
    }

    receive(evt: StreamEvent) {
        this.receivedEvents.push(evt);

        if (evt.t === c_fail)
            this.sawError = true;

        if (evt.t === c_done) {
            this.options.onFinish(this);
        }

        for (const listener of this.listeners)
            listener.receive(evt);
    }
}
