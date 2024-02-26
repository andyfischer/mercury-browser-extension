
import { Stream, c_item, c_close, c_done, c_fail } from '../Stream'
/*
export class MessageGroupBuffer<MessageType> {
    buffer: MessageType[] = []
    timer = null
    delayMs: number
    onFlush(messages

    constructor(delayMs: number, onFlush: (messages: MessageType[]) => void) {
        this.delayMs = number

    }

    post(message: MessageType) {
        this.buffer.push(
    }
}
*/

interface Options {
    delayMs: number
}

export function delayedBatchBuffer<MessageType>(options: Options): [ Stream<MessageType> , Stream<Array<MessageType>> ] {
    const input = new Stream();
    const output = new Stream();

    let flushTimer = null;
    let buffer: MessageType[] = []

    function flush() {
        if (buffer.length === 0)
            return;

        if (output.isClosed())
            return;

        let outgoing = buffer;
        buffer = [];
        output.put(outgoing);
    }

    input.sendTo(evt => {
        switch (evt.t) {
        case c_item:
            buffer.push(evt.item);

            if (!flushTimer) {
                flushTimer = setTimeout(flush, options.delayMs);
            }
            break;
        case c_done:
        case c_close:
        case c_fail:
            flush();
            output.receive(evt);
            break;
        default:
            output.receive(evt);
        }
    });

    return [ input, output ];
}

