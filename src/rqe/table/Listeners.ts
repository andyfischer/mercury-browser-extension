import { Table } from './Table'
import { Stream, StreamEvent, c_schema, c_start_updates } from '../Stream'
import { streamToTable, StreamToTableCallbacks } from './streamToTable'
import { Schema } from './Schema'
import { SchemaDecl } from './SchemaDecl'
import { Query } from '../query/Query'
import { toQuery } from '../query/toQuery'

export interface TableListenPlan {
    deletionIndexName?: string
    deletionFunc?: string
}

export interface ListenToTableOptions {
    getInitialData?: boolean
    deletionIndexName?: string
}

function getSchemaForListener(schema: Schema): SchemaDecl {
    const output: SchemaDecl = {name: schema.name + '/listener', funcs: []};

    for (const funcDecl of schema.decl.funcs || []) {
        const parsed = toQuery(funcDecl) as Query;
        const parsedFuncName = parsed.tags[0].attr;

        if (parsedFuncName === 'delete') {
            output.funcs.push(funcDecl);
        }
    }

    return output;
}

export function listenToTable(table: Table, options: ListenToTableOptions = {}) {
    let stream: Stream;

    if (options.deletionIndexName) {
        const index = table.schema.indexesByName.get(options.deletionIndexName);
        if (!index)
            throw new Error("No index with name: " + options.deletionIndexName);

        const deletionFuncName = table.schema.getPublicFuncNameForDeleteUsingIndex(options.deletionIndexName);

        const plan: TableListenPlan = {
            deletionIndexName: options.deletionIndexName,
            deletionFunc: deletionFuncName,
        };

        stream = table.listenerStreams.add(plan);

        // Prepare for deletion events using this specific key.
        const schema: SchemaDecl = {
            name: table.schema.name + '/listener/' + plan.deletionIndexName,
            funcs: [
                plan.deletionFunc,
            ],
        };
        stream.receive({ t: c_schema, schema });
    } else {
        // No listen plan. Prepare for any deletion events that the table supports.
        stream = table.listenerStreams.add();
        stream.receive({ t: c_schema, schema: getSchemaForListener(table.schema) });
    }

    if (options?.getInitialData) {
        for (const item of table.each())
            stream.put(item);
        stream.done();
    }

    stream.receive({ t: c_start_updates });

    return stream;
}

export function listenToStream(table: Table, args: any[]) {
    if (args.length == 0)
        throw new Error("expected one or two args for .listenToStream");

    const input: Stream = args[0];
    const callbacks: StreamToTableCallbacks = args[1] || {}

    return streamToTable({ input, table, ...callbacks });
}
