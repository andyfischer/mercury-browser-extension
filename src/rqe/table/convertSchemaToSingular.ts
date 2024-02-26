
import { SchemaDecl } from './SchemaDecl'

export function convertSchemaToSingular(decl: SchemaDecl, { funcs }: {funcs: string[]}): SchemaDecl {
    return {
        name: decl.name + '/single',
        attrs: decl.attrs,
        funcs: [
            'get',
        ].concat(funcs),
    }
}
