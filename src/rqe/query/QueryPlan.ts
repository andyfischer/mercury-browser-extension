
import { StreamSchema } from '../Stream'
// import { QueryParameters } from '.'
import { Query } from '../query'
import { Graph } from '../graph'
// import { Trace } from '../Trace'
// import { unwrapTagged } from '../TaggedValue'
// import { NativeCallback } from '../handler'
// import { QueryExecutionContext } from '../Graph'
import { ErrorItem } from '../Errors'
// import { runNativeFunc2 } from '../NativeCallback'
import { Handler } from '../handler'
// import { toStructuredString } from '../Debug'
// import { completePlanJoinVerb, JoinPlan } from '../query/Join'
import { planToDebugString } from './planToDebugString'
import { JoinPlan } from './Join'
import { TaskCallback } from '../task/runTaskCallback'
import { SchemaDecl } from '../table'

export type QueryExecutionContext = any;
export type QueryParameters = any;
export type NativeCallback = Function;

/*
 
Runtime query execution process:

PREPARE INPUTS phase
 - Collect inputs (either from query or params)
 - Expand query to include "assume include" tags (is this planning?)
 - Check if required params are provided
   - ERROR if not
 
PRE RUN MATCH CHECK
 
 - If an attr is overprovided
   - Modify inputs to not send a value for that attr
   - Include a performance warning?

PRE RUN
 - Output schema

ERROR EARLY EXIT
 - If there's an error, output error message and stop

RUN
 - Call native func
 - Or perform custom verb
 - Or perform join logic

POST FILTER
 - If attr is overprovided, then drop items that don't match the filter

POST RESHAPE
 - Reorder the object to match the query
 - Remove attrs that aren't requested by the query
   - Second filter: Drop the item if none of its attrs were requested
 - Assign attrs that are missing in the item but present in the query (or params)
   - Don't include query attrs that are optional & unused in the mount
 */

export interface NoInputExpected {
    t: 'no_value'
}

export interface SomeInputExpected {
    t: 'some_value'
}

export interface ExpectedSingleValue {
    t: 'expected_value'
    value: Query
}

export interface ExpectedUnionValue {
    t: 'expected_union'
    values: Query[]
}


export type ExpectedValue = NoInputExpected | SomeInputExpected | ExpectedSingleValue | ExpectedUnionValue

export class Plan {
    // Context
    graph: Graph
    query: Query
    queryWithoutVerb: Query
    verb: string
    context: QueryExecutionContext
    expectedInput: ExpectedValue

    // Derived context, used during planning.
    /*
    afterVerb: QueryTuple
    point: MountPoint
    */
    handler: Handler
    expectedOutput: ExpectedValue

    // Runtime data:

    // Check/prepare inputs
    checkRequiredParams: string[] = []
    overprovidedAttrs: string[] = []
    paramsFromQuery = new Map<string,any>()

    // Start results
    outputSchema: SchemaDecl

    // Run mount
    nativeCallback: TaskCallback | null
    joinPlan?: JoinPlan

    // Post filter
    outputFilters: OutputFilter[] = []

    // Exceptional cases
    knownError?: ErrorItem

    toDebugString() {
        return planToDebugString({ plan: this });
    }

    consoleLog() {
        console.log(this.toDebugString());
    }
}

export type OutputFilter = OutputFilterReshape | OutputFilterWhereAttrsEqual

export interface OutputFilterReshape {
    t: 'reshape'
    shape: OutputAttr[]
}

export interface OutputFilterWhereAttrsEqual {
    t: 'whereAttrsEqual'
    attrs: Array<OutputAttrConstant | OutputAttrFromParam>
}

export type OutputAttr = OutputAttrFromItem | OutputAttrFromParam | OutputAttrConstant;

interface OutputAttrFromItem {
    t: 'from_item'
    attr: string
}

interface OutputAttrFromParam {
    t: 'from_param'
    attr: string
}

interface OutputAttrConstant {
    t: 'constant'
    attr: string
    value: any
}

export type ExecutionType = 'normal' | 'schemaOnly'

