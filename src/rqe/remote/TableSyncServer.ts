
import { Table, lazySchema } from '../table'
import { Stream } from '../Stream'
import type { ListenToTableRequest } from './TransportTypes'

export interface TableShareSettings {
    name?: string
}

interface SharedTable {
    name: string
    settings?: TableShareSettings
    table: Table
}

const VerboseLogs = false;

const SyncedTablesSchema = lazySchema<SharedTable>({
    name: 'SyncedTables',
    funcs: [
        'get(name)',
        'has(name)',
        'each',
    ]
});

export class TableSyncServer {
    servingTables = SyncedTablesSchema.get().createTable();
    protocolDetails: Table

    constructor(protocolDetails: Table) {
        this.protocolDetails = protocolDetails;
    }

    createTable(name: string) {
        if (!this.protocolDetails)
            throw new Error("createTable: need to provide protocolDetails");

        const info = this.protocolDetails.get_with_name('listen/' + name);

        if (!info || !info.responseSchema)
            throw new Error("no protocol response schema for: listen/" + name);

        const table = info.responseSchema.createTable();
        table.assertSupport('listen');
        this.servingTables.insert({name, table});
        return table;
    }

    getServedData(name: string) {
        if (this.servingTables.has_name(name))
            return this.servingTables.get_with_name(name);
        else
            return this.createTable(name);
    }

    serve(table: Table, settings: TableShareSettings = {}) {
        const name = settings.name || table.schema.name;
        table.assertSupport('listen');
        this.servingTables.insert({name, settings, table });
    }

    onConnect() { }

    handleListenRequest(req: ListenToTableRequest, output: Stream) {
        if (VerboseLogs)
            console.log('TableSyncServer.handleListenToTable', req);
        const name = req.name;

        if (!this.servingTables.has_name(name)) {
            if (VerboseLogs)
                console.log('TableSyncServer.handleListenToTable failed, not found: ' + name);
            output.closeWithError({ errorType: 'not_found' });
            return
        }

        const found: SharedTable = this.servingTables.get_with_name(name);
        found.table.listen(req.options).sendTo(output);
    }
}
