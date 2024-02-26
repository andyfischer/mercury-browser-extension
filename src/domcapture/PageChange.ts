
import { Location } from './Location'

export enum PageChangeType {
  NodeValue = 10,
  Attribute = 11,
  UpdateChildren = 12,
  InitRoot = 13,
  RecordingStarted = 14,
  ContentStopped = 15,
  UpdateStyleSheet = 16,
  MouseMovement = 17,
  ScrollMovement = 18,
}

export enum ChildUpdateType {
  TrackExisting = 100,
  CreateElement = 101,
  CreateText = 102,
  CreateComment = 103,
  MoveExisting = 104,
}

export type PageChange =
    NodeValueChange |
    AttributeChange |
    UpdateChildrenChange |
    UpdateStyleSheet |
    InitRootChange |
    RecordingStarted |
    RecordingStopped |
    MouseMovement |
    ScrollMovement |
    Legacy_NodeValueChange |
    Legacy_AttributeChange |
    Legacy_UpdateChildrenChange |
    Legacy_UpdateStyleSheetRules |
    Legacy_InitializeTopChange |
    Legacy_ContentStarted |
    Legacy_RecordingStopped |
    Legacy_MouseMovement |
    Legacy_ScrollMovement;

export type UpdatedChildrenElement =
    ChildUpdate_TrackExistingNode |
    ChildUpdate_CreateElement |
    ChildUpdate_CreateTextNode |
    ChildUpdate_CreateCommentNode |
    ChildUpdate_MoveExistingNode |
    Legacy_ChildUpdate_TrackExistingNode |
    Legacy_ChildUpdate_CreateElement |
    Legacy_ChildUpdate_CreateTextNode |
    Legacy_ChildUpdate_CreateCommentNode |
    Legacy_ChildUpdate_MoveExistingNode;

export interface ChildUpdate_TrackExistingNode {
    t: ChildUpdateType.TrackExisting
    id: number
    nodeName: string
    debugTextContent?: string
}

export interface ChildUpdate_CreateElement {
    t: ChildUpdateType.CreateElement
    id: number,
    html: string,
}

export interface ChildUpdate_CreateTextNode {
    t: ChildUpdateType.CreateText
    id: number,
    text: string,
}

export interface ChildUpdate_CreateCommentNode {
    t: ChildUpdateType.CreateComment
    id: number,
    text: string,
}

export interface ChildUpdate_MoveExistingNode {
    t: ChildUpdateType.MoveExisting
    id: number
}

export interface Legacy_ChildUpdate_TrackExistingNode {
    t: 'trackExisting'
    id: number
    nodeName: string
    textContent?: string
}

export interface Legacy_ChildUpdate_CreateElement {
    t: 'createElement'
    id: number,
    html: string,
}

export interface Legacy_ChildUpdate_CreateTextNode {
    t: 'createTextNode'
    id: number,
    textContent: string,
}

export interface Legacy_ChildUpdate_CreateCommentNode {
    t: 'createComment'
    id: number,
    nodeValue: string,
}

export interface Legacy_ChildUpdate_MoveExistingNode {
    t: 'moveExisting'
    id: number
}

export interface NodeValueChange {
    t: PageChangeType.NodeValue
    id: number,
    value: any,
}

export interface AttributeChange {
    t: PageChangeType.Attribute
    id: number,
    attributeName: string,
    value: string | null,
}

export interface UpdateChildrenChange {
    t: PageChangeType.UpdateChildren
    target: number
    children: UpdatedChildrenElement[]
    debugInnerHTML?: string
}

export interface InitRootChange {
    t: PageChangeType.InitRoot
    id: number
    name: string
    html: string
}

export interface RecordingStarted {
    t: PageChangeType.RecordingStarted
    location: Location
}

export interface RecordingStopped {
    t: PageChangeType.ContentStopped
}

export interface UpdateStyleSheet {
    t: PageChangeType.UpdateStyleSheet
    target: number
    rules: string[]
}

export interface MouseMovement {
    t: PageChangeType.MouseMovement
    data: ArrayBuffer
}

export interface ScrollMovement {
    t: PageChangeType.ScrollMovement
    data: ArrayBuffer
}

export interface Legacy_NodeValueChange { t: 'nodeValue', id: number, value: any, }
export interface Legacy_AttributeChange { t: 'attribute', id: number, attributeName: string, value: string | null, }
export interface Legacy_UpdateChildrenChange { t: 'updateChildren', target: number, children: UpdatedChildrenElement[], debugInnerHTML?: string
}
export interface Legacy_InitializeTopChange { t: 'initRoot', id: number, name: string, innerHTML: string }
export interface Legacy_ContentStarted { t: 'contentStarted', location: Location }
export interface Legacy_RecordingStopped { t: 'contentStopped' }
export interface Legacy_UpdateStyleSheetRules { t: 'updateStyleSheet', target: number, rules: string[] }
export interface Legacy_MouseMovement { t: 'mouseMovement', data: ArrayBuffer }
export interface Legacy_ScrollMovement { t: 'scrollMovement', data: ArrayBuffer }



export interface PageChangeMoment {
    t: 'moment'
    time: number
    iframeID?: number
    isStandalone?: boolean
    changes: PageChange[]
}

