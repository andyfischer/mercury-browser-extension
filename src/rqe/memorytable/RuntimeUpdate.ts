import { IndexSchema } from "../table/IndexSchema";
import { Schema } from "../table/Schema";
import { Table } from "../table/Table";

/*
export function updateAll(schema: Schema, funcName: string, table: Table, args: any[]) {
    if (args.length !== 1)
        throw new Error(`(${schema.name}).update usage error: expected a single arg (callback)`);

    const updateFn = args[0];

    for (const item of table.defaultIndex.iterateAll()) {
        updateOneItem(schema, table, item, updateFn);
    }
}

export function updateWithAttr(schema: Schema, funcName: string, attr: string, table: Table, args: any[]) {
    const index = table.indexes.get(attr);

    if (!index)
        throw new Error(`Schema (${schema.name}) internal error: expected to find index: ${attr}`);

    const existingKey = args[0];
    const updateFn = args[1];

    for (const item of index.iterateWithIndexKey(existingKey)) {
        updateOneItem(schema, table, item, updateFn);
    }
}
*/

interface UpdatePlan {
    schema: Schema
    mainIndex: IndexSchema
    relatedIndexes: IndexSchema[]
}

function getHintsForIndex(index: IndexSchema) {
    switch (index.indexType) {
        case 'map':
            return { mainIndexPriority: 0, allowAsRelatedUpdate: true }
        case 'multimap':
            return { mainIndexPriority: 1, allowAsRelatedUpdate: true }
        case 'list':
            return { mainIndexPriority: 2, allowAsRelatedUpdate: false }
        case 'single_value':
            return { mainIndexPriority: 0, allowAsRelatedUpdate: false }
        default:
            throw new Error('internal error: unrecognized index type: ' + index.indexType);
    }
}

function getUpdatePlan(schema: Schema): UpdatePlan {
    let bestMainIndex: IndexSchema | undefined;
    let bestMainIndexPriority = -1;

    // Find the best choice as the main index
    for (const index of schema.indexes) {
        const hints = getHintsForIndex(index);

        if (hints.mainIndexPriority > bestMainIndexPriority) {
            bestMainIndex = index;
            bestMainIndexPriority = hints.mainIndexPriority;
        }
    }

    // Find the related indexes
    const relatedIndexes: IndexSchema[] = [];

    for (const index of schema.indexes) {
        if (index.name === bestMainIndex.name)
            continue;

        const hints = getHintsForIndex(index);
        if (!hints.allowAsRelatedUpdate)
            throw new Error("can't support updateAll with this schema, this secondary index can't be updated: " + index.name);

        relatedIndexes.push(index);
    }

    return { schema, mainIndex: bestMainIndex, relatedIndexes };
}

/*
function updateOneItem(plan: UpdatePlan, table: Table, item: any, updateCallbackFn: Function) {
    // Perform an update on a single item.
    // 
    // This function is prepared for any arbitrary update, so we'll check and update
    // every index key to see if any changed.
    //
    // Consider: We could support a more efficient update function if we expanded the
    // schema to declare what (limited) fields are allowed to be updated.


    // Capture old index keys
    let savedIndexData = [];
    for (const index of table.indexes.values()) {
        savedIndexData.push(
            index.beforeUpdate(item)
        )
    }

    // Perform update
    const newItem = updateCallbackFn(item) || item;

    console.log('new item', newItem);

    // Check for index key changes

    let i = 0;
    for (const index of table.indexes.values()) {
        const savedData = savedIndexData[i];
        index.afterUpdate(item, savedData);
        i++;
    }
}
*/

function captureExistingRelatedIndexes(plan: UpdatePlan, item: any) {
    if (plan.relatedIndexes.length === 0)
        return null;

    const existingIndexes = [];
    for (const index of plan.relatedIndexes) {
        existingIndexes.push(
            index.getIndexKeyForItem(item)
        )
    }

    return existingIndexes;
}

function fixExistingRelatedIndexes(plan: UpdatePlan, table: Table, item: any, existingIndexes: any[]) {

    if (plan.relatedIndexes.length === 0)
        return null;

    let i = 0;
    for (const indexSchema of plan.relatedIndexes) {
        const existing = existingIndexes[i];

        const latest = indexSchema.getIndexKeyForItem(item);

        if (existing === latest)
            continue;

        const index = table.indexes.get(indexSchema.name);
        index.updateAfterItemChangedIndexKey(table, item, existing, latest);

        i++;
    }
}

export function prepareUpdateFunction(schema: Schema, index: IndexSchema, table: Table) {
    const plan = getUpdatePlan(schema);

    return (...args) => {
        if (args.length != 2) 
            throw new Error("updateAll: expected two args");

        const indexKey = args[0];
        const updateCallbackFn = args[1];
        const mainIndex = table.indexes.get(plan.mainIndex.name);

        mainIndex.updateWithIndexKey(indexKey, (item) => {
            const existingIndexes = captureExistingRelatedIndexes(plan, item);

            const newItem = updateCallbackFn(item) || item;

            fixExistingRelatedIndexes(plan, table, item, existingIndexes)

            return newItem;
        });
    }
}

export function prepareUpdateAllFunction(schema: Schema, table: Table) {
    const plan = getUpdatePlan(schema);

    return (...args) => {
        if (args.length > 1)
            throw new Error("updateAll: expected zero args");

        const mainIndex = table.indexes.get(plan.mainIndex.name);
        const updateCallbackFn = args[0];

        mainIndex.updateAll((item) => {
            const existingIndexes = captureExistingRelatedIndexes(plan, item);

            const newItem = updateCallbackFn(item) || item;

            fixExistingRelatedIndexes(plan, table, item, existingIndexes)

            return newItem;
        });
    }
}