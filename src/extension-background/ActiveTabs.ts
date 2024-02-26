
import { Table, compileSchema, callbackToStream, ErrorExtended, Stream, warn, logError } from '../rqe'

export const ActiveTabs = compileSchema({
    name: "ActiveTabs",
    funcs: [
        'listAll',
        'get(tabId)',
        'has(connectionId)',
        'delete(tabId)',
        'delete(connectionId)',
        'listen',
    ]
}).createTable();

export const NamedTabs = compileSchema({
    name: 'NamedTabs',
    funcs: [
        'get(name)',
    ]
}).createTable();

export const TabsWaitingForConnection = compileSchema({
    name: 'TabsWaitingForConnection',
    funcs: [
        'get(tabId)',
        'delete(tabId)',
    ]
}).createTable();
