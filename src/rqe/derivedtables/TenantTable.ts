import { SchemaFunc, SchemaFuncName } from "../table/Schema";
import { Schema, Table } from "../table";
import { checkInvariantsOnTable } from "../table/checkInvariants";
import { EnableTableProxyWrapper } from "../config";
import { wrapTableInDebugProxy } from "../table/TableDebugProxy";
import { listenToStream } from "../table/Listeners";
import { initializeNewTableWithStatus } from "../table/StatusTable";

interface SetupParams {
    schema: Schema
    baseTable: Table
    tenantAttr: string
    tenantAttrValue: any
}

function getForwardedFunctionWithAddedTenantParam(setup: SetupParams, tenantFunc: SchemaFunc) {
    const funcName = tenantFunc.funcName;
    const baseParamAttrs = tenantFunc.paramAttrs.concat(setup.tenantAttr);
    const baseFunc = setup.baseTable.schema.findFuncWithParams(funcName, baseParamAttrs);

    if (!baseFunc) {
        console.log(setup.baseTable.schema.funcs);
        throw new Error(`Can't support '${funcName}(${tenantFunc.paramAttrs.join(', ')})' because base table doesn't support '${funcName}(${baseParamAttrs.join(', ')})'`);
    }

    let forwardToFuncName = baseFunc.publicName;

    // Make a plan for how to map the incoming args.
    let argMapSteps = [];

    for (const baseParam of baseFunc.paramAttrs) {
        if (baseParam === setup.tenantAttr) {
            argMapSteps.push({ t: 'use_tenant_attr' });
        } else {
            argMapSteps.push({ t: 'use_arg', index: tenantFunc.findParamIndex(baseParam) });
        }
    }

    return (...args) => {
        let mappedArgs = [];
        for (const step of argMapSteps) {
            if (step.t === 'use_tenant_attr') {
                mappedArgs.push(setup.tenantAttrValue);
            } else if (step.t === 'use_arg') {
                mappedArgs.push(args[step.index]);
            }
        }
        return setup.baseTable[forwardToFuncName](...mappedArgs);
    };
}

function getCallbackForSchemaFunc(func: SchemaFunc, setup: SetupParams, table: Table) {
    function convertTenantItemToBaseItem(item: any) {
        return { ...item, [setup.tenantAttr]: setup.tenantAttrValue };
    }

    function convertBaseItemToTenantItem(item: any) {
        item = { ...item }
        delete item[setup.tenantAttr];
        return item;
    }

    switch (func.funcName) {

    case 'preInsert':
        return (...args) => table.preInsert(...args);

    case 'each': {
        // console.log(setup.baseTable.schema.funcs);
        const baseFunc = setup.baseTable.schema.findFuncWithParams('listWithIndexKey', [setup.tenantAttr]);
        if (!baseFunc)
            throw new Error(`Can't support '${func.funcName}' because base table doesn't support 'list(${setup.tenantAttr})'`);

        const forwardToFuncName = baseFunc.publicName;
    
        return function*() {
            for (const item of setup.baseTable[forwardToFuncName](setup.tenantAttrValue)) {
                yield convertBaseItemToTenantItem(item);
            }
        }
    }

    case 'listAll': {
        const baseFunc = setup.baseTable.schema.findFuncWithParams('listWithIndexKey', [setup.tenantAttr]);
        if (!baseFunc)
            throw new Error(`Can't support '${func.funcName}' because base table doesn't support 'list(${setup.tenantAttr})'`);

        const forwardToFuncName = baseFunc.publicName;

        return function() {
            return setup.baseTable[forwardToFuncName](setup.tenantAttrValue).map(convertBaseItemToTenantItem);
        }
    }

    case 'deleteAll': {
        const baseFunc = setup.baseTable.schema.findFuncWithParams('deleteWithIndexKey', [setup.tenantAttr]);
        if (!baseFunc)
            throw new Error(`Can't support '${func.funcName}' because base table doesn't support 'delete(${setup.tenantAttr})'`);

        const forwardToFuncName = baseFunc.publicName;

        return function() {
            return setup.baseTable[forwardToFuncName](setup.tenantAttrValue);
        }
    }

    case 'getWithIndexKey': 
    case 'listWithIndexKey':
    case 'has':
    case 'deleteWithIndexKey':
        return getForwardedFunctionWithAddedTenantParam(setup, func);

    case 'itemEquals': {
        table.assertSupport('itemEquals');
        return (a,b) => table.itemEquals(convertTenantItemToBaseItem(a), convertTenantItemToBaseItem(b));
    }

    case 'deleteItem': {
        return (item) => table.deleteItem(convertTenantItemToBaseItem(item));
    }

    case 'item_to_uniqueKey': {
        table.assertSupport('item_to_uniqueKey');
        return (item) => table.item_to_uniqueKey(convertTenantItemToBaseItem(item));
    }

    case 'getStatus':
        return () => table.status;

    case 'listenToStream':
        return (...args) => listenToStream(table, args);

    case 'item_matches_uniqueKey':
    case 'get_using_uniqueKey':
    case 'delete_using_uniqueKey': {
        return () => { throw new Error(func.funcName + " is not really supported on tenant tables") }
    }

    }

    throw new Error("couldn't support: " + func.funcName);
}

export function createTenantTable(setup: SetupParams) {

    const schema = setup.schema;

    const tableObject: Table = {
        t: 'table',
        schema,
        insert: function (item: any) {
            item = {
                ...item,
                [setup.tenantAttr]: setup.tenantAttrValue,
            }
            return setup.baseTable.insert(item);
        },
        deleteUsingIndex: function (indexName: string, indexKey: any): void {
            throw new Error("Function not implemented.");
        },
        supportsFunc(funcName: string) {
            return schema.supportsFunc(funcName)
        },
        assertSupport(funcName: string) {
            schema.assertSupportsFunc(funcName);
        },
        assertFitsSchema(schema: Schema) {
            schema.assertFitsSchema(schema);
        },
        checkInvariants() {
            checkInvariantsOnTable(tableObject)
        },
    }

    // Create callbacks for each func.
    for (const func of schema.funcsByPublicName.values()) {
        if (func.funcName === 'insert')
            // already initialized
            continue;

        const callback = getCallbackForSchemaFunc(func, setup, tableObject);
        tableObject[func.publicName] = callback;

        if (func.declaredName)
            tableObject[func.declaredName] = callback;
    }

    if (schema.supportsStatusTable)
        initializeNewTableWithStatus(tableObject);

    let result: Table = tableObject;

    if (EnableTableProxyWrapper) {
        // Create a proxy for better error messages (todo- make this an optional debugging mode?)
        result = wrapTableInDebugProxy(schema, result);
    }

    return result;
}