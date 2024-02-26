
import { Query } from '../query'
import { Stream } from '../Stream'
import { findVerbForQuery } from './findVerbForQuery'
import { Graph } from '../graph'
import { matchHandlerToQuery, errorForNoTableFound, MatchContext } from '../query/FindMatch'
import { Task } from '../task'
import { Handler } from '../handler'
import { Verb } from './Verb'
import { VerboseLogEveryPlanExecution } from '../config'
import { QueryExecutionContext, ExpectedValue, Plan, OutputAttr, OutputFilterWhereAttrsEqual } from './QueryPlan'

export function createPlan(graph: Graph, context: QueryExecutionContext, query: Query, expectedInput: ExpectedValue): Plan {

    const ctx: MatchContext = {};
    //const trace = new Trace();
    query.freeze();

    const { verbDef, verbName, afterVerb } = findVerbForQuery(graph, query, expectedInput);

    const plan = new Plan();
    plan.graph = graph;
    plan.context = context;
    plan.query = query;
    plan.expectedInput = expectedInput;
    plan.verb = verbName || verbDef.name;
    plan.queryWithoutVerb = afterVerb;

    validatePlan(plan);

    if (plan.verb === 'get') {
        // future refactor: matchHandlerToQuery doesn't need to worry about the overprovided check
        const match = matchHandlerToQuery(ctx, graph, query);
        const handler = match?.handler;
        completePlanGetVerb(ctx, plan, handler);
    } else if (plan.verb === 'join') {
        throw new Error("implement plan for: join");
        // completePlanJoinVerb(plan);
    } else if (plan.verb === 'where') {
        throw new Error("implement plan for: where");
        //plan.nativeCallback = verbDef.run;
        //plan.expectedOutput = plan.expectedInput;
    } else {
        throw new Error("implement plan for alt verb");
        //completePlanAltVerb(plan, verbDef);
    }

    validatePlan(plan);

    return plan;
}

function completePlanGetVerb(ctx: MatchContext, plan: Plan, handler: Handler) {
    if (!handler) {
        plan.expectedOutput = { t: 'some_value' };
        plan.knownError = errorForNoTableFound(ctx, plan.graph, plan.query);
        return plan;
    }

    plan.handler = handler;

    // Check/prepare inputs
    const outputShape: OutputAttr[] = []
    // Removing the output shape filter..
    //plan.outputFilters.push({ t: 'reshape', shape: outputShape });
    let overprovidedFilter: OutputFilterWhereAttrsEqual = null;

    // Check each tag requested by query
    for (const queryTag of plan.query.tags) {
        const attr = queryTag.attr;
        const handlerTag = handler.getTag(attr);
        const queryProvidedValue = queryTag.hasValue() ? queryTag.value : null;
        // const willHaveValueForThisAttr = queryTag.hasValue() || queryTag.identifier;

        let isRequiredParam = false;
        if (handlerTag && handlerTag.requiresValue && !queryTag.hasValue())
            isRequiredParam = true;

        //if (queryTag.identifier && !queryTag.hasValue())
        //    isRequiredParam = true;

        if (isRequiredParam)
            plan.checkRequiredParams.push(attr);

        if (queryTag.hasValue())
            plan.paramsFromQuery.set(attr, queryProvidedValue);

        /*
         * future
        if (plan.graph.enableOverprovideFilter) {
            if (willHaveValueForThisAttr && handlerTag && (!handlerTag.requiresValue && !handlerTag.acceptsValue)) {
                plan.overprovidedAttrs.push(attr);

                if (!overprovidedFilter) {
                    overprovidedFilter = { t: 'whereAttrsEqual', attrs: [] }
                    plan.outputFilters.push(overprovidedFilter);
                }

                if (queryTag.hasValue())
                    overprovidedFilter.attrs.push({ t: 'constant', attr, value: queryProvidedValue });
                else
                    overprovidedFilter.attrs.push({ t: 'from_param', attr });
            }
        }
        */

        if (!handlerTag) {
            // Query has an optional tag and the mount didn't provide it.
        } else if (queryTag.hasValue()) {
            outputShape.push({ t: 'constant', attr, value: queryProvidedValue})
        //} else if (willHaveValueForThisAttr) {
        //    outputShape.push({ t: 'from_param', attr });
        } else {
            outputShape.push({ t: 'from_item', attr });
        }
    }
    validatePlan(plan);

    // Success
    plan.expectedOutput = { t: 'expected_value', value: plan.queryWithoutVerb }
    plan.outputSchema = plan.queryWithoutVerb.toItemValue();

    if (!handler.run)
        throw new Error("handler doesn't have a run() method: " + handler.toDeclString());

    plan.nativeCallback = handler.run;
    validatePlan(plan);
}

/*
function completePlanAltVerb(plan: Plan, verb: Verb) {
    plan.nativeCallback = verb.run;
    plan.expectedOutput = getExpectedOutputWithSchemaOnlyExecution(plan);
}

function getExpectedOutputWithSchemaOnlyExecution(plan: Plan): ExpectedValue {

    const input = new Stream();

    switch (plan.expectedInput.t) {
        case 'expected_value':
            input.put(plan.expectedInput.value.toItemValue());
            break;
        case 'expected_union':
            for (const item of plan.expectedInput.values)
                input.put(item);
            break;
    }

    input.done();

    const output = new Stream();
    executePlan(plan, {}, input, output, 'schemaOnly');

    if (!output.isDone()) {
        throw new Error(`schemaOnly execution didn't finish synchronously (verb=${plan.verb}, tuple=${plan.tuple.toQueryString()})`);
    }

    const values = output.take();

    if (values.length === 0)
        return { t: 'no_value' }

    if (values.length > 1) {
        return { t: 'expected_union', values}
    }

    let value = values[0];

    if (value.t !== 'queryTuple') {
        value = QueryTuple.fromItem(value);
    }

    return { t: 'expected_value', value }
}

export function executePlan(plan: Plan, parameters: QueryParameters, input: Stream, output: Stream, executionType: ExecutionType = 'normal') {

    if (VerboseLogEveryPlanExecution) {
        let prefix = 'Executing plan:'
        logPlanToConsole({plan, parameters, prefix, executionType});
    }

    if (plan.knownError) {
        output.sendErrorItem(plan.knownError);
        output.done();
        return;
    }

    // Check for required parameters
    for (const attr of plan.checkRequiredParams) {
        if (!has(parameters, attr)) {
            output.sendErrorItem({
                errorType: 'missing_parameter',
                fromQuery: plan.tuple.toQueryString(),
                data: [{ missingParameterFor: attr }] });
            output.done();
            return;
        }
    }

    let taskOutput = output;

    for (const filter of plan.outputFilters) {
        switch (filter.t) {
        case 'reshape':
            taskOutput = reshapingFilter(plan, parameters, taskOutput, filter);
            break;
        case 'whereAttrsEqual':
            taskOutput = whereAttrsEqualFilter(plan, parameters, taskOutput, filter);
            break;
        }
    }

    const task = new Task({
        graph: plan.graph,
        tuple: plan.tuple,
        afterVerb: plan.afterVerb,
        parameters,
        input,
        output: taskOutput,
        context: plan.context,
        plan3: plan,
        trace: null,
        executionType,
        schemaOnly: executionType === 'schemaOnly',
    });

    if (plan.verb !== 'get')
        task.streaming(); // awkward special case - verbs assume streaming

    if (plan.outputSchema)
        task.output.receive({ t: 'schema', item: plan.outputSchema });

    runNativeFunc2(task, plan.nativeCallback);
}
*/

function validatePlan(plan: Plan) {
    // TODO
    /*
    if (plan.expectedOutput?.t === 'expected_value') {
        if ((plan as any).expectedOutput.value.t !== 'queryTuple') {
            console.error('wrong type: ', plan.expectedOutput.value);
            throw new Error("plan.expectedOutput has wrong type");
        }
    }
    */
}
