
import { Stream, StreamEvent, c_done, c_close, c_start_updates, c_item, c_fail, c_schema } from '../Stream'

export class StreamProtocolValidator {
    description: string
    hasSentDone: boolean = false
    hasSeenFirstItem: boolean = false
    hasSentClose: boolean = false
    hasStartedUpdates: boolean = false

    constructor(description: string) {
        this.description = description;
    }

    check(msg: StreamEvent) {
        // After 'done', only certain messages are allowed (close, start_updates, fail)
        if (this.hasSentDone && !this.hasStartedUpdates && msg.t !== c_close && msg.t !== c_start_updates && msg.t !== c_fail) {
            const error = `Stream validation failed for (${this.description}), sent non-close message after done: ${JSON.stringify(msg)}`;
            console.error(error);
            throw new Error(error);
        }

        // After 'close' no events are allowed.
        if (this.hasSentClose) {
            const error = `Stream validation failed for (${this.description}), sent message after close: ${JSON.stringify(msg)}`;
            console.error(error);
            throw new Error(error);
        }

        // Can't send 'schema' after an 'item'
        if (msg.t === c_schema && this.hasSeenFirstItem) {
            const error = `Stream validation failed for (${this.description}), got 'schema' after 'item': ${JSON.stringify(msg)}`;
            console.error(error);
            throw new Error(error);
        }

        // Update state

        if (msg.t === c_item) {
            this.hasSeenFirstItem = true;
        }

        if (msg.t === c_done) {
            this.hasSentDone = true;
        }

        if (msg.t === c_close) {
            this.hasSentClose = true;
        }

        if (msg.t === c_start_updates) {
            this.hasStartedUpdates = true;
        }
    }
}

export function wrapStreamInValidator(description: string, after: Stream): Stream {
    const before = new Stream();
    const validator = new StreamProtocolValidator(description);

    before.sendTo({
        receive(msg) {
            validator.check(msg);
            after.receive(msg);
        }
    });

    return before;
}

