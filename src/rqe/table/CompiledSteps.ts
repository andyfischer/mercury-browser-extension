
import type { Table } from './Table'

export interface InitializeAutoAttr {
    t: 'init_auto_attr'
    attr: string
}

export type PreInsertStep = InitializeAutoAttr

export interface InitializeTableAutoAttr {
    t: 'init_table_auto_attr'
    attr: string
}

export interface InitializeTableListenerStreams {
    t: 'init_listener_streams'
}

export interface RunInitializerCallback {
    t: 'run_initializer'
    initialize: (table: Table) => void
}

export type TableInitStep = InitializeTableAutoAttr | InitializeTableListenerStreams | RunInitializerCallback
