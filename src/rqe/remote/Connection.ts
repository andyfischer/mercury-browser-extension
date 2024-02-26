
import { ActiveStreamSet } from '../remote'
import { Table, compileSchema } from '../table'
import { RequestClient } from './RequestClient'
import { c_item, c_close } from '../Stream'
import { Stream } from '../Stream'
import { MessageBuffer } from './MessageBuffer'
import { TableSyncClient } from './TableSyncClient'
import { TableSyncServer, TableShareSettings } from './TableSyncServer'
import { BackpressureStop } from '../Stream'
import { TransportEventType } from './TransportTypes'
import type { TransportConnection, ConnectionRequest, TransportMessage, TransportRequest } from './TransportTypes'

const VerboseLog = false;
const VeryVerboseLog = false;

export type ConnectionChangeEvent = { t: 'connected' } | { t: 'disconnected' }
export type ConnectionStatus = 'attempting' | 'connected' | 'give_up' | 'permanent_close'

export interface Connection<OutgoingType> extends RequestClient<OutgoingType> {
    listenToConnectionChange: () => Stream<ConnectionChangeEvent>
}

type HandleRequestFunc<IncomingType> = (req: IncomingType, connection: any, output: Stream) => void

interface ReconnectionSchedule {
    delayMsForAttempt: (attempt: number) => number | 'give_up'
}

interface SetupOptions<OutgoingType,IncomingType> {
    // Name for debugging
    name?: string

    // Optional ID - created by owner.
    connectionId?: any

    // Set up a connection. Maybe be called multiple times as the connection is
    // reestablished.
    connect: () => TransportConnection<OutgoingType>

    // Whether to enable reconnection behavior.
    //
    // If enabled then the connection will automatically try to re-create a transport when lost.
    // (using connect()). If disabled then the connection will be permanently closed when
    // the transport is lost.
    enableReconnection?: boolean

    protocolDetails?: Table

    handleRequest?: HandleRequestFunc<IncomingType>

    api?: {
        handleRequest: HandleRequestFunc<IncomingType>
        protocolDetails?: Table
    }

    // Optional callback triggered when the connection is established (or reestablished).
    onEstablish?: (connection: Connection) => void

    // Optional callback triggered when the connection is closed.
    onClose?: (connection: Connection) => void

    reconnectSchedule?: ReconnectionSchedule
}

const ReconnectionRecentWindowTime = 30;

const connectionAttemptsSchema = compileSchema({
    name: 'ConnectionAttempts',
    attrs: [
        'id auto',
        'time',
    ],
    funcs: [
        'each',
        'delete(id)',
        'deleteAll',
    ]
});

export class Connection<OutgoingType = any, IncomingType = any> implements RequestClient<OutgoingType> {
    name: string

    connectionId?: any
    sender?: any
    requestContext?: any
    authentication?: any

    options: SetupOptions<OutgoingType, IncomingType>
    handleRequest: HandleRequestFunc<IncomingType>
    recentAttempts: Table
    reconnectTimer: any
    outgoingBuffer = new MessageBuffer()
    status: ConnectionStatus;
    reconnectSchedule: ReconnectionSchedule

    transport: TransportConnection<OutgoingType>
    transportIncomingEvents: Stream
    activeStreams = new ActiveStreamSet()
    nextRequestStreamId = 1

    protocolDetails: Table

    syncClient?: TableSyncClient
    syncServer?: TableSyncServer

    constructor(options: SetupOptions<OutgoingType, IncomingType>) {
        this.name = options.name || 'Connection';
        this.connectionId = options.connectionId;
        this.options = options;
        this.recentAttempts = connectionAttemptsSchema.createTable();
        this.handleRequest = options.handleRequest;
        this.protocolDetails = options.protocolDetails;
        this.reconnectSchedule = {
            ...options.reconnectSchedule || {},
            delayMsForAttempt: (attempt: number) => {
                if (attempt > 5)
                    return 'give_up';
                return (2 ** attempt) * 500
            }
        };

        if (!this.handleRequest && options.api) {
            this.handleRequest = (req, connection, output) => options.api.handleRequest(req, connection, output);
        }

        if (!this.protocolDetails && options.api) {
            this.protocolDetails = options.api.protocolDetails;
        }

        if (VerboseLog)
            console.log(`created: ${this.name}`)

        this.status = 'attempting';
        this.attemptReconnection();
    }

    isConnected() {
        return this.status === 'connected';
    }

    getSyncClient() {
        if (!this.syncClient)
            this.syncClient = new TableSyncClient(this);
        return this.syncClient;
    }

    getSyncServer() {
        if (!this.syncServer)
            this.syncServer = new TableSyncServer(this.protocolDetails);
        return this.syncServer;
    }

    serveData(table: Table, settings: TableShareSettings = {}) {
        this.getSyncServer().serve(table, settings);
    }

    getServedData(name: string) {
        return this.getSyncServer().getServedData(name);
    }

    close() {
        this.clearCurrentTransport();
        this.activeStreams.closeAll();
        this.setStatus('permanent_close');
        if (this.options.onClose) {
            this.options.onClose(this);
        }
        if (this.syncClient)
            this.syncClient.close();
        this.options = null;
    }

    setStatus(newStatus: ConnectionStatus) {
        if (newStatus === this.status)
            return;

        if (VerboseLog)
            console.log(`${this.name}: changed status from ${this.status} to ${newStatus}`);

        this.status = newStatus;

        switch (newStatus) {
        case 'permanent_close':
        case 'give_up':
            this.clearCurrentTransport();
            this.activeStreams.closeAll();
            this.clearReconnectTimer();
            this.outgoingBuffer.closeAllWithError({ errorType: 'connection_failed' });
            break;
        }
    }

    takeNextRequestId() {
        const id = this.nextRequestStreamId;
        this.nextRequestStreamId++;
        return id;
    }

    sendRequest(req: OutgoingType, output?: Stream) {
        if (!output)
            output = new Stream();

        switch (this.status) {

        case 'attempting':
            this.outgoingBuffer.push(req, output);
            break;

        case 'give_up':
            // Wake up and try another attempt.
            this.outgoingBuffer.push(req, output);
            this.attemptReconnection();
            return

        case 'permanent_close':
            output.closeWithError({ errorType: 'connection_closed' });
            return

        case 'connected': {
            this._actuallySendRequest({ t: TransportEventType.request, req, streamId: null }, output);
            break;
        }
        }

        return output;
    }

    _actuallySendRequest(msg: TransportRequest<OutgoingType> | ConnectionRequest, output: Stream) {
        if (!msg.streamId) {
            msg.streamId = this.takeNextRequestId();
        }

        this.activeStreams.addStream('req_' + msg.streamId, output);

        this.transport.send(msg);
    }

    // count the number of connection attempts in the recent window time.
    countRecentAttempts() {
        let recentCount = 0;
        let mostRecentAttempt = null;
        const now = Date.now();
        const recentWindow = ReconnectionRecentWindowTime * 1000;

        for (const item of this.recentAttempts.each()) {
            if ((item.time + recentWindow) < now) {
                this.recentAttempts.delete_with_id(item.id);
                continue;
            }

            if (mostRecentAttempt === null || item.time > mostRecentAttempt)
                mostRecentAttempt = item.time;

            recentCount++;
        }

        return { recentCount, mostRecentAttempt }
    }

    // Perform a reconnection attempt
    attemptReconnection() {
        if (this.status === 'connected' || this.status === 'permanent_close') {
            if (VerboseLog)
                console.log(`${this.name}: not attempting connection (status=${this.status})`);
            return;
        }

        if (VerboseLog)
            console.log(`${this.name}: now attempting reconnection`);

        this.clearReconnectTimer();
        this.clearCurrentTransport();
        this.setStatus('attempting');

        try {
            this.transport = this.options.connect(); 
            
            this.transportIncomingEvents = this.transport.incomingEvents;

            this.transportIncomingEvents.sendTo(evt => {

                switch (evt.t) {
                case c_item:
                    this.onIncomingEvent(evt.item);
                    break;
                case c_close:
                    this.onIncomingEvent({t: TransportEventType.connection_lost});
                    break;
                }
            });

        } catch (err) {
            console.log(`${this.name}: connect() failed`, err);
            this.onIncomingEvent({ t: TransportEventType.connection_lost });
        } finally {
            this.recentAttempts.insert({ time: Date.now() });
        }
    }

    onIncomingEvent(evt: TransportMessage<IncomingType>) {

        if (VeryVerboseLog)
            console.log(`${this.name}: incoming event:`, evt); 

        switch (evt.t) {

            case TransportEventType.connection_established:
                this.clearReconnectTimer();

                if (this.status === 'connected')
                    return;

                this.setStatus('connected');
                this.recentAttempts.deleteAll();

                if (this.options.onEstablish) {
                    this.options.onEstablish(this);
                }

                for (const { req, output } of this.outgoingBuffer.takeAll()) {
                    this._actuallySendRequest({ t: TransportEventType.request, req, streamId: null }, output);
                }

                if (this.syncClient) {
                    this.syncClient.onConnect();
                }

                if (this.syncServer) {
                    this.syncServer.onConnect();
                }

                break;

            case TransportEventType.connection_lost:

                if (VerboseLog)
                    console.log(`${this.name}: connection has disconnected`); 

                if (evt.shouldRetry === false) {
                    this.close();
                } else {
                    this.setStatus('attempting');
                    this.clearCurrentTransport();
                    this.activeStreams.closeAll();
                    this.scheduleReconnectionTimer(10);
                }
                break;

            case TransportEventType.request:
            case TransportEventType.connection_level_request: {
                // Remote side has sent us a request.
                const streamId = evt.streamId;

                let stream: Stream;

                if (streamId) {
                    stream = this.activeStreams.startStream('res_' + streamId);

                    stream.sendTo(evt => {
                        if (this.status !== 'connected')
                            throw new BackpressureStop();

                        this.transport.send({ t: TransportEventType.response, evt, streamId, });
                    });
                } else {
                    // No streamId - Other side is not expecting a response.
                    stream = Stream.newNullStream();
                }

                if (!this.handleRequest) {
                    stream.closeWithError({ errorType: 'no_handler', errorMessage: "Connection is not set up to handle requests" });
                    return;
                }

                switch (evt.t) {
                case TransportEventType.request:
                    this.handleRequest(evt.req, this, stream);
                    break;
                case TransportEventType.connection_level_request:
                    this.handleConnectionLevelRequest(evt, stream);
                    break;
                }

                break;
            }
            case TransportEventType.close_request: {
                // Remote side no longer wants the results of this request.
                this.activeStreams.closeStream('res_' + evt.streamId);
                break;
            }

            case TransportEventType.response:
                // Remote side is providing a response to one of our requests.
                const streamId = 'req_' + evt.streamId;

                if (this.activeStreams.isStreamOpen(streamId)) {
                    this.activeStreams.receiveMessage(streamId, evt.evt);
                } else {
                    this.transport.send({
                        t: TransportEventType.close_request,
                        streamId: evt.streamId,
                    });
                }
                break;

            case TransportEventType.set_connection_metadata:
                if (evt.sender)
                    this.sender = evt.sender;
                break;

            default:
                console.warn('Connection.onIncomingEvent unhandled:', evt);
        }
    }

    handleConnectionLevelRequest(req: ConnectionRequest, output: Stream) {
        switch (req.reqType) {
        case 'ListenToTable':
            if (!this.syncServer) {
                output.closeWithError({ errorType: 'not_found' });
                return;
            }

            this.syncServer.handleListenRequest(req, output);
            break;
        default:
            console.warn('Connection.handleConnectionLevelRequest unhandled:', req);
        }
    }

    clearCurrentTransport() {
        if (this.transport)
            this.transport.close();

        this.transport = null;

        if (this.transportIncomingEvents) {
            this.transportIncomingEvents.closeByDownstream();
            this.transportIncomingEvents = null;
        }
    }

    clearReconnectTimer() {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    scheduleReconnectionTimer(delayMs: number) {
        if (!this.reconnectTimer)
            this.reconnectTimer = setTimeout(() => this.checkAndMaybeReconnect(), delayMs);
    }

    // Check if we should possibly try to reconnect, based on the number of recent attempts.
    checkAndMaybeReconnect() {
        this.reconnectTimer = null;

        if (this.status === 'connected' || this.status === 'permanent_close') {
            if (VerboseLog)
                console.log(`${this.name}: checkAndMaybeReconnect doing nothing (status=${this.status}`); 
            return;
        }

        if (this.options.enableReconnection === false) {
            this.close();
            return;
        }

        const { recentCount, mostRecentAttempt } = this.countRecentAttempts();

        if (recentCount === 0) {
            if (VerboseLog)
                console.log(`${this.name}: attempting reconnection (recentCount=${recentCount})`); 
            this.attemptReconnection();
            return;
        }

        const delayForNextAttempt = this.reconnectSchedule.delayMsForAttempt(recentCount);

        if (delayForNextAttempt === 'give_up') {
            if (VerboseLog)
                console.log(`${this.name}: giving up after ${recentCount} attempts`);
            this.setStatus('give_up');
            return;
        }

        let timeToAttempt = delayForNextAttempt + mostRecentAttempt - Date.now();

        if (VerboseLog)
            console.log(`${this.name}: next attempt (${recentCount}) has delay of ${delayForNextAttempt}ms`);

        if (timeToAttempt < 10)
            timeToAttempt = 0;

        if (timeToAttempt === 0) {
            this.attemptReconnection();
            return;
        }

        if (VerboseLog)
            console.log(`${this.name}: scheduled next reattempt for ${timeToAttempt}ms`, { recentCount, mostRecentAttempt });

        this.scheduleReconnectionTimer(timeToAttempt);
    }
}
