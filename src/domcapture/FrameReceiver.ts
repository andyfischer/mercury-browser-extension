
import { CapturePrintFrames } from './Config'
import { PageChange, PageChangeMoment } from './PageChange'
import { OnCaptureEvent } from './CaptureEvents'

const FLUSH_DELAY_MS = 100;

/*
  FrameReceiver

  Receive PageChange events from various sources. Compile them into PageChangeMoment objects.
*/
export class FrameReceiver {

    buffer: PageChangeMoment[] = []
    nextHtmlBlockId = 1

    inProgress: PageChangeMoment
    storageStartedAt = Date.now()

    onCapture: OnCaptureEvent
    flushTimeout: any
    useFlushDelay: boolean
    recordingSessionId: any

    constructor({ onCapture, useFlushDelay, recordingSessionId }: { onCapture: OnCaptureEvent, useFlushDelay: boolean, recordingSessionId: any }) {
        this.useFlushDelay = useFlushDelay;
        this.onCapture = onCapture;
        this.recordingSessionId = recordingSessionId;
    }

    recentChildIdAssignments: Map<number, true>

    startNextFrame() {
        if (this.inProgress) {
            throw new Error('FrameReceiver.startNextFrame - already have inProgress');
        }

        this.inProgress = {
            t: 'moment',
            time: Date.now(),
            changes: [],
        }
    }

    addChange(d: PageChange) {
        if (!this.inProgress) {
            throw new Error('no event is in progress');
        }

        this.inProgress.changes.push(d);
    }

    finishFrame() {
        if (!this.inProgress)
            return;

        const newFrame = this.inProgress;
        this.inProgress = null;

        if (newFrame.changes.length === 0)
            return;

        // console.log('sending moment: ', newFrame);
        this.buffer.push(newFrame);

        if (CapturePrintFrames) {
            console.log(`recorded #${newFrame.time} (+${Date.now() - this.storageStartedAt}ms)`, newFrame);
        }

        if (this.useFlushDelay) {
            if (!this.flushTimeout) {
                this.flushTimeout = setTimeout(() => this.flush(), FLUSH_DELAY_MS);
            }
        } else {
            this.flush();
        }
    }

    flush() {
        const buffer = this.buffer;
        delete this.flushTimeout;
        this.buffer = [];

        // console.log('FrameReceiver sending frames', buffer);
        this.onCapture({
            t: 'CaptureFrames',
            frames: buffer,
            recordingSessionId: this.recordingSessionId,
        })
    }
}
