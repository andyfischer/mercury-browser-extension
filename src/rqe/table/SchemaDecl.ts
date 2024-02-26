
import { Table } from './Table'
import type { QueryLike } from '../query'

// Declaration used when creating a schema.
export interface SchemaDecl {
    name?: string
    attrs?: string[]
    hint?: 'list' | 'value'
    funcs?: QueryLike[]
    initialize?: (table: Table) => void
        disableGlobalErrors?: boolean
}