
import { IDSource } from '../rqe/utils/IDSource'
import { CaptureNodeIdAsAttributes, CaptureAlertIfDomIsFrozen } from './Config'

/*
  NodeMetadata

  Helpers for reading & writing metadata on DOM nodes.
*/

export interface NodeMetadata {
    id: number
    isTracked: boolean

    // Only used when CaptureTrackedByRecordMetadata is enabled:
    trackedByRecord?: number | string

    // Used for style sheet tracking
    styleSheetLastObserved?: number
    styleSheetIgnore?: boolean
}

export class NodeMetadataLayer {
    key: string
    nextNodeId = new IDSource()

    constructor() {
        const d = (document as any);
        d._domcapture = d._domcapture || {};
        d._domcapture.nextId = d._domcapture.nextId || 1;
        this.key = `domcapture#${d._domcapture.nextId}`;
        d._domcapture.nextId++;
    }

    hasMetadata(node: Node) {
        return !!node[this.key];
    }

    initializeNode(node: Node) {
        if (this.hasMetadata(node))
            throw new Error('initializeNode - node already has metadata for key: ' + this.key);

        const data: NodeMetadata = { id: this.nextNodeId.take(), isTracked: false };
        node[this.key] = data;

        if (CaptureAlertIfDomIsFrozen) {
            if (!this.hasMetadata(node)) {
                console.error(`NodeMetadata failed to write node metadata (${this.key})`, node);
            }
        }

        if (CaptureNodeIdAsAttributes && node.nodeType == 1) {
            const el = node as Element;
            el.setAttribute('data-domcapture', data.id + '');
        }

        return data;
    }

    getMetadata(node: Node): NodeMetadata {
        const found = node[this.key];

        if (!found) {
            console.error(`getMetadata failed ${this.key}`, node);
            throw new Error(`getMetadata - node does not have metadata ${this.key}`);
        }

        return found;
    }

    getOrInitialize(node: Node) {
        if (this.hasMetadata(node))
            return this.getMetadata(node);
        else
            return this.initializeNode(node);
    }

    getId(node: Node) {
        return this.getMetadata(node).id;
    }

    isTracked(node: Node) {
        return this.hasMetadata(node) && this.getMetadata(node).isTracked;
    }
}
