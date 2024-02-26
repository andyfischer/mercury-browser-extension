
import { Schema } from '../table/Schema'
import { Table } from '../table/Table'
import { initializeNewTableWithStatus } from '../table/StatusTable'
import { checkInvariantsOnTable } from '../table/checkInvariants'
import { consoleLogTable } from '../table/debugFunctions'
import { SchemaFunc } from '../table/Schema'
import { getSingleValue, listAll, each, count,
        deleteWithAttrs as deleteUsingIndex, deleteAll, replaceAll,
        first } from './RuntimeFunctions'
import { diffTables } from '../table/diff'
import { wrapTableInDebugProxy } from '../table/TableDebugProxy'
import { c_item } from '../Stream'
import { EnableTableProxyWrapper, EnableDebugMonitor } from '../config'
import { addCreatedTable } from '../debug/GlobalDebugMonitor'
import { insert, preInsert } from './RuntimeInsert'
import { getWithAttrs, hasWithAttr, listWithAttr, listWithAttrs } from './RuntimeGet'
import { IndexSchema } from '../table/IndexSchema'
import { MapIndex } from './MapIndex'
import { MultiMapIndex } from './MultiMapIndex'
import { ListIndex } from './ListIndex'
import { SingleValueIndex } from './SingleValueIndex'
import { TableIndex } from '../table/TableIndex'
import { prepareUpdateAllFunction, prepareUpdateFunction } from './RuntimeUpdate'
import { getIndexKeyForArgs } from '../table/IndexUtils'
import { listenToStream, listenToTable } from '../table/Listeners'
import { StreamListenerList } from '../streamUtil/StreamListenerList'
import type { SchemaDecl } from '../table'
import { upgradeSchema } from './upgradeSchema'

function getCallbackForSchemaFunc(func: SchemaFunc, schema: Schema, table: Table) {
    switch (func.funcName) {

    case 'preInsert':
        return (...args) => preInsert(schema, table, args[0]);

    case 'each':
        return function*() {
            yield* each(table);
        }
    case 'eachWithFilter':
        return function*(...args) {
            if (args.length !== 1)
                throw new Error("eachWithFilter usage error: expected 1 arg")

            const condition = args[0];

            for (const item of each(table)) {
                if (condition(item))
                    yield item;
            }
        }

    case 'getWithIndexKey': {
        const indexSchema = schema.indexesByName.get(func.indexName);

        if (!indexSchema)
            throw new Error("internal error: expected to find index: " + func.indexName);

        return (...args) => {
            return getWithAttrs(schema, func.publicName, func.indexName, table, args)
        }
    }

    case 'listAll':
        return (...args) => listAll(schema, 'listAll', table);

    case 'listWithIndexKey': {
        const indexSchema = schema.indexesByName.get(func.indexName);
        if (!indexSchema)
            throw new Error("internal error: expected to find index: " + func.indexName);
        return (...args) => {
            return listWithAttrs(schema, func.publicName, func.indexName, table, args);
        }
    }

    case 'count':
        return (...args) => count(schema, table, args);

    case 'getSingleValue':
        return (...args) => {
            if (args.length !== 0)
                throw new Error(`(${schema.name}).${func.publicName} usage error: expected zero args`)

            return getSingleValue(schema, func.publicName, table);
        }

    case 'has':
        return (...args) => hasWithAttr(schema, func.publicName, func.indexName, table, args);

    case 'first':
        return (...args) => first(table);

    case 'setSingleValue': {
        return (...args) => {
            if (args.length !== 1)
                throw new Error(`${schema.name}.${func.publicName} usage error: expected a single arg`)

            const item = args[0];
            const index: TableIndex = table.defaultIndex;

            if (index.indexType !== 'single_value')
                throw new Error(`${schema.name}.${func.publicName} internal error: expected 'single_value' index, got: ${table.indexType}`);

            (index as SingleValueIndex).item = item;

            if (schema.supportsListening)
                table.listenerStreams.receive({ t: c_item, item });
        }
    }

    case 'listen':
        return (options) => listenToTable(table, options);

    case 'itemEquals': {
        const primaryUniqueIndex = schema.indexesByName.get(schema.primaryUniqueAttr);
        return (a, b) => {
            return primaryUniqueIndex.getIndexKeyForItem(a) === primaryUniqueIndex.getIndexKeyForItem(b);
        }
    }

    case 'item_to_uniqueKey': {
        const primaryUniqueIndex = schema.indexesByName.get(schema.primaryUniqueAttr);

        return (...args) => {
            if (args.length !== 1)
                throw new Error('item_to_uniqueKey expected 1 arg');

            const item = args[0];
            
            if (!item)
                throw new Error('item_to_uniqueKey expected an item');

            return primaryUniqueIndex.getIndexKeyForItem(item);
        }
    }
    case 'item_matches_uniqueKey':
        return (...args) => {
            if (args.length !== 2)
                throw new Error('item_matches_uniqueKey expected 2 args');

            const item = args[0];
            const uniqueKey = args[1];

            if (!item)
                throw new Error('item_matches_uniqueKey expected an item');

            return item[schema.primaryUniqueAttr] === uniqueKey;
        }
    case 'get_using_uniqueKey': {
        const indexName = schema.primaryUniqueAttr;
        return (...args) => {
            return getWithAttrs(schema, 'get_using_uniqueKey', indexName, table, args);
        }
    }

    case 'delete_using_uniqueKey': {
        const primaryUniqueIndex = schema.indexesByName.get(schema.primaryUniqueAttr);
        return (...args) => {
            if (args.length !== 1)
                throw new Error('delete_using_uniqueKey expected 1 arg');
            const indexKey = getIndexKeyForArgs(args);
            return deleteUsingIndex(schema, 'delete_using_uniqueKey', primaryUniqueIndex.name, table, indexKey);
        }
    }

    case 'deleteItem': {
        const primaryUniqueIndex = schema.indexesByName.get(schema.primaryUniqueAttr);
        return (...args) => {
            if (args.length !== 1)
                throw new Error('deleteItem expected 1 arg');

            const item = args[0];
            const indexKey = primaryUniqueIndex.getIndexKeyForItem(item);
            return deleteUsingIndex(schema, 'deleteItem', primaryUniqueIndex.name, table, indexKey);
        }
    }

    case 'update': {
        const updateFn = prepareUpdateAllFunction(schema, table);
        return updateFn;
    }

    case 'updateWithIndexKey': {
        const indexSchema = schema.indexesByName.get(func.indexName);
        const updateFn = prepareUpdateFunction(schema, indexSchema, table);
        return updateFn;
    }

    case 'deleteAll':
        return (...args) => deleteAll(schema, table, args);
    case 'deleteWithIndexKey': {
        return (...args) => {
            const indexKey = getIndexKeyForArgs(args);
            deleteUsingIndex(schema, func.publicName, func.indexName, table, indexKey);
        }
    }
    case 'replaceAll':
        return (...args) => replaceAll(schema, table, args);
    case 'listenToStream':
        return (...args) => listenToStream(table, args);
    case 'diff':
        return (...args) => {
            if (args.length !== 1)
                throw new Error(`diff expected 1 arg`);
            const compareTable = args[0];
            return diffTables(table, compareTable);
        }

    case 'getStatus':
        return () => table.status.get();

    case 'upgradeSchema':
        return (upgradeDecl: SchemaDecl) => {
            upgradeSchema(table, upgradeDecl);
        }
    }

    throw new Error("getCallbackForSchemaFunc didn't recognize: " + func.funcName);
}

function createIndex(schema: Schema, indexSchema: IndexSchema): TableIndex {
    switch (indexSchema.indexType) {
        case 'map':
            return new MapIndex(indexSchema);

        case 'list':
            return new ListIndex(indexSchema);

        case 'multimap':
            return new MultiMapIndex(indexSchema);

        case 'single_value':
            return new SingleValueIndex(indexSchema);

        default:
            throw new Error("internal error, unrecognized index type: " + this.indexType);
    }
}

export function createMemoryTable(schema: Schema): Table {
    const indexes = new Map<string,TableIndex>()

    for (const schemaIndex of schema.indexes) {
        const newTableIndex = createIndex(schema, schemaIndex);
        indexes.set(schemaIndex.name, newTableIndex);
    }

    let defaultIndex: TableIndex = null;
    if (schema.defaultIndex) {
        defaultIndex = indexes.get(schema.defaultIndex.name);
    }

    const attrData = new Map();

    const tableObject: Table = {
        t: 'table',
        schema,
        indexes,
        defaultIndex,
        attrData,
        items: defaultIndex && defaultIndex.items,
        indexType: (defaultIndex && defaultIndex.indexType) || null,
        listenerStreams: null,

        insert: (...args) => insert(schema, 'insert', tableObject, args),

        supportsFunc(funcName: string) {
            return schema.supportsFunc(funcName)
        },
        assertSupport(funcName: string) {
            schema.assertSupportsFunc(funcName);
        },
        assertFitsSchema(schema: Schema) {
            schema.assertFitsSchema(schema);
        },
        checkInvariants() {
            checkInvariantsOnTable(tableObject)
        },
        consoleLog(options) {
            consoleLogTable(tableObject, options);
        },
    };

    // Create callbacks for each func.
    for (const func of schema.funcsByPublicName.values()) {
        if (func.funcName === 'insert')
            // already initialized
            continue;

        const callback = getCallbackForSchemaFunc(func, schema, tableObject);
        tableObject[func.publicName] = callback;

        if (func.declaredName)
            tableObject[func.declaredName] = callback;
    }

    // Run initializiation steps
    for (const step of schema.setupTable) {
        switch (step.t) {
        case 'init_table_auto_attr': {
            if (!attrData.has(step.attr))
                attrData.set(step.attr, {})
            attrData.get(step.attr).next = 1;
            break;
        }
        case 'init_listener_streams': {
            tableObject.listenerStreams = new StreamListenerList();
            break;
        }
        case 'run_initializer': {
            step.initialize(tableObject);
            break;
        }
        }
    }

    if (schema.supportsStatusTable)
        initializeNewTableWithStatus(tableObject);

    let result: Table;

    if (EnableTableProxyWrapper) {
        // Create a proxy for better error messages (todo- make this an optional debugging mode?)
        result = wrapTableInDebugProxy(schema, tableObject);
    } else {
        result = tableObject;
    }

    if (EnableDebugMonitor) {
        addCreatedTable(result);
    }

    return result;
}

