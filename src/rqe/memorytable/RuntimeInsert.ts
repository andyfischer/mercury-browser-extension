import { c_item } from "../Stream";
import { Schema } from "../table/Schema";
import { ListIndex, MapIndex, MultiMapIndex, SingleValueIndex, Table } from "../table/Table";

export function preInsert(schema: Schema, table: Table, item) {
    for (const step of schema.preInsert) {
        switch (step.t) {
        case 'init_auto_attr':
            if (item[step.attr] != null)
                continue;

            const attrData = table.attrData.get(step.attr);
            if (!attrData) {
                throw new Error(`(${schema.name}) internal error: expected to find attrData for: ${step.attr}`)
            }
            const next = attrData.next;
            attrData.next++;
            item[step.attr] = next;
            break;
        }
    }

    return item;
}
export function insert(schema: Schema, funcName: string, table: Table, args: any[]) {
    if (args.length !== 1)
        throw new Error(`(${schema.name}).insert usage error: expected a single arg (item)`)

    const item = args[0];

    if (item == null)
        throw new Error("value error: item is null")

    preInsert(schema, table, item);

    // Store object - update every index
    for (const indexSchema of schema.indexes) {
        const index = table.indexes.get(indexSchema.name);
        index.insert(item);
    }

    if (schema.supportsListening)
        table.listenerStreams.receive({ t: c_item, item });

    return item;
}
