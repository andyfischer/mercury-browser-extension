
import { toQuery, } from '../query/toQuery'
import { Table } from './Table'
import { Schema, SchemaAttr, SchemaFunc } from './Schema'
import { Query } from '../query'
import { SchemaDecl } from './SchemaDecl'
import { IndexSchema } from './IndexSchema'
import { queryToString } from '../query/queryToString'

interface IndexDemand {
    attrs: string[]
    implySingleIndex?: boolean
    requireMultiIndex?: boolean
}

export function compileSchema<ItemType = any>(decl: SchemaDecl): Schema<Table<ItemType>> {
    const schema = new Schema(decl);
    const attrByStr = new Map<string, SchemaAttr>();
    const indexesNeeded = new Map<string, IndexDemand >();

    function needIndex(demand: IndexDemand) {
        const name = demand.attrs.join(',');

        if (!indexesNeeded.has(name)) {
            indexesNeeded.set(name, demand);
        } else {
            const existing = indexesNeeded.get(name);
            existing.implySingleIndex = existing.implySingleIndex || demand.implySingleIndex;
            existing.requireMultiIndex = existing.requireMultiIndex || demand.requireMultiIndex;
        }

        return { name }
    }

    function declareFunc(func: SchemaFunc) {
        if (schema.funcsByPublicName.has(func.publicName))
            return;
        
        schema.funcs.push(func);
        schema.funcsByPublicName.set(func.publicName, func);

        if (func.declaredName)
            schema.funcsByDeclaredName.set(func.declaredName, func);
    }

    // Parse decl.attrs
    for (const attrDecl of decl.attrs || []) {
        let parsed = toQuery(attrDecl);

        parsed = parsed as Query;

        // first tag should be the attr name
        const attrTag = parsed.tags[0];
        const attrName = parsed.tags[0].attr;

        const attrInfo = new SchemaAttr(attrName);

        if (attrByStr.has(attrName))
            throw new Error("duplicate attr: " + attrName);

        if (attrTag.isQuery()) {
            for (const tag of (attrTag.value as Query).tags) {
                if (tag.attr === 'auto') {
                    attrInfo.isAuto = true;
                    continue;
                }

                throw new Error(`unrecognized tag on attr "${attrName}": ${tag.attr}`);
            }
        }

        for (const tag of parsed.tags.slice(1)) {
            if (tag.attr === 'auto') {
                attrInfo.isAuto = true;
                continue;
            }

            throw new Error(`unrecognized tag on attr "${attrName}": ${tag.attr}`);
        }

        attrByStr.set(attrName, attrInfo);
        schema.attrs.push(attrInfo);
    }

    // Default functions that are always included.
    declareFunc(new SchemaFunc({funcName: 'each'}));
    declareFunc(new SchemaFunc({funcName: 'insert'}));
    declareFunc(new SchemaFunc({funcName: 'preInsert'}));

    const parsedFuncDecls: Query[] = [];

    for (const funcDecl of decl.funcs || []) {
        const funcDeclStr = queryToString(funcDecl);
        const parsed = toQuery(funcDecl) as Query;
        parsedFuncDecls.push(parsed);
        const parsedFuncName = parsed.tags[0].attr;
        
        // console.log(`parsed func decl (${funcDecl}):`, parsed)

        if (parsedFuncName === 'get' && parsed.tags[0].isQuery()) {
            // Single attr get
            const queryArgs = (parsed.tags[0].value as Query);
            const attrStrs = queryArgs.tags.map(tag => tag.attr);
            const { name: indexName } = needIndex({ attrs: attrStrs, implySingleIndex: true });

            // get_with_x_y
            const publicName = 'get_with_' + (attrStrs.join('_'));
            declareFunc(new SchemaFunc({ declaredName: funcDeclStr, funcName: 'getWithIndexKey', publicName, paramAttrs: attrStrs, indexName }));
            continue;
        }

        if (parsedFuncName === 'get' && parsed.tags[0].value == null) {
            // Single value get
            
            declareFunc(new SchemaFunc({ funcName: 'getSingleValue', publicName: 'get' }));
            declareFunc(new SchemaFunc({ funcName: 'setSingleValue', publicName: 'set' }));
            const index = new IndexSchema(schema);
            index.indexType = 'single_value';
            schema.indexes.push(index)

            continue;
        }

        if (parsedFuncName === 'has') {
            const queryArgs = (parsed.tags[0].value as Query)
            const attrStrs = queryArgs.tags.map(tag => tag.attr);

            if (!queryArgs)
                throw new Error("has() requires a parameter")

            if (queryArgs.tags.length === 0)
                throw new Error("has() requires a parameter")

            const { name: indexName } = needIndex({ attrs: attrStrs });
            const publicName = 'has_' + (attrStrs.join('_'));;
            declareFunc(new SchemaFunc({ funcName: 'has', declaredName: funcDeclStr, publicName, paramAttrs: attrStrs, indexName }));
            continue;
        }

        if (parsedFuncName === 'list') {
            const queryArgs = (parsed.tags[0].value as Query)
            const attrStrs = queryArgs.tags.map(tag => tag.attr);
            const { name: indexName } = needIndex({ attrs: attrStrs, requireMultiIndex: true });

            // list_with_x_y
            const publicName = 'list_with_' + (attrStrs.join('_'));
            declareFunc(new SchemaFunc({ funcName: 'listWithIndexKey', declaredName: funcDeclStr, publicName, paramAttrs: attrStrs, indexName }));
            continue;
        }

        if (parsedFuncName === 'listAll') {
            declareFunc(new SchemaFunc({ funcName: 'listAll' }));
            continue;
        }

        if (parsedFuncName === 'upgradeSchema') {
            declareFunc(new SchemaFunc({ funcName: 'upgradeSchema' }));
            continue;
        };

        if (parsedFuncName === 'update') {
            let args: Query = null;

            if (parsed.tags[0] && parsed.tags[0].isQuery()) {
                args = (parsed.tags[0].value as Query)
            }

            if (!args) {
                declareFunc(new SchemaFunc({ funcName: 'update' }));
            } else if (args.tags.length === 1) {
                const attr = args.tags[0].attr;
                const { name: indexName } = needIndex({ attrs: [attr] });
                const publicName = 'update_with_' + attr;
                declareFunc(new SchemaFunc({ publicName, declaredName: funcDeclStr, funcName: 'updateWithIndexKey', paramAttrs: [attr], indexName }));
            } else {
                throw new Error("unexpected: update() has more than one param");
            }
            continue;
        }

        if (parsedFuncName === 'each') {
            declareFunc(new SchemaFunc({ funcName: 'each' }));
            continue;
        }

        if (parsedFuncName === 'listen') {
            schema.supportsListening = true;
            declareFunc(new SchemaFunc({ funcName: 'listen' }));
            continue;
        }

        if (parsedFuncName === 'delete') {
            const queryArgs = (parsed.tags[0].value as Query);
            const attrStrs = queryArgs.tags.map(tag => tag.attr);
            const { name: indexName } = needIndex({ attrs: attrStrs });

            // delete_with_x_y
            const publicName = 'delete_with_' + (attrStrs.join('_'));
            declareFunc(new SchemaFunc({ publicName, declaredName: funcDeclStr, funcName: 'deleteWithIndexKey', paramAttrs: attrStrs, indexName }));
            continue;
        }

        if (parsedFuncName === 'delete') {
            declareFunc(new SchemaFunc({ funcName: 'deleteItem' }));
            continue;
        }

        if (parsedFuncName === 'deleteAll') {
            declareFunc(new SchemaFunc({ funcName: 'deleteAll' }));
            continue;
        }

        if (parsedFuncName === 'replaceAll') {
            declareFunc(new SchemaFunc({ funcName: 'replaceAll' }));
            continue;
        }

        if (parsedFuncName === 'status') {
            schema.supportsStatusTable = true;
            declareFunc(new SchemaFunc({ funcName: 'getStatus' }));
            continue;
        }

        if (parsedFuncName === 'getStatus') {
            schema.supportsStatusTable = true;
            declareFunc(new SchemaFunc({ funcName: 'getStatus' }));
            continue;
        }

        if (parsedFuncName === 'count') {
            declareFunc(new SchemaFunc({ funcName: 'count' }));
            continue;
        }

        if (parsedFuncName === 'diff') {
            declareFunc(new SchemaFunc({ funcName: 'diff' }));
            continue;
        }

        if (parsedFuncName === 'listenToStream') {
            schema.supportsStatusTable = true;
            declareFunc(new SchemaFunc({ funcName: 'getStatus' }));
            declareFunc(new SchemaFunc({ funcName: 'deleteAll' }));
            declareFunc(new SchemaFunc({ funcName: 'listenToStream' }));
            continue;
        }

        if (parsedFuncName === 'first') {
            declareFunc(new SchemaFunc({ funcName: 'first' }));
            continue;
        }

        throw new Error("compileSchema: unrecognized func: " + parsed.tags[0].attr);
    }

    if (schema.supportsStatusTable) {
    }

    // Create indexes for indexesNeeded
    for (const [ name, indexInfo ] of indexesNeeded.entries()) {
        const index = new IndexSchema(schema);
        index.name = name;

        if (indexInfo.requireMultiIndex) {
            index.indexType = 'multimap';
        } else if (indexInfo.implySingleIndex) {
            index.indexType = 'map';
        } else {
            index.indexType = 'multimap';
        }
        index.attrs = indexInfo.attrs;
        schema.addIndex(index);
    }

    // maybe add init_listener_streams
    if (schema.supportsListening) {
        schema.setupTable.push({ t: 'init_listener_streams' });
    }

    // any attrs with isAuto need an PreInsertStep
    for (const attr of schema.attrs) {
        if (attr.isAuto) {
            schema.setupTable.push({t: 'init_table_auto_attr', attr: attr.attr });
            schema.preInsert.push({t: 'init_auto_attr', attr: attr.attr});
        }
    }

    // if we didn't find any indexes, create a ListIndex
    if (schema.indexes.length == 0) {
        const index = new IndexSchema(schema);
        index.indexType = 'list';
        schema.addIndex(index)
    }

    // Figure out the primary unique index
    for (const index of schema.indexes) {
        if (index.indexType === 'map' && index.attrs.length === 1) {
            schema.primaryUniqueIndex = index;
            break;
        }
    }

    // Add some functions that rely on having a primary unique index
    if (schema.primaryUniqueIndex) {
        schema.primaryUniqueAttr = schema.primaryUniqueIndex.attrs[0];

        declareFunc(new SchemaFunc({funcName: 'itemEquals'}));
        declareFunc(new SchemaFunc({funcName: 'item_to_uniqueKey'}));
        declareFunc(new SchemaFunc({funcName: 'item_matches_uniqueKey'}));
        declareFunc(new SchemaFunc({funcName: 'get_using_uniqueKey'}));
        declareFunc(new SchemaFunc({funcName: 'delete_using_uniqueKey'}));
        declareFunc(new SchemaFunc({funcName: 'deleteItem'}));
    }

    // Figure out the default index
    if (schema.primaryUniqueIndex) {
        schema.defaultIndex = schema.primaryUniqueIndex;
    } else {
        for (const index of schema.indexes) {
            schema.defaultIndex = index;
            break;
        }
    }

    // Other callbacks
    if (decl.initialize) {
        schema.setupTable.push({ t: 'run_initializer', initialize: decl.initialize });
    }
    
    // Final validation
    for (const parsed of parsedFuncDecls) {
        const parsedFuncName = parsed.tags[0].attr;

        if (parsedFuncName === "delete" && !schema.primaryUniqueIndex && schema.supportsListening) {
            throw new Error("Validation error: cannot support both listen() and delete() unless there is a primary unique index");
        }
    }

    return schema;
}
