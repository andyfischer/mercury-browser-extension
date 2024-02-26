import { SchemaDecl, Table, compileSchema } from "../table";

export function upgradeSchema(existing: Table, upgrade: SchemaDecl) {
    const existingSchema = existing.schema;

    const combinedDecl: SchemaDecl = {
        ...existingSchema.decl,
    }

    combinedDecl.name = upgrade.name || (existingSchema.decl.name + '/upgraded');
    combinedDecl.funcs = (combinedDecl.funcs || []).concat(upgrade.funcs || []);
    combinedDecl.attrs = (combinedDecl.attrs || []).concat(upgrade.attrs || []);

    const newSchema = compileSchema(combinedDecl);
    const newTable = newSchema.createTable();

    // Copy data over. In most use cases the table will probably be empty.
    // Future:
    // In some cases we can just reuse the existing table and just add indexes.

    for (const item of existing.each())
        newTable.insert(item);

    // Replace the table object contents.
    for (const k of Object.keys(existing)) {
        delete existing[k];
    }

    for (const k of Object.keys(newTable)) {
        existing[k] = newTable[k];
    }
}
