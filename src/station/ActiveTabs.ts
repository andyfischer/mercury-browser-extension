
import { compileSchema, lazySchema, } from '../rqe'

export const ActiveTabs = lazySchema({
    name: 'ActiveTabs',
    funcs: [
        'get(tabId)',
        'delete(connectionId)',
        'delete(tabId connectionId)',
        'list(connectionId)',
        'listAll',
        'listen',
    ]
}).createTable();

export const SingleConnectionActiveTabsSchema = lazySchema({
    name: 'SingleConnectionActiveTabs',
    funcs: [
        'delete(tabId)',
        'listenToStream',
    ]
});