
import { Table } from './Table'
import { each, count } from '../memorytable/RuntimeFunctions'
import { formatItem } from '../Format'

const Threshold_MaxItemCountForFullItemCheck = 1000;

export function checkInvariantsOnTable(table: Table) {
    const schema = table.schema;

    function error(message) {
        return new Error(`Invariant check failed (on schema: ${schema.name}): ${message}`);
    }

    function* eachIndex() {
        for (const indexSchema of schema.indexes) {
            yield { index: table.indexes.get(indexSchema.name), indexSchema }
        }
    }

    // walk through the default index
    const defaultIndex = table.indexes.get(schema.defaultIndex.name);

    const itemCount = count(table.schema, table, []);

    if (!defaultIndex)
        throw error("Primary index not found");

    const byUniqueKey = new Map();

    if (table.supportsFunc('item_to_uniqueKey')) {
        let defaultIndexItemCount = 0;

        for (const item of defaultIndex.iterateAll()) {
            const uniqueKey = table.item_to_uniqueKey(item);
            if (!uniqueKey)
                throw error("item_to_uniqueKey returned falsy: " + uniqueKey);

            if (byUniqueKey.has(uniqueKey))
                throw error("Duplicate items for a uniqueKey: " + uniqueKey)

            byUniqueKey.set(uniqueKey, item);
            defaultIndexItemCount++;
        }

        if (defaultIndexItemCount !== itemCount) {
            throw error(`item count mismatch, count() returned ${itemCount} and each() returned ${defaultIndexItemCount}`);
        }

        // Look up on each index and make sure we get the same items
        for (const { index, indexSchema } of eachIndex()) {
            let thisIndexCount = 0;
            for (const compareItem of index.iterateAll()) {
                const uniqueKey = table.item_to_uniqueKey(compareItem);
                if (!uniqueKey)
                    throw error("item_to_uniqueKey returned falsy: " + uniqueKey);

                if (!byUniqueKey.has(uniqueKey)) {
                    console.log('item: ', compareItem)
                    throw error(`index '${indexSchema.name}' has an item that wasn't in the default index, uniqueKey=${uniqueKey}`)
                }

                thisIndexCount++;
            }

            if (thisIndexCount !== defaultIndexItemCount)
                throw error(`index '${indexSchema.name}' had a different item count than the default index (found ${thisIndexCount}, expected ${defaultIndexItemCount})`)
        }
    }

    // Check every item (without using item_to_uniqueKey)
    if (itemCount < Threshold_MaxItemCountForFullItemCheck) {
        const everyItem = [];
        for (const item of defaultIndex.iterateAll()) {
            everyItem.push(formatItem(item));
        }
        everyItem.sort();

        for (const { index, indexSchema } of eachIndex()) {
            const everyItemOnThisIndex = [];
            for (const item of index.iterateAll()) {
                everyItemOnThisIndex.push(formatItem(item));
            }
            everyItemOnThisIndex.sort();

            const defaultIndexItemCount = everyItem.length;
            const thisIndexCount = everyItemOnThisIndex.length;

            if (thisIndexCount !== defaultIndexItemCount) {
                throw error(`index '${indexSchema.name}' `
                            +`had a different item count than the default index `
                            +`(found ${thisIndexCount}, expected ${defaultIndexItemCount})`)
            }

            for (let i=0; i < defaultIndexItemCount; i++) {
                if (everyItem[i] !== everyItemOnThisIndex[i]) {
                    throw error(`index '${indexSchema.name}' `
                            +`had a different item than the default index. `
                            +`Default index has (${everyItem[i]}), this index has (${everyItemOnThisIndex[i]})`);
                }
            }
        }
    }

    if (table.supportsFunc('each')) {
        // Validate every item from each()
        for (const item of table.each()) {
            if (item == null)
                throw error("each() saw a null value")
        }
    }
}
