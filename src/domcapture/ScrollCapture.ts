
import { FrameReceiver } from './FrameReceiver'
import { PageChangeType } from './PageChange'

function timeToSecondPK(time: number) {
    return Math.floor(time / 1000);
}

function secondPKToStartTime(secondPK: number) {
    return secondPK * 1000;
}

const BufferSize = 1024;

export default class ScrollCapture {

    receiver: FrameReceiver
    buffer: Uint32Array
    writeIndex: number = 0
    currentPartitionKey: number = 0
    currentPartitionKeyStart: number = 0

    constructor(receiver: FrameReceiver) {
        this.receiver = receiver;
        this.buffer = new Uint32Array(BufferSize / 4)
    }

    start() {
        document.addEventListener('scroll', this.onScroll, true);
    }

    stop() {
        this.flush();
        document.removeEventListener('scroll', this.onScroll, true);
    }

    onScroll = (e) => {
        const time = Date.now();
        const partitionKey = timeToSecondPK(time);

        if (partitionKey !== this.currentPartitionKey) {
            this.flush();
            this.currentPartitionKey = partitionKey;
            this.currentPartitionKeyStart = secondPKToStartTime(partitionKey);
        }

        if (e.srcElement === document) {
            this.buffer[this.writeIndex] = time - this.currentPartitionKeyStart;
            this.buffer[this.writeIndex+1] = 0;  // element identifier
            this.buffer[this.writeIndex+2] = window.scrollY;
            this.writeIndex += 3;

            if (this.writeIndex > 300)
                this.flush();
        }
    }
   
    flush() {
        if (this.writeIndex === 0)
            return;

        this.receiver.startNextFrame();
        this.receiver.addChange({
            t: PageChangeType.ScrollMovement,
            data: String.fromCharCode.apply(null, this.buffer.slice(0, this.writeIndex)),
        });
        this.writeIndex = 0;
        this.receiver.finishFrame();
    }
}
