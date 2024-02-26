
import { Stream, StreamReceiver, StreamEvent, StreamDone, c_done, } from '../Stream'
export function joinStreams(count: number, output: Stream) {

    const receivers: Stream[] = [];
    let unfinishedCount = count;

    for (let i=0; i < count; i++) {
        const receiver = new Stream();
        receiver.sendTo({
            receive(data: StreamEvent) {

                if (data.t === c_done) {
                    if (unfinishedCount === 0)
                        throw new Error("joinStreams got too many 'done' messages");

                    unfinishedCount--;

                    if (unfinishedCount !== 0)
                        return;
                }

                output.receive(data);
            }
        });

        receivers.push(receiver);
    }

    return receivers;
}

