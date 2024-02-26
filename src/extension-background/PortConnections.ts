
import { DurableConnection } from '../rqe/remote'
import { Table, compileSchema, callbackToStream } from '../rqe'
import { ServerMessage, ClientMessage } from '../protocol/ContentToBackground'

export const PortConnections = compileSchema({
    name: 'PortConnections',
    attrs: [
        'connectionId(auto)',
    ],
    funcs: [
        'each',
        'get(connectionId)',
        'delete(connectionId)',
    ]
}).createTable() as Table<DurableConnection<ServerMessage,ClientMessage>>;

