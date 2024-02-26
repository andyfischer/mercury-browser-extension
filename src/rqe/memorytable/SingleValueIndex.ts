import { IndexSchema } from "../table/IndexSchema";
import { TableIndexType } from "../table/Table";
import { TableIndex } from "../table/TableIndex";

export class SingleValueIndex implements TableIndex {
    item = null
    schema: IndexSchema;
    indexType: TableIndexType = 'single_value';
 
    constructor(schema: IndexSchema) {
        this.schema = schema;
    }
    items?: any;
    insert(item: any): void {
        this.item = item;
    }
 
    getAllAsList(): any[] {
        if (this.item == null)
            return [];
        return [this.item];
    }
    getAsValue() {
        return this.item;
    }
    getWithIndexKey(indexKey: any) {
        throw new Error("Single value index: does not support getWithIndexKey");
    }
    getListWithIndexKey(indexKey: any): any[] {
        throw new Error("Single value index: does not support getListWithIndexKey");
    }
    hasIndexKey(indexKey: any): boolean {
        throw new Error("Single value index: does not support hasIndexKey");
    }
    iterateWithIndexKey(indexKey: any): IterableIterator<any> {
        throw new Error("Single value index: does not support iterateWithIndexKey");
    }
    *iterateAll(): IterableIterator<any> {
        if (this.item != null)
            yield this.item;
    }
    deleteAll(): void {
        this.item = null;
    }
    deleteExistingItemWithIndexKey(indexKey: any): void {
        throw new Error("Single value index: does not support deleteWithIndexKey");
    }
    deleteItem(item: any): void {
        throw new Error("Single value index: does not support deleteItem");
    }
    deleteAllWithIndexKey(indexKey: any): void {
        throw new Error("Single value index: does not support deleteAllWithIndexKey");
    }
    updateItemChangedIndexKey(item: any, equalsFn: any) {
        // Nothing to do
    }
    updateAll(updateCallbackFn: (item: any) => any): void {
        if (this.item != null)
            this.item = updateCallbackFn(this.item);
    }
    getCount(): number {
        if (this.item == null)
            return 0;
        return 1;
    }
    updateWithIndexKey(indexKey: any, updateCallbackFn: (item: any) => any): void {
        throw new Error("Single value index: does not support updateWithIndexKey");
    }
    updateAfterItemChangedIndexKey(item: any, oldKey: any, newKey: any): void {
    }
}