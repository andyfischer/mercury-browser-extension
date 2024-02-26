
import { ErrorItem } from '../Errors'
import { Stream } from '../Stream'

const DefaultTimeoutMs = 5000;

interface QueuedMessage<MessageType> {
    req: MessageType
    output: Stream
}

export class MessageBuffer<MessageType = any> {
    pending: QueuedMessage<MessageType>[] = []
    timeoutMs: number
    timeoutTimer: any

    constructor({timeoutMs}: { timeoutMs?: number } = {}) {
        this.timeoutMs = timeoutMs || DefaultTimeoutMs;
    }

    push(req: MessageType, output: Stream) {
        this.pending.push({ req, output });

        if (!this.timeoutTimer)
            this.timeoutTimer = setTimeout(() => this.onTimeout(), this.timeoutMs);
    }

    onTimeout() {
        this.closeAllWithError({ errorType: 'timed_out' });
    }

    takeAll() {
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }

        const pending = this.pending;
        this.pending = [];
        return pending;
    }

    closeAllWithError(errorItem: ErrorItem) {
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }

        const pending = this.pending;
        this.pending = [];

        for (const { output } of pending) {
            output.closeWithError(errorItem);
        }
    }
}
