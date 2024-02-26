
import { ListenToTableOptions } from '../table/Listeners'
import type { StreamEvent } from '../Stream'
import type { Stream } from '../Stream'

export enum TransportEventType {
    connection_level_request = 601,
    request = 602,
    response = 603,
    close_request = 604,
    connection_established = 605,
    connection_lost = 606,
    set_connection_metadata = 607,
}

/*
 * ListenToTableRequest
 *
 * Connection-level message. Start listening to the given table.
 */
export interface ListenToTableRequest {
    t: TransportEventType.connection_level_request
    reqType: 'ListenToTable'
    name: string
    streamId: number
    options: ListenToTableOptions
}

export type ConnectionRequest = ListenToTableRequest;

/*
 * TransportRequest
 *
 * Send a client-level request.
 */
export interface TransportRequest<RequestType> {
    t: TransportEventType.request
    req: RequestType
    streamId: number
}

/*
 * TransportResponse
 *
 * Receive a response event to a client-level request.
 */
export interface TransportResponse {
    t: TransportEventType.response
    evt: StreamEvent
    streamId: number
}

export interface TransportCloseRequest {
    t: TransportEventType.close_request
    streamId: number
}

/*
 * ConnectionEstablished
 *
 * Status change event - the transport connection is ready.
 */
export interface ConnectionEstablished {
    t: TransportEventType.connection_established
}

/*
 * ConnectionEstablished
 *
 * Status change event - the transport connection has closed.
 */
interface ConnectionLost {
    t: TransportEventType.connection_lost
    shouldRetry?: boolean
}

/*
 * ConnectionMetadata
 *
 * Used by the transport implementation to send metadata about the established connection.
 */
interface ConnectionMetadata {
    t: TransportEventType.set_connection_metadata
    sender?: any
}

export type TransportMessage<RequestType> =
    TransportRequest<RequestType>
    | ConnectionRequest
    | TransportResponse
    | TransportCloseRequest
    | ConnectionEstablished
    | ConnectionLost
    | ConnectionMetadata;

/*
 * TransportConnection
 *
 * Interface for the implementation used by Connection.
 *
 * This is used to implement the actual connection (whether it's a web socket, HTTP or other).
 */
export interface TransportConnection<RequestType> {
    send(message: TransportMessage<RequestType>): void
    incomingEvents: Stream< TransportMessage<RequestType> >
    close(): void
}
