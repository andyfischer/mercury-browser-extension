
import { Stream, StreamEvent, StreamDone, c_done } from '../Stream'
interface AggregateData {
    t: 'aggregateData'
    streamIndex: number
    msg: StreamEvent
}

type AggregateEvent = AggregateData | StreamDone;

export function streamingAggregate(streams: Stream[], receiver: (event: AggregateEvent) => void) {

    let waitingForDone = streams.length;

    for (let i = 0; i < streams.length; i++) {
        streams[i].sendTo({
            receive(msg) {
                try {
                    receiver({
                        t: 'aggregateData',
                        streamIndex: i,
                        msg
                    });
                } catch (err) {
                    console.error(err);
                }

                if (msg.t === c_done) {
                    waitingForDone--;

                    if (waitingForDone === 0) {
                        receiver({ t: c_done });
                    }
                }
            }
        });
    }
}
