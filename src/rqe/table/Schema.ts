
import { Table, TableIndexType } from './Table'
import { PreInsertStep, TableInitStep } from './CompiledSteps'
import { compileSchema } from './compileSchema'
import { SchemaDecl } from './SchemaDecl'
import { createMemoryTable } from '../memorytable/createMemoryTable'
import { convertSchemaToSingular } from './convertSchemaToSingular'
import { IndexSchema } from './IndexSchema'

export function fromLooseSchema(loose: LooseSchema): Schema {
    if (loose instanceof Schema)
        return loose;

    return compileSchema(loose as SchemaDecl);
}

export type LooseSchema = Schema | SchemaDecl

export class SchemaAttr {
    attr: string
    isAuto?: boolean
    frozen: boolean

    constructor(attr: string) {
        this.attr = attr;
    }

    freeze() {
        if (this.frozen)
            return;

        this.frozen = true;
        Object.freeze(this);
    }
}

export type SchemaFuncName = 'insert' | 'preInsert'
    | 'listAll'
    | 'getWithIndexKey' | 'listWithIndexKey'
    | 'each' | 'eachWithFilter'
    | 'first' | 'count'
    | 'getSingleValue' | 'setSingleValue'
    | 'has'
    | 'update' | 'updateWithIndexKey'
    | 'deleteWithIndexKey'
    | 'deleteItem' | 'deleteAll'
    | 'replaceAll'
    | 'itemEquals'
    | 'upgradeSchema'
    | 'item_to_uniqueKey' | 'item_matches_uniqueKey' | 'get_using_uniqueKey' | 'delete_using_uniqueKey'
    | 'listen' | 'listenToStream' | 'getStatus'
    | 'diff' ;

interface SchemaFuncParams {
    funcName: SchemaFuncName
    declaredName?: string
    publicName?: string
    paramAttrs?: string[]
    indexName?: string
}

export class SchemaFunc {
    publicName: string
    declaredName: string
    funcName: SchemaFuncName
    paramAttrs: string[] | null
    indexName: string | null

    constructor(params: SchemaFuncParams) {
        this.funcName = params.funcName;
        this.declaredName = params.declaredName;
        this.publicName = params.publicName || params.funcName;
        this.paramAttrs = params.paramAttrs || null;
        this.indexName = params.indexName || null;
    }

    findParamIndex(attr: string) {
        for (let i = 0; i < this.paramAttrs.length; i++) {
            if (this.paramAttrs[i] === attr)
                return i;
        }
        throw new Error("Param not found: " + attr);
    }
}

export class Schema<TableType extends Table<any> = Table<any>> {
    name: string
    decl: SchemaDecl
    attrs: SchemaAttr[] = []
    funcs: SchemaFunc[] = []
    funcsByPublicName = new Map<string, SchemaFunc>()
    funcsByDeclaredName = new Map<string, SchemaFunc>()
    indexes: IndexSchema[] = []
    indexesByName = new Map<string, IndexSchema>()
    primaryUniqueIndex: IndexSchema
    primaryUniqueAttr: string | null
    defaultIndex: IndexSchema
    supportsListening: boolean
    supportsStatusTable: boolean

    setupTable: TableInitStep[] = []
    preInsert: PreInsertStep[] = []

    frozen: boolean

    constructor(decl: SchemaDecl) {
        this.decl = decl;
        this.name = decl.name;
    }

    freeze() {
        if (this.frozen)
            return;
        for (const attr of this.attrs)
            attr.freeze();
        Object.freeze(this.funcs);
        Object.freeze(this.funcsByPublicName);
        Object.freeze(this.funcsByDeclaredName);
        this.frozen = true;
        Object.freeze(this);
    }

    createTable(): TableType {
        return createMemoryTable(this) as TableType;
    }

    addFuncs(funcs: string[]) {
        const updatedDecl = {
            ...this.decl,
            funcs: this.decl.funcs.concat(funcs)
        }
        return compileSchema(updatedDecl);
    }

    toSingular({funcs}: { funcs: string[] }) {
        return convertSchemaToSingular(this.decl, { funcs });
    }

    addIndex(index: IndexSchema) {
        this.indexes.push(index);
        this.indexesByName.set(index.name, index);
    }

    getIndexByName(indexName: string) {
        return this.indexesByName.get(indexName);
    }

    *eachIndex() {
        yield* this.indexes
    }

    checkSupportsFunc(funcName: string) {
        return (this.funcsByPublicName.has(funcName) || this.funcsByDeclaredName.has(funcName));
    }

    assertSupportsFunc(funcName: string) {
        if (!this.checkSupportsFunc(funcName))
            throw new Error(`Schema doesn't support: ${funcName}()`);
    }

    checkFitsSchema(schema: Schema) {
        for (const funcName of schema.funcsByPublicName.keys()) {
            if (!this.checkSupportsFunc(funcName))
                return false;
        }
        return true;
    }

    assertFitsSchema(schema: Schema) {
        for (const funcName of schema.funcsByPublicName.keys()) {
            this.assertSupportsFunc(funcName);
        }
    }

    supportsFunc(funcName: string): boolean {
        return this.funcsByPublicName.has(funcName);
    }

    findFuncWithParams(funcName: SchemaFuncName, paramAttrs: string[]): SchemaFunc | null {
        for (const func of this.funcs) {
            if (func.funcName !== funcName)
                continue;

            function matchesParams() {
                if (func.paramAttrs.length !== paramAttrs.length)
                    return false;

                for (const expectedAttr of paramAttrs) {
                    if (!func.paramAttrs.includes(expectedAttr))
                        return false;
                }
                return true;
            }

            if (!matchesParams())
                continue;

            return func;
        }
        return null;
    }

    getPublicFuncNameForDeleteUsingIndex(indexName: string) {
        const index: IndexSchema = this.indexesByName.get(indexName);
        if (!index)
            throw new Error(`Index not found: ${indexName}`);

        return `delete(${index.attrs.join(' ')})`;
    }
}
