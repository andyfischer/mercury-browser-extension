
import { Table } from './Table'

export interface Create {
    t: 'put',
    key: any
    item: any
}

export interface Delete {
    t: 'delete',
    key: any
    item: any
}

export type DiffItem = Create | Delete

export function* diffTables(original: Table, compare: Table): IterableIterator<DiffItem> {

    // Check original items.
    for (const originalItem of original.each()) {
        const key = original.item_to_uniqueKey(originalItem);
        const foundCompare = compare.get_using_uniqueKey(key);

        if (!foundCompare) {
            yield {
                t: 'delete',
                key,
                item: originalItem,
            }
        }
    }

    // Check compare items.
    for (const compareItem of compare.each()) {
        const key = compare.item_to_uniqueKey(compareItem);
        const foundExisting = original.get_using_uniqueKey(key);
        if (!foundExisting) {
            yield {
                t: 'put',
                key,
                item: compareItem,
            }
        }
    }
}
