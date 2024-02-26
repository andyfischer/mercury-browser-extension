
import { ServerMessage, ClientMessage } from '../protocol/ContentToBackground'
import { Table, compileSchema, callbackToStream, ErrorExtended, Stream, warn, logError, ManagedAPI } from '../rqe'
import { DurableConnection } from '../rqe/remote'
import { delayedBatchBuffer } from '../rqe/streamUtil'
import { ActiveTabs, TabsWaitingForConnection } from './ActiveTabs'
import { getStationClient } from './StationClient'
import { PortConnections } from './PortConnections'

export function createPortServerAPI() {
    const api = new ManagedAPI({
        name: 'PortServer',
    });

    api.handlers.insert({
        name: 'CaptureFrames',
        callback(req) {
            getStationClient().sendRequest(req);
        }
    });

    return api;
}
