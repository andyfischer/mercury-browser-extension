
/*
  Algorithm:

   Every target needs to be tracked
      For a node to be tracked, its parents need to be tracked. All the way up to a root tracked node.
  
    In order to track an untracked node:
      Look at ancestors
      Assign IDs to every ancestor that's static (no childList event)
      If we find a childList affected node, then don't assign IDs to its children.
      Instead this node will get a walk.
  
    Once tracked then we can record attribute / characterData / childList events.
    
    For every childList event:
      Record a list of child IDs, including HTML for brand new children.
    
    Things to watch out for:
      If we record HTML for an element, don't need to record anything for its children.
   
      If a node is an orphan (no tracked ancestor) then ignore it.
  
      If a node had no childList event, and none of its ancestors had a childList, then it's 'static'.
      We can assign IDs to the children of static nodes.
  
      Try to record events in the right order!
*/

import MutationRecord from './MutationRecord'
import { FrameReceiver } from './FrameReceiver'
import { CapturePrintMutationRecords,
    CaptureIncludeExistingTextContent,
    CaptureNodeIdAsAttributes,
    CaptureIgnoreAlreadyTrackedTextNodes } from './Config'
import { IDSource } from '../rqe/utils/IDSource'
import { logError } from '../rqe/logger'
import { UpdatedChildrenElement, ChildUpdateType, PageChangeType } from './PageChange'
import { NodeMetadataLayer } from './NodeMetadata'
import { CaptureTrackedByRecordMetadata } from './Config'

function* eachTargetAndAddedNode(records: MutationRecord[]) {
    for (const record of records) {
        if (record.target)
            yield record.target;

        if (record.addedNodes)
            for (const node of (record.addedNodes as any).values())
                yield node;
    }
}

function* eachAddedNode(records: MutationRecord[]) {
    for (const record of records)
        if (record.addedNodes)
            for (const node of (record.addedNodes as any).values())
                yield node;
}

function* eachTarget(records: MutationRecord[]) {
    for (const record of records)
        if (record.target)
            yield record.target;
}

function* eachChildListTarget(records: MutationRecord[]) {
    for (const record of records)
        if (record.type === 'childList' && record.target)
            yield record.target;
}

function mutationRecordToObject(record: MutationRecord) {
    return {
        type: record.type,
        target: record.target,
        addedNodes: Array.from(record.addedNodes || []),
        removedNodes: Array.from(record.removedNodes || []),
        attributeName: record.attributeName,
        nodeValue: (record.target && record.target.nodeValue),
    }
}

class MutationDigest {
    recordIndex: number
    addedNodes = new Map<number, Node>()
    hadChildListChange = new Map<number, Node>()
    assignChildIDsOnExisting = new Map<number, Node>()
    hasRecordedUpdateChildren = new Map<number,true>()
    nodeMetadata: NodeMetadataLayer
    receiver: FrameReceiver

    constructor(nodeMetadata: NodeMetadataLayer, recordIndex: number, receiver: FrameReceiver) {
        this.nodeMetadata = nodeMetadata;
        this.recordIndex = recordIndex;
        this.receiver = receiver;
    }

    getOrAssignId(node: Node) {
        if (this.nodeMetadata.hasMetadata(node))
            return this.nodeMetadata.getId(node);

        const metadata = this.nodeMetadata.initializeNode(node);

        if (CaptureTrackedByRecordMetadata) {
            metadata.trackedByRecord = this.recordIndex;
        }

        return metadata.id;
    }

    lookForStaticTrackedAncestor(node: Node) {
        const parent = node.parentNode;

        if (!parent)
            // Orphan node.
            return null;

        if (this.nodeMetadata.hasMetadata(parent) && this.hadChildListChange.has(this.nodeMetadata.getId(parent)))
            // Parent is not static.
            return null;

        if (this.nodeMetadata.hasMetadata(parent) && this.nodeMetadata.getMetadata(parent).isTracked)
            // Success
            return parent;

        return this.lookForStaticTrackedAncestor(parent);
    }

    captureCreateChildNode(node: Node): UpdatedChildrenElement {
        const id = this.getOrAssignId(node);
        this.nodeMetadata.getMetadata(node).isTracked = true;

        switch (node.nodeType) {
        case Node.ELEMENT_NODE:
            return {
                t: ChildUpdateType.CreateElement,
                id,
                html: (node as Element).outerHTML
            }

        case Node.TEXT_NODE:
            return {
                t: ChildUpdateType.CreateText,
                id,
                text: node.textContent,
            }

        case Node.COMMENT_NODE:
            return {
                t: ChildUpdateType.CreateComment,
                id,
                text: node.nodeValue,
            }

        default:
            throw new Error("unhandled node type: " + node.nodeType);
        }
    }

    recursivelyTrackStaticNode(node: Node) {
        if (this.nodeMetadata.isTracked(node)) {
            return;
        }

        const parent = node.parentNode;

        if (!parent)
            throw new Error("recursivelyTrackStaticNode tried to track a node with no parent")

        if (!this.nodeMetadata.isTracked(parent))
            this.recursivelyTrackStaticNode(parent);

        if (!this.nodeMetadata.isTracked(parent))
            throw new Error("expected parent to now be tracked in recursivelyTrackStaticNode");

        this.updateChildrenForStaticNode(parent);
    }

    updateChildrenForStaticNode(node: Node) {

        if (this.hasRecordedUpdateChildren.has(this.nodeMetadata.getId(node)))
            return;

        /*
         * Walk the child list and assign IDs to non-added nodes, and capture HTML for added nodes.
         * This is called when this node has not been affected by a childList event. So,
         * we can safely assign IDs to existing untracked nodes, and it's not ambiguous.
         */

        const children: UpdatedChildrenElement[] = [];

        if (!this.nodeMetadata.isTracked(node))
            throw new Error("updateChildrenForStaticNode - target node is not tracked");

        let lastTrackedChild: Node = null;
        for (const child of (node.childNodes as any).values()) {

            if (this.nodeMetadata.isTracked(child)) {

                // this situation shows up for text nodes, not sure why.
                const ignoreError = CaptureIgnoreAlreadyTrackedTextNodes && (child.nodeType === Node.TEXT_NODE);

                if (!ignoreError) {
                    logError(
                        `record ${this.recordIndex} found an already tracked child in updateChildrenForStaticNode`
                    +`, nodeType = ${child.nodeType}, existingId = ${this.nodeMetadata.getId(child)}, parentId = ${this.nodeMetadata.getId(node)}`
                    +`, already tracked by record: ${this.nodeMetadata.getMetadata(child).trackedByRecord}`, {
                        parent: node,
                        child,
                    });
                }
            }

            if (this.nodeMetadata.hasMetadata(child) && this.addedNodes.has(this.nodeMetadata.getId(child))) {

                // This node was recently added, capture it.
                children.push(this.captureCreateChildNode(child));
                this.nodeMetadata.getMetadata(child).isTracked = true;

                continue
            }

            const isTextNode = child.nodeType === Node.TEXT_NODE;

            if (isTextNode && child.textContent === '') {
                // Awesome special case. Ignore empty text nodes. These have no effect and
                // they will vanish when the DOM is serialized to HTML and back. These nodes
                // are sometimes created during client side DOM manipulation. We need to
                // get rid of them so that the actual list of nodes matches up on the playback
                // side.
                continue;
            }

            if (isTextNode && lastTrackedChild && lastTrackedChild.nodeType === Node.TEXT_NODE) {
                // Another awesome special case. If there are two adjacent text nodes, then
                // they will end up as one node after this passes through HTML serialization.
                // So, just skip this one.
                continue;
            }

            let debugTextContent;

            if (CaptureIncludeExistingTextContent && isTextNode)
                debugTextContent = child.textContent;
            
            // Existing node that just needs a tracking ID.
            children.push({
                t: ChildUpdateType.TrackExisting,
                id: this.getOrAssignId(child),
                nodeName: child.nodeName,
                debugTextContent,
            });
            lastTrackedChild = child;
            this.nodeMetadata.getMetadata(child).isTracked = true;
        }

        // console.log('captured static children', getMetadata(node).id, (node as Element).innerHTML);

        this.receiver.addChange({
            t: PageChangeType.UpdateChildren,
            target: this.nodeMetadata.getId(node),
            children,
            // debugInnerHTML: (node as Element).innerHTML
        });

        this.hasRecordedUpdateChildren.set(this.nodeMetadata.getId(node), true);
    }

    updateChildrenForNodeWithChildListChange(node: Node) {

        if (this.hasRecordedUpdateChildren.has(this.nodeMetadata.getId(node)))
            return;
        /*
         * Walk the child list for a node affected by childList, then store the new order for tracked
         * nodes, and capture any untracked nodes as HTML.
         *
         * There's a chance of duplicate HTML here - we might be recapturing HTML for an existing
         * untracked node. But in this situation it gets tricky to unambiguously identify where the
         * untracked node came from.
         * 
         */

        // console.log('updateChildrenForNodeWithChildListChange: ', getMetadata(node));

        const children: UpdatedChildrenElement[] = [];

        if (!this.nodeMetadata.isTracked(node))
            throw new Error("updateChildrenForNodeWithChildListChange - node is not tracked");

        for (const child of (node.childNodes as any).values()) {
            if (this.nodeMetadata.isTracked(child)) {
                children.push({
                    t: ChildUpdateType.MoveExisting,
                    id: this.nodeMetadata.getId(child),
                })
            } else {
                children.push(this.captureCreateChildNode(child))
            }
        }

        this.receiver.addChange({
            t: PageChangeType.UpdateChildren,
            target: this.nodeMetadata.getId(node),
            children,
            // debugInnerHTML: (node as Element).innerHTML,
        });

        this.hasRecordedUpdateChildren.set(this.nodeMetadata.getId(node), true);
    }
}

export function digestMutationRecords(nodeMetadata: NodeMetadataLayer, records: MutationRecord[], recordIndex: number, receiver: FrameReceiver) {
    // This is the 3rd rewrite of this algorithm!

    if (records.length === 0)
        return;

    const digest = new MutationDigest(nodeMetadata, recordIndex, receiver);

    if (CapturePrintMutationRecords)
        console.log(`mutation record #${recordIndex}:`, records.map(mutationRecordToObject));
    
    // Make sure all new nodes have IDs (so we can put them in maps)
    for (const node of eachTargetAndAddedNode(records))
        digest.getOrAssignId(node);

    // Create lookup table of nodes that have a child list change.
    for (const target of eachChildListTarget(records))
        digest.hadChildListChange.set(nodeMetadata.getId(target), target);

    // Start tracking static nodes when possible.
    for (const target of eachTargetAndAddedNode(records)) {
        const staticTrackedAncestor = digest.lookForStaticTrackedAncestor(target);

        if (!staticTrackedAncestor) {
            // Ignore nodes with no static tracked ancestor - these are either orphans or
            // nodes that are below a child-list-change node.
            continue;
        }

        digest.recursivelyTrackStaticNode(target);
    }

    // Record the nodes affected by childList updates.
    for (const target of eachChildListTarget(records)) {
        if (!nodeMetadata.isTracked(target))
            // Ignore untracked - the only reason it would be untracked here is if it's an orphan.
            continue;

        digest.updateChildrenForNodeWithChildListChange(target);
    }

    // Now that all nodes are tracked, record content changes.
    for (const record of records) {
        if (!record.target) {
            // this can happen with artificial events.
            continue;
        }

        if (!nodeMetadata.isTracked(record.target)) {
            continue;
        }

        try {
            const target = record.target as Element;

            switch (record.type) {

            case 'attributes':
                if (CaptureNodeIdAsAttributes && record.attributeName.startsWith('data-cctv'))
                    break;
                
                receiver.addChange({
                    t: PageChangeType.Attribute,
                    id: nodeMetadata.getId(target),
                    attributeName: record.attributeName,
                    value: target.getAttribute(record.attributeName),
                });
                break;

            case 'characterData':
                receiver.addChange({
                    t: PageChangeType.NodeValue,
                    id: nodeMetadata.getId(target),
                    value: record.target.nodeValue
                });
                break;

            case 'styleRules': {
                //let cssText = '';
                let rules = [];

                const sheet: CSSStyleSheet = (target as any).sheet;
                for (let i = record.startIndex; i < sheet.cssRules.length; i++) {
                    const rule = sheet.cssRules[i];
                    rules.push(rule.cssText);
                }

                // console.log(`captured ${sheet.cssRules.length} css rules`, { sheet, rules });

                receiver.addChange({
                    t: PageChangeType.UpdateStyleSheet,
                    target: nodeMetadata.getId(target),
                    rules,
                });

                break;
            }
            }
        } catch (e) {
            logError(e);
        }
    }
}
