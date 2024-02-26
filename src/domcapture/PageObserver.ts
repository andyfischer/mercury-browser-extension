
/*
  PageObserver

  Top level object that handles capturing a recorded session.

  This includes

   - Launching the MutationObserver and using digestMutationRecords to record the DOM event stream.
   - Launching other helpers (MouseCapture, ScrollCapture) to capture non-DOM elements of playback.
   - Send the data to FrameReceiver where it will be stored/uploaded.

*/

import { FrameReceiver } from './FrameReceiver'
import { TargetSpec, LooseTargetSpec, resolveTargetSpec } from './TargetSpec'
import { Location, getWindowLocation } from './Location'
import { RateTracker } from '../rqe/utils/RateTracker'
import { digestMutationRecords } from './digestMutationRecords'
import { checkAllStyleSheetsForChanges } from './ObserveStyleSheets'
import MutationRecord from './MutationRecord'
import ScrollCapture from './ScrollCapture'
import MouseCapture from './MouseCapture'
import { IDSource } from '../rqe/utils/IDSource'
import { OnCaptureEvent } from './CaptureEvents'
import { NodeMetadataLayer } from './NodeMetadata'
import { CaptureTrackedByRecordMetadata } from './Config'
import { PageChangeType } from './PageChange'

interface RecordingSummary {
    location: Location
    captureIssueCount: number
}

export class PageObserver {
    receiver: FrameReceiver
    targets: TargetSpec
    observer: MutationObserver
    scrollCapture: ScrollCapture
    mouseCapture: MouseCapture
    nextRecordIndex = new IDSource()
    isRunning: boolean = false
    isHandlingOnObserve = false
    currentRecordingSummary: RecordingSummary
    nodeMetadata: NodeMetadataLayer

    incomingEventRate: RateTracker
    errorRate: RateTracker

    constructor(params: { targetSpec: LooseTargetSpec, onCapture: OnCaptureEvent, useFlushDelay: boolean, recordingSessionId: any }) {

        const { targetSpec, onCapture, useFlushDelay, recordingSessionId } = params;

        this.targets = resolveTargetSpec(targetSpec);
        this.receiver = new FrameReceiver({ onCapture, useFlushDelay, recordingSessionId });
        this.observer = new MutationObserver(this.onObserve);
        this.scrollCapture = new ScrollCapture(this.receiver)
        this.mouseCapture = new MouseCapture(this.receiver);
        this.nodeMetadata = new NodeMetadataLayer();

        this.errorRate = new RateTracker(5, 5000, () => {
            this.stop();
            console.log(`Stopping recording (too many errors, recently saw ${this.errorRate.count})`)
        });
    }

    start() {
        this.currentRecordingSummary = {
            location: getWindowLocation(),
            captureIssueCount: 0
        };

        this.receiver.startNextFrame();

        this.receiver.addChange({
            t: PageChangeType.RecordingStarted,
            location: this.currentRecordingSummary.location
        });

        // Initial capture for all targets.
        for (const { el, name, shallow } of this.targets) {

            const nodeData = this.nodeMetadata.initializeNode(el);
            nodeData.isTracked = true;

            if (CaptureTrackedByRecordMetadata) {
                this.nodeMetadata.getMetadata(el).trackedByRecord = 'initial';
            }

            let html = null;

            if (!shallow)
                html = el.innerHTML;

            this.receiver.addChange({
                t: PageChangeType.InitRoot,
                id: nodeData.id,
                name,
                html,
            })

            for (let attrIndex = 0; attrIndex < el.attributes.length; attrIndex++) {
                this.receiver.addChange({
                    t: PageChangeType.Attribute,
                    id: nodeData.id,
                    attributeName: el.attributes[attrIndex].name,
                    value: el.attributes[attrIndex].value
                });
            }

            const observeDeep = !shallow;

            this.observer.observe(el, {
                subtree: observeDeep,
                childList: observeDeep,
                attributes: true,
                attributeOldValue: false,
                characterData: observeDeep,
                characterDataOldValue: false,
            });
        }

        this.scrollCapture.start();
        this.mouseCapture.start();

        // Capture initial style sheets.
        /* Disabled for now (needs fixing)
         
        digestMutationRecords(this.nodeMetadata,
                              checkAllStyleSheetsForChanges(this.nodeMetadata),
                              this.nextRecordIndex.take(),
                              this.receiver);
                              */

        this.receiver.finishFrame();
        this.isRunning = true;
    }

    stop() {
        this.scrollCapture.stop();
        this.mouseCapture.stop();
        this.observer.disconnect();
        this.isRunning = false;
        this.currentRecordingSummary = null;
    }

    onObserve = (records: MutationRecord[]) => {
        if (records.length === 0)
            return;

        if (this.isHandlingOnObserve) {
            console.error('onObserve called while we are already handling a call?');
        }

        this.isHandlingOnObserve = true;

        const recordIndex = this.nextRecordIndex.take();

        try {
            if (!this.isRunning) {
                // Avoid reporting straggler events after recording is turned off.
                return;
            }

            this.receiver.startNextFrame();

            // records = records.concat(checkAllStyleSheetsForChanges(this.nodeMetadata));
            digestMutationRecords(this.nodeMetadata, records, recordIndex, this.receiver);

        } catch (e) {
            console.error('onObserve threw error: ' + (e.stack || e));
        } finally {
            this.isHandlingOnObserve = false;
            this.receiver.finishFrame();
        }
    }

    warning(...args: any[]) {
        if (!this.isRunning)
            return;

        console.log.apply(null, ['warning:'].concat(args));
    }

    error(...args: any[]) {
        if (!this.isRunning)
            return;

        this.errorRate.inc();
        console.error.apply(null, args);
    }
}
