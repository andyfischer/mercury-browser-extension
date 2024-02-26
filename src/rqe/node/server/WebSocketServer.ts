
import WebSocket from 'ws'
import { IDSource } from '../../utils/IDSource'
import { Stream } from '../../Stream'
import { Table, lazySchema } from '../../table'
import { WebSocketClient } from '../../remote/WebSocketClient'
import { captureException } from '../../Errors'
import { LogEvent } from '../../logger'
import { Connection } from '../../remote/Connection'
import { compileSchema } from '../../table'
import type { ManagedAPI } from '../../remote/ManagedAPI'

const ActiveConnectionsSchema = lazySchema({
    name: "ActiveConnections",
    funcs: [
        'delete(connectionId)',
        'deleteAll',
        'each',
    ]
});

export interface ServerOptions<RequestType> {
    wsServer: any
    handleRequest?: (req: RequestType, connection: Connection<RequestType,any>, output: Stream) => void
    api?: ManagedAPI
    activeConnections?: Table
    onConnection?: (connection: Connection<RequestType,any>, httpRequest: any) => void
    logStream?: Stream<LogEvent>
}

export class WebSocketServer<RequestType> {
    options: ServerOptions<RequestType>
    nextConnectionId = new IDSource()
    activeConnections: Table
    logStream: Stream<LogEvent>

    constructor(options: ServerOptions<RequestType>) {
        this.options = options;

        this.logStream = options.logStream || Stream.newNullStream();

        if (!options.handleRequest && !options.api)
            throw new Error("either .handleRequest or .api is required");

        options.wsServer.on('connection', (ws: WebSocket, httpRequest) => {

            try {
                const connectionId = this.nextConnectionId.take();

                const connection = new Connection<RequestType,any>({
                    name: 'WebSocketServerConnection',
                    connectionId,
                    handleRequest: this.options.handleRequest,
                    api: this.options.api,
                    enableReconnection: false,
                    connect() {
                        return new WebSocketClient(ws, { alreadyConnected: true });
                    },

                    onClose: () => {
                        this.activeConnections.delete_with_connectionId(connectionId);
                    }
                });

                this.activeConnections.insert(connection);

                if (options.onConnection) {
                    options.onConnection(connection, httpRequest);
                }
            } catch (e) {
                console.error('WebSocketServer unhandled exception when setting up connection', e)
            }
        });

        if (options.activeConnections) {
            options.activeConnections.assertSupport('delete_with_connectionId');
            options.activeConnections.assertSupport('deleteAll');
            options.activeConnections.assertSupport('each');
            this.activeConnections = options.activeConnections;
        } else {
            this.activeConnections = ActiveConnectionsSchema.get().createTable();
        }
    }

    close() {
        for (const { connection } of this.activeConnections.each()) {
            connection.connection.close();
        }

        this.activeConnections.deleteAll();
        this.options.wsServer.close();
    }

    logError(e: Error) {
        console.log('WebSocketServer logging error..', { e, stack: e.stack, hasLogStream: !!this.logStream });

        if (this.logStream)
            this.logStream.put({error: captureException(e)});
        else
            console.error(e);
    }
}

interface QuickStartOptions<RequestType> {
    port: number
    handleRequest: (req: RequestType, connection: Connection<RequestType>, output: Stream) => void
    activeConnections?: Table
}

export function quickStartWebServer<RequestType>({ port, activeConnections, handleRequest }: QuickStartOptions<RequestType>) {

    const wsServer = new WebSocket.Server({
        port,
    });

    const connection = new WebSocketServer({
        wsServer,
        activeConnections,
        handleRequest,
    });

    return { wsServer, connection }
}
