
import { PageChangeMoment } from './PageChange'

export interface CaptureFrames {
    t: 'CaptureFrames',
    frames: PageChangeMoment[]
    recordingSessionId: any
}

export type OnCaptureEvent = (event: CaptureFrames) => void
