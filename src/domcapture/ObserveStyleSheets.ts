
import MutationRecord from './MutationRecord'
import { CaptureLogStyleSheetModification } from './Config'
import { NodeMetadataLayer } from './NodeMetadata'

/*
  ObserveStyleSheets

  Watch for changes to style sheets using the CSSOM API and record them in RewindMutationRecord events.
*/

function* styleSheets() {
    for (var i=0; i < document.styleSheets.length; i++) {
        yield document.styleSheets[i];
    }
}

export function checkAllStyleSheetsForChanges(nodeMetadata: NodeMetadataLayer) {
    let changes = [];

    for (const sheet of styleSheets())
        for (const change of checkStyleSheet(nodeMetadata, sheet))
            changes.push(change);

    return changes;
}

export function checkStyleSheet(nodeMetadata: NodeMetadataLayer, sheet: CSSStyleSheet): MutationRecord[] {

    const node = sheet.ownerNode;
    const nodeData = nodeMetadata.getOrInitialize(node);
    
    if (nodeData.styleSheetIgnore)
        return [];

    const lastObservedIndex = nodeData.styleSheetLastObserved || 0;
    let ruleCount: number;

    try {
        ruleCount = sheet.cssRules.length;
    } catch (e) {
        // this can trigger DOMException, looks like it happens on cross origin
        // <link> tags. Hopefully these can be safely ignored. It's probably
        // the case that CSSOM doesn't work on these anyway?
        nodeData.styleSheetIgnore = true;
        return [];
    }

    if (lastObservedIndex < ruleCount) {

        nodeData.styleSheetLastObserved = ruleCount;

        // current: always record from startIndex: 0
        // future: optimize to only record diff in rules.

        if (CaptureLogStyleSheetModification) {
            console.log('observed a style sheet modification', { lastObservedIndex, ruleCount, target: sheet.ownerNode, sheet });
        }
        const event: MutationRecord = {
            type: 'styleRules',
            target: sheet.ownerNode,
            startIndex: 0,
        }

        return [event];
    }

    return [];
}
