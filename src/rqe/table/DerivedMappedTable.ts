
import { Schema, SchemaFunc } from './Schema'
import { Table, } from './Table'
import { wrapTableInDebugProxy } from './TableDebugProxy'

function getCallbackForSchemaFunc(func: SchemaFunc, schema: Schema, table: Table, sourceTable: Table, mapper: (item:any)=>any) {
    switch (func.funcName) {
    case 'each':
        return function*() {
            for (const item of sourceTable.each())
                yield mapper(item);
        }
    case 'listAll':
        return () => {
            return sourceTable.listAll().map(mapper);
        }

    case 'listen':
        return () => {
            return (sourceTable.listen().map(mapper));
        }
    }
    throw new Error(`Function is not supported by DerivedMapped table: ${func.funcName} (${func.publicName})`);
}

export interface Options<ItemType,SourceItemType> {
    source: Table<SourceItemType>
    mapper: (item: SourceItemType) => ItemType
    schema: Schema<Table<ItemType>>
}

export function createDerivedMappedTable<ItemType = any,SourceItemType = any>({source, mapper, schema}:
          Options<ItemType,SourceItemType>): Table<ItemType> {
    for (const schemaIndex of schema.indexes) {
        // ignore for now
    }

    const tableObject = {
        schema,
    };

    for (const func of schema.funcsByPublicName.values()) {
        if (func.funcName === 'insert' || func.funcName === 'preInsert') {
            // ignore
            continue;
        }
        tableObject[func.publicName] = getCallbackForSchemaFunc(func, schema, tableObject as Table, source, mapper);
    }

    return wrapTableInDebugProxy(schema, tableObject);
}
