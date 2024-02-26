
import { Connection } from './Connection'
import { Table } from '../table'
import { Stream, c_close, c_restart, c_fail } from '../Stream'
import { TransportEventType } from './TransportTypes'
import { ListenToTableOptions } from '../table/Listeners';

const VerboseLogs = false;

interface ListenerStream {
    tableName: string
    stream: Stream
    options: ListenToTableOptions
    incomingRequest?: Stream
}

export class TableSyncClient {

    connection: Connection<any,any>
    listenerStreams: ListenerStream[] = []
    localTables = new Map<string, Table>()
    protocolDetails: Table

    constructor(connection: Connection) {
        this.connection = connection;
        this.protocolDetails = connection.protocolDetails;
    }

    close() {
        for (const listener of this.listenerStreams) {
            if (listener.incomingRequest)
                listener.incomingRequest.closeByDownstream()
            listener.stream.closeByDownstream();
        }
        this.listenerStreams = []
    }

    onConnect() {
        for (const listener of this.listenerStreams)
            this.restartListener(listener)
    }

    addListeningStream(tableName: string, options: ListenToTableOptions = {}) {
        if (VerboseLogs)
            console.log(`TableSyncClient.addListeningStream (${tableName})`);

        if (options.getInitialData == undefined)
            options.getInitialData = true;

        const stream = new Stream();
        const listener: ListenerStream = { tableName, stream, options, incomingRequest: null };
        this.listenerStreams.push(listener);
        if (this.connection.isConnected()) {
            this.restartListener(listener);
        }
        return stream;
    }

    restartListener(listener: ListenerStream) {
        if (!this.connection.isConnected())
            throw new Error("Internal error: TableSyncClient expected isConnected");

        if (VerboseLogs)
            console.log(`TableSyncClient.restartListener`, listener);

        if (listener.incomingRequest) {
            listener.incomingRequest.closeByDownstream();
            listener.stream.receive({ t: c_restart });
        }

        listener.incomingRequest = new Stream();
        listener.incomingRequest.sendTo(evt => {
            switch (evt.t) {
            case c_close:
                // ignore
                break;

            case c_fail:
                if (VerboseLogs)
                    console.error('TableSyncClient received error: ', evt);

            default:
                listener.stream.receive(evt);
            }
        });
        this.connection._actuallySendRequest({
            t: TransportEventType.connection_level_request,
            reqType: 'ListenToTable',
            name: listener.tableName,
            options: listener.options,
            streamId: null,
        }, listener.incomingRequest);
    }

    getOrInitializeLocalTable(name: string) {
        if (this.localTables.has(name))
            return this.localTables.get(name);
        
        if (!this.protocolDetails)
            throw new Error("TableSyncClient: need to provide protocolDetails");

        const info = this.protocolDetails.get_with_name('listen/' + name);

        if (!info || !info.responseSchema)
            throw new Error("no protocol response schema for: listen/" + name);

        const table = info.responseSchema.createTable();
        this.localTables.set(name, table);

        const stream = this.addListeningStream(name);
        table.listenToStream(stream);
        return table;
    }
}
