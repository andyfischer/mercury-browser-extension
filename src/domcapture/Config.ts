
// # Capture engine #

// Whether to include textContent when doing a "trackExisting" event. Helpful for debugging
// playback issues. Is superfluous when playback is working correctly.
export const CaptureIncludeExistingTextContent = false;

// Store the node's tracked ID as an HTML attribute. For debugging playback issues.
export const CaptureNodeIdAsAttributes = false;

// Print all incoming mutation records to the console.
export const CapturePrintMutationRecords = false;

// Print all captured events to the console.
export const CapturePrintFrames = false;

// Ignore the situation where a text node is already tracked when we're expecting to track
// a new section.
export const CaptureIgnoreAlreadyTrackedTextNodes = true;

// Whether to store the .trackedByRecord info in node medadata. For debugging capture issues.
export const CaptureTrackedByRecordMetadata = false;

// Whether to alert if it looks like we can't write properties to a DOM node.
export const CaptureAlertIfDomIsFrozen = true;

// Log style sheet modifications to the console
export const CaptureLogStyleSheetModification = true;
