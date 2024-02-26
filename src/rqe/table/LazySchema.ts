import { Schema } from "./Schema";
import { SchemaDecl } from "./SchemaDecl";
import { Table } from "./Table";
import { compileSchema } from "./compileSchema";

type DeclOrFunc = SchemaDecl | (() => SchemaDecl)

export class LazySchema<ItemType> {
    decl: DeclOrFunc
    private compiled: Schema<Table<ItemType>>

    constructor(decl: DeclOrFunc) {
        this.decl = decl;
    }

    get() {
        if (!this.compiled) {
            const actualDecl = (typeof this.decl === 'function' ? this.decl() : this.decl);
            this.compiled = compileSchema(actualDecl) as Schema<Table<ItemType>>;
            delete this.decl;
        }
        return this.compiled;
    }
    
    createTable() {
        return this.get().createTable();
    }
}

export function lazySchema<ItemType=any>(decl: DeclOrFunc) {
    return new LazySchema<ItemType>(decl);
}
