
import type { CaptureFrames } from '../domcapture/CaptureEvents'
import { compileSchema } from '../rqe'
import { ServerMessage as MessageToContentScript } from './ContentToBackground'

export interface Ping {
    t: 'Ping'
}

export interface NewRecordingSession {
    t: 'NewRecordingSession'
    href?: string
}

export interface SaveRecordingFrames {
    t: 'SaveRecordingFrames'
    capture: CaptureFrames
}

export interface ListPlaybacks {
    t: 'ListPlaybacks'
    orderBy: 'newest'
    limit: number
}

export interface ListLiveTabs {
    t: 'ListLiveTabs'
}

export interface ListenToLiveStream {
    t: 'ListenToLiveStream'
    tabId: string
}

export type ClientMessage = Ping | NewRecordingSession
    | SaveRecordingFrames | ListPlaybacks | ListLiveTabs | ListenToLiveStream

export interface ContentScriptRequest {
    t: 'ContentScriptRequest'
    tabId: number
    request: MessageToContentScript
}

export type ServerMessage = Ping | ContentScriptRequest;

export const ProtocolDetails = compileSchema({
    name: 'StationAPI.ProtocolDetails',
    attrs: [
        'name',
        'requiresSession',
        'responseSchema',
        'onSuccessInvalidate',
    ],
    funcs: [
        'get(name)',
    ]
}).createTable();

ProtocolDetails.insert({
    name: 'NewRecordingSession',
    responseSchema: 'single_value',
});

ProtocolDetails.insert({
    name: 'ListenToLiveStream',
    longRunning: true,
});

