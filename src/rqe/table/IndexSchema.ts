import { getIndexKeyForItem } from "./IndexUtils"
import { Schema } from "./Schema"
import { TableIndexType } from "./Table"

export class IndexSchema {
    name: string
    indexType: TableIndexType
    attrs: string[]
    schema: Schema

    constructor(schema: Schema) {
        this.schema = schema;
    }

    getIndexKeyForItem(item: any) {
        return getIndexKeyForItem(this.attrs, item);
    }
}
