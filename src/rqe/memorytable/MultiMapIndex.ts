import { MultiMap } from "../utils";
import { IndexSchema } from "../table/IndexSchema";
import { ItemEqualityFn } from "../table/IndexUtils";
import { Table, TableIndexType } from "../table/Table";
import { TableIndex } from "../table/TableIndex";

export class MultiMapIndex implements TableIndex {
    items = new MultiMap();
    schema: IndexSchema;
    indexType: TableIndexType = 'map';

    constructor(schema: IndexSchema) {
        this.schema = schema;
    }

    insert(item: any): void {
        const indexKey = this.schema.getIndexKeyForItem(item);
        this.items.add(indexKey, item);
    }

    getWithIndexKey(indexKey: any) {
        const found = this.items.get(indexKey);
        if (!found)
            return null;
        return found[0];
    }
    getListWithIndexKey(indexKey: any): any[] {
        return this.items.get(indexKey);
    }
    hasIndexKey(indexKey: any): boolean {
        return this.items.has(indexKey);
    }
    getAllAsList(): any[] {
        return Array.from(this.items.values());
    }
    getAsValue() {
        return Array.from(this.items.values());
    }
    *iterateWithIndexKey(indexKey: any): IterableIterator<any> {
        yield* this.items.get(indexKey)
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

        this.items.filterItemsOnKey(indexKey, existingItem => {
            return !isEqual(existingItem);
        });
    }
    updateItemChangedIndexKey(item: any, isEqual: ItemEqualityFn, oldIndex: any, newIndex: any): void {
        this.items.filterItemsOnKey(oldIndex, existingItem => {
            return isEqual(existingItem);
        });

        this.items.add(newIndex, item);
    }
    getCount(): number {
        return this.items.valueCount()
    }
    updateAll(updateCallbackFn: (item: any) => any): void {
        let needToAdd = [];

        for (const key of this.items.keys()) {
            this.items.mapItemsOnKey(key, existingItem => {
                const newItem = updateCallbackFn(existingItem);
                const newKey = this.schema.getIndexKeyForItem(newItem);
                if (newKey === key) {
                    return newItem;
                } else {
                    needToAdd.push([newKey, newItem]);
                    return null;
                }
            });
        }

        for (const [newKey, newItem] of needToAdd) {
            this.items.add(newKey, newItem);
        }
    }
    updateWithIndexKey(indexKey: any, updateCallbackFn: (item: any) => any): void {
        this.items.mapItemsOnKey(indexKey, updateCallbackFn);
    }
    updateAfterItemChangedIndexKey(table: Table, item: any, oldKey: any, newKey: any): void {
        this.items.filterItemsOnKey(oldKey, existingItem => {
            return !table.itemEquals(existingItem, item);
        });
        this.items.add(newKey, item);
    }
}