
import { CaptureFrames } from '../domcapture/CaptureEvents'
import { compileSchema } from '../rqe'

// Sent by content
export interface Ping {
    t: 'Ping'
}

export interface ContentStartup {
    t: 'ContentStartup'
    isIframe: boolean
    href: string
}

// Sent by background
export interface RecordPage {
    t: 'RecordPage'
    recordingSessionId: any
}

export interface GetHTMLForTab { t: 'GetHTMLForTab' }
export interface GetTabInfo { t: 'GetTabInfo' }

export type ClientMessage = Ping | ContentStartup | CaptureFrames
export type ServerMessage = Ping | RecordPage | GetHTMLForTab | GetTabInfo

export const ProtocolDetails = compileSchema({
    name: 'ContentToBackground.ProtocolDetails',
    attrs: [
        'name',
        'requiresSession',
        'responseSchema',
        'onSuccessInvalidate',
    ],
    funcs: [
        'get(name)'
    ]
}).createTable();

ProtocolDetails.insert({
    name: 'RecordPage',
    longRunning: true,
});

ProtocolDetails.insert({
    name: 'listen/pageInfo',
    responseSchema: compileSchema({
        name: 'PageInfo',
        funcs: [
            'get',
            'listen',
        ]
    })
});
