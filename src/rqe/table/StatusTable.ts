
import { compileSchema } from './compileSchema'
import { Schema } from './Schema'
import { Table } from './Table'
import { StreamEvent } from '../Stream'
import { ErrorItem } from '../Errors'
import { lazySchema } from './LazySchema'

export interface StatusTableItem {
    statusType: 'loading' | 'error' | 'done'
    error?: ErrorItem
    isDuringPatch?: boolean
    pendingPatchEvents?: StreamEvent[]
}

const StatusTableSchema = lazySchema<StatusTableItem>({
    name: 'TableStatus',
    funcs: [
        'get',
        'listen',
    ]
});

export function initializeNewTableWithStatus(tableObject: Table) {

    const statusTable = StatusTableSchema.get().createTable();
    statusTable.set({ statusType: 'loading' });

    tableObject.status = statusTable;

    tableObject.isLoading = () => {
        const status = statusTable.get();
        if (!status)
            throw new Error("StatusTable internal error: missing status value?");
        return status.statusType === 'loading'
    }

    tableObject.isReady = () => {
        const status = statusTable.get();
        if (!status)
            throw new Error("StatusTable internal error: missing status value?");
        return status.statusType === 'done';
    }

    tableObject.hasError = () => {
        const status = statusTable.get();
        if (!status)
            throw new Error("StatusTable internal error: missing status value?");
        return status.statusType === 'error';
    }
    
    tableObject.getError = () => {
        const status = statusTable.get();
        if (!status)
            throw new Error("StatusTable internal error: missing status value?");
        if (status.statusType !== 'error')
            return null;

        return status.error;
    }

    tableObject.waitForData = () => {
        let resolve, reject;;
        const promise = new Promise<void>((_resolve, _reject) => { resolve = _resolve; reject = _reject; });

        if (tableObject.hasError()) {
            reject(tableObject.getError());
            return promise;
        }

        if (!tableObject.isLoading()) {
            resolve();
            return promise;
        }

        const listenerStream = statusTable.listen();

        listenerStream.sendTo({
            receive: (msg) => {
                if (tableObject.hasError()) {
                    listenerStream.closeByDownstream();
                    reject(tableObject.getError());
                }
                else if (!tableObject.isLoading()) {
                    listenerStream.closeByDownstream();
                    resolve();
                }
            }
        });

        return promise;
    }
}
