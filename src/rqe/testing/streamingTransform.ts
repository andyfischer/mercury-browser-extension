
import { Stream, StreamReceiver, StreamEvent, c_item, c_done } from '../Stream'

type Item = any
export type StreamingTransformFunc = (item: Item) => Stream

export interface StreamingTransformOptions {
    maxConcurrency?: number
}

export function streamingTransform(from: Stream, receiver: StreamReceiver, callback: StreamingTransformFunc, options: StreamingTransformOptions = {}) {

    let incomingHasFinished = false;
    let unfinishedStreams = 0;

    const incomingQueue = [];

    function startItem(item: Item) {
        const thisResult = callback(item);
        unfinishedStreams++;

        thisResult.sendTo({
            receive(msg) {
                switch (msg.t) {
                case c_done:
                    // console.log('mapStreamForEachItem saw stream end');
                    unfinishedStreams--;
                    maybePopFromQueue();
                    if (incomingHasFinished && unfinishedStreams === 0) {
                        // console.log('mapStreamForEachItem done (2)');
                        receiver.receive({t: c_done});
                    }
                    break;
                case c_item:
                    receiver.receive({t:c_item, item: msg.item});
                    break;
                default:
                    receiver.receive(msg);
                }
            }
        });
    }

    function atConcurrencyLimit() {
        if (options.maxConcurrency) {
            return unfinishedStreams >= options.maxConcurrency;
        }

        return false;
    }

    function maybePopFromQueue() {
        while (incomingQueue.length > 0 && !atConcurrencyLimit()) {
            const next = incomingQueue.shift();
            startItem(next);
        }
    }

    from.sendTo({
        receive(msg) {
            switch (msg.t) {
            case c_done:
                incomingHasFinished = true;

                if (incomingHasFinished && unfinishedStreams === 0) {
                    // console.log('mapStreamForEachItem done (1)');
                    receiver.receive({t: c_done});
                }
                
                break;
            case c_item: {
                const item = msg.item;

                if (atConcurrencyLimit()) {
                    // we're at the limit, stick it on the queue.
                    incomingQueue.push(item);
                    return;
                }

                startItem(item);
                break;
            }
            default:
                receiver.receive(msg);
                break;
            }
        }
    });
}
