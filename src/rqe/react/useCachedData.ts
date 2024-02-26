

import { CacheItemHandle, FunctionCache } from '../cache'
import { Schema, Table, compileSchema, lazySchema } from '../table'
import { debounceCallback } from '../utils'

const VerboseLogHookActivity = false;
const VeryVerboseLogHookActivity = false;

interface Env {
    useState: <T = any>(initialData: any) => [T, (newData: T) => void]
    useEffect: (callback: any, params: any) => any
    cache: FunctionCache
    requestDetails?: Table
}

const GenericCachedDataSchema = lazySchema({
    name: 'GenericCachedData',
    funcs: [ 'each', 'listAll', 'deleteAll', 'status', 'listenToStream', 'count', 'upgradeSchema', ]
});

function getResultSchema(env: Env, request: any): Schema {
    const details = request.t && env.requestDetails && env.requestDetails.get_with_name(request.t);

    if (!details) {
        return GenericCachedDataSchema.get();
    }

    if (!details.responseSchemaCompiled) {
        details.responseSchemaCompiled = compileSchema(details.responseSchema);
    }
    
    return details.responseSchemaCompiled;
}

export function useCachedData(env: Env, request: any, requestContext: any = null): Table {

    // console.log('useCachedData requesting', req)

    const [ _, setUpdateVer ] = env.useState(0);

    const [ { handle, resultTable } ] = env.useState<{ handle:CacheItemHandle, resultTable: Table }>(() => {
        if (VerboseLogHookActivity)
            console.log('useData - initializing state for', request);

        const handle = env.cache.newHandle();

        const schema = getResultSchema(env, request);
        const resultTable = schema.createTable();
        resultTable.status.set({ statusType: 'loading' });

        return { handle, resultTable };
    });

    env.useEffect(() => {
        if (VerboseLogHookActivity)
            console.log('useCachedData - starting listener', request);

        const onChange = debounceCallback(10, () => {
            if (VeryVerboseLogHookActivity) {
                console.log('useCachedData - onChange callback has triggered', request);
            }

            setUpdateVer(updateVer => updateVer + 1)
        });

        handle.refresh(request, requestContext);

        const stream = handle.startListening();
        resultTable.listenToStream(stream, {
            afterUpdate: onChange,
        });

        if (VerboseLogHookActivity)
            console.log('useData - listener started for ', request);

        const timeoutCheck = setTimeout((() => {
            if (resultTable.isLoading()) {
                console.warn('useCachedData - still loading after 5 seconds', request);
            }
        }), 5000)

        return () => {
            if (VerboseLogHookActivity)
                console.log('useCachedData - cleanup and close listener ', request);
            handle.close();

            clearTimeout(timeoutCheck);
        }
    }, []);

    // Call refresh on every re-render
    handle.refresh(request);

    return resultTable;
}

