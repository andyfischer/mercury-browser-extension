import { IndexSchema } from "../table/IndexSchema";
import { TableIndex } from "../table/TableIndex";
import { ItemEqualityFn } from "../table/IndexUtils";
import { Table, TableIndexType } from "../table/Table";

export class MapIndex<ItemType = any> implements TableIndex {
    items = new Map<any, ItemType>();
    schema: IndexSchema;
    indexType: TableIndexType = 'map';

    constructor(schema: IndexSchema) {
        this.schema = schema;
    }

    insert(item: any): void {
        const indexKey = this.schema.getIndexKeyForItem(item);
        this.items.set(indexKey, item);
    }

    getWithIndexKey(indexKey: any) {
        return this.items.get(indexKey);
    }
    getListWithIndexKey(indexKey: any): any[] {
        return [ this.items.get(indexKey) ];
    }
    hasIndexKey(indexKey: any): boolean {
        return this.items.has(indexKey);
    }
    getAllAsList() {
        return Array.from(this.items.values());
    }
    getAsValue() {
        return Array.from(this.items.values());
    }

    *iterateWithIndexKey(indexKey: any): IterableIterator<any> {
        if (this.items.has(indexKey))
            yield this.items.get(indexKey);
    }

    *iterateAll(): IterableIterator<any> {
        yield* this.items.values();
    }
    deleteAll() {
        this.items.clear();
    }
    deleteAllWithIndexKey(indexKey: any): void {
        this.items.delete(indexKey);
    }
    deleteItem(item: any, isEqual: ItemEqualityFn): void {
        const indexKey = this.schema.getIndexKeyForItem(item);
        const existing = this.items.get(indexKey);

        if (!existing)
            return;

        if (isEqual(existing))
            this.items.delete(indexKey);
    }
    updateItemChangedIndexKey(item: any, existingIndex: any, newIndex: any) {
    }
    getCount(): number {
        return this.items.size
    }
    updateAll(updateCallbackFn: (item: any) => any): void {
        for (const key of this.items.keys()) {
            const newItem = updateCallbackFn(this.items.get(key));
            const newKey = this.schema.getIndexKeyForItem(newItem);
            if (key === newKey) {
                this.items.set(key, newItem);
            } else {
                this.items.delete(key);
                this.items.set(newKey, newItem);
            }
        }
    }
    updateWithIndexKey(indexKey: any, updateCallbackFn: (item: any) => any): void {
        this.items.set(indexKey, updateCallbackFn(this.items.get(indexKey)));
    }

    updateAfterItemChangedIndexKey(table: Table, item: any, oldKey: any, newKey: any): void {
        if (table.itemEquals(this.items.get(oldKey), item)) {
            this.items.delete(oldKey);
        }
        this.items.set(newKey, item);
    }
}
