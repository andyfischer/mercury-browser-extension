
import { FrameReceiver } from './FrameReceiver'
import { serializeArray } from './arrayUtils'
import { PageChangeType } from './PageChange'

function timeToSecondPK(time: number) {
    return Math.floor(time / 1000);
}

const BufferSize = 1024;
const FlushThreshold = 300;

/*
  MouseCapture

  Sample & capture mouse motion by listening to DOM 'mousemove' events. Send them to the Port.
*/

export default class MouseCapture {

    receiver: FrameReceiver
    buffer: Uint32Array
    writeIndex: number = 0
    currentSlice: number = 0
    currentSliceStartTime: number = 0

    constructor(receiver: FrameReceiver) {
        this.receiver = receiver;
        this.buffer = new Uint32Array(BufferSize / 4);
    }

    start() {
        document.addEventListener('mousemove', this.onMouseMove);
    }

    stop() {
        this.flush();
        document.removeEventListener('mousemove', this.onMouseMove);
    }

    onMouseMove = (e) => {
        const time = Date.now();
        const nowSlice = timeToSecondPK(time);

        if (nowSlice !== this.currentSlice) {
            this.flush();
            this.currentSlice = nowSlice;
            this.currentSliceStartTime = time;
        }

        if (this.writeIndex === 0) {
            // Write the buffer header
            this.buffer[this.writeIndex++] = 3; // stride
        }

        this.buffer[this.writeIndex++] = time - this.currentSliceStartTime;
        this.buffer[this.writeIndex++] = e.pageX;
        this.buffer[this.writeIndex++] = e.pageY;

        if (this.writeIndex > FlushThreshold)
            this.flush();
    }
   
    flush() {
        const time = Date.now();

        if (this.writeIndex === 0)
            return;

        this.receiver.startNextFrame();
        this.receiver.addChange({
            t: PageChangeType.MouseMovement,
            //time: this.currentSliceStartTime,
            //endTime: time,
            data: serializeArray(this.buffer.slice(0, this.writeIndex)),
        });

        this.writeIndex = 0;
        this.receiver.finishFrame();
    }
}
