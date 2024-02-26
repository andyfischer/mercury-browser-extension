import type { IndexSchema } from "./IndexSchema"
import type { ItemEqualityFn } from "./IndexUtils"
import { Table, TableIndexType } from "./Table"

export interface TableIndex<ItemType = any> {
    schema: IndexSchema
    items?: any
    indexType: TableIndexType

    getWithIndexKey(indexKey: any): ItemType
    getListWithIndexKey(indexKey: any): ItemType[]
    hasIndexKey(indexKey: any): boolean
    getAllAsList(): ItemType[]
    getAsValue(): any
    iterateAll(): IterableIterator<ItemType>
    iterateWithIndexKey(indexKey: any): IterableIterator<ItemType>
    deleteAll(): void
    deleteAllWithIndexKey(indexKey: any): void
    deleteItem(item: any, isEqual: ItemEqualityFn): void
    updateItemChangedIndexKey(item: any, isEqual: ItemEqualityFn, oldIndex: any, newIndex: any): void
    getCount(): number
    insert(item): void

    updateAll(updateCallbackFn: (item: any) => any): void
    updateWithIndexKey(indexKey: any, updateCallbackFn: (item: any) => any): void
    updateAfterItemChangedIndexKey(table: Table, item: any, oldKey: any, newKey: any): void
}