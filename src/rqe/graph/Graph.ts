
import { Handler } from '../handler'
import { parseQuery } from '../parser'
import { Query, QueryLike, toQuery } from '../query'
import { Stream } from '../Stream'
import { compileSchema, Table, Schema } from '../table'
import { GraphModule } from './GraphModule'
import { declaredFunctionToHandler } from '../handler/NativeCallback';
import { createPlan, ExpectedValue, executePlan, QueryParameters } from '../query'

export type QueryParametersLike = Map<string,any> | object

const schema_modules = compileSchema({
    name: 'graph.modules',
    attrs: [
        'id(auto)'
    ],
    funcs: [
        'listAll',
        'get(id)',
        'each',
    ]
})

const schema_graphTables = compileSchema({
    name: 'graph.tables',
    attrs: [
        'id(auto)'
    ],
    funcs: [
        'get(id)',
        'has(name)',
        'get(name)',
        'listAll',
        'each',
    ]
})

export interface GraphLike {
    query(queryLike: QueryLike, params?: QueryParametersLike): Stream
    eachHandler(): IterableIterator<Handler>
}

export function toQueryParameters(paramsLike: QueryParametersLike): QueryParameters {
    if (!paramsLike)
        return new Map();

    if (paramsLike instanceof Map)
        return paramsLike;

    const map = new Map();

    for (const [k,v] of Object.entries(paramsLike)) {
        map.set(k,v);
    }

    return map;
}

interface GraphTable {
    id?: string
    name: string
    table: Table
}

export class Graph implements GraphLike {
    modules: Table<GraphModule>
    tables: Table<GraphTable>

    constructor() {
        this.modules = schema_modules.createTable();
        this.tables = schema_graphTables.createTable();
    }

    newModule() {
        const module = new GraphModule(this);
        this.modules.insert(module);
        return module;
    }

    onModuleChange(module: GraphModule) {
        // future
    }

    query(queryLike: QueryLike, paramsLike?: QueryParametersLike): Stream {
        const query = toQuery(queryLike);

        if (query.t !== 'query')
            throw new Error("Expected a query (not multistep)");

        const params = toQueryParameters(paramsLike);
        const expectedInput: ExpectedValue = params.has('$input') ? { t: 'some_value' } : { t: 'no_value' };
        const plan = createPlan(this, {}, query, expectedInput);

        const output = new Stream();

        executePlan(plan, params, output);
        return output;
    }

    mount(handlers: Handler[]) {
        const module = this.newModule();
        module.redefine(handlers);
        return module;
    }

    exposeFunc(decl: string, func: Function) {
        const handler = declaredFunctionToHandler(decl, func);
        return this.mount([ handler ]);
    }

    *eachHandler() {
        for (const module of this.modules.each()) {
            for (const handler of module.handlers) {
                yield handler;
            }
        }
    }

    getTable<T = any>(schema: Schema<Table<T>>) {
        if (!this.tables.has_name(schema.name)) {
            this.tables.insert( { name: schema.name, table: schema.createTable() });
        }

        const entry = this.tables.get_with_name(schema.name);
        return entry.table;
    }
}
