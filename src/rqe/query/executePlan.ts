
import { Plan, ExecutionType, OutputFilterReshape } from './QueryPlan'
import { Stream, c_item, c_schema } from '../Stream'
import { Task } from '../task'
import { VerboseLogEveryPlanExecution } from '../config'
import { runTaskCallback } from '../task/runTaskCallback'

type QueryExecutionContext = any;
export type QueryParameters = Map<string,any>;

function reshapingFilter(plan: Plan, parameters: QueryParameters, output: Stream, filter: OutputFilterReshape): Stream {
    const fixed = new Stream();

    fixed.setDownstreamMetadata({
        name: 'reshapingFilter for: ' + plan.query.toQueryString()
    });

    fixed.sendTo({
        receive(evt) {
            switch (evt.t) {
            case c_item: {
                const item = evt.item;
                const fixedItem = {};
                let usedAnyValuesFromItem = false;

                for (const outputAttr of filter.shape) {
                    const attr = outputAttr.attr;
                    switch (outputAttr.t) {
                    case 'from_item':
                        if (item[attr] !== undefined) {
                            fixedItem[attr] = item[attr];
                            usedAnyValuesFromItem = true;
                        } else {
                            fixedItem[attr] = null;
                        }
                        break;
                    case 'from_param': {
                        fixedItem[attr] = parameters[attr];
                        break;
                    }
                    case 'constant':
                        if (item[attr] !== undefined) {
                            fixedItem[attr] = item[attr];
                        } else {
                            fixedItem[attr] = outputAttr.value;
                        }
                        break;
                    }
                }

                if (plan.overprovidedAttrs.length > 0)
                    // Count the item as "used" even if it's shadowed by overprovided query attrs.
                    usedAnyValuesFromItem = true;

                if (usedAnyValuesFromItem)
                    output.put(fixedItem);

                break;
            }
            default:
                output.receive(evt);
            }
        }
    })

    return fixed;
}

/*
function whereAttrsEqualFilter(plan: Plan, params: QueryParameters, output: Stream, filter: OutputFilterWhereAttrsEqual): Stream {
    const fixed = new Stream(plan.graph, 'reshaping output for: ' + plan.tuple.toQueryString());

    fixed.sendTo({
        receive(evt) {
            switch (evt.t) {
            case 'item': {
                const item = evt.item;

                for (const attrFilter of filter.attrs) {

                    const attr = attrFilter.attr;
                    let valueFromQuery;

                    switch (attrFilter.t) {
                    case 'constant':
                        valueFromQuery = attrFilter.value;
                        break;
                    case 'from_param':
                        valueFromQuery = params[attr];
                        break;
                    }

                    const valueFromItem = get(item, attr);

                    if ((valueFromQuery+'') !== ((valueFromItem)+'')) {
                        return;
                    }
                }
                output.receive(evt);
                break;
            }
            default:
                output.receive(evt);
            }
        }
    })

    return fixed;
}


*/

export function executePlan(plan: Plan, parameters: QueryParameters, output: Stream, executionType: ExecutionType = 'normal') {

    const input: Stream = parameters.get('$input');

    if (VerboseLogEveryPlanExecution) {
        plan.consoleLog();
    }

    if (plan.knownError) {
        output.putError(plan.knownError);
        output.done();
        return;
    }

    // Check for required parameters
    for (const attr of plan.checkRequiredParams) {
        if (parameters[attr] === undefined) {
            output.putError({
                errorType: 'missing_parameter',
                fromQuery: plan.query.toQueryString(),
                info: { missingParameterFor: attr } });
            output.done();
            return;
        }
    }

    let taskOutput = output;

    // Apply filters to the stream.
    for (const filter of plan.outputFilters) {
        switch (filter.t) {
        case 'reshape':
            taskOutput = reshapingFilter(plan, parameters, taskOutput, filter);
            break;
        case 'whereAttrsEqual':
            throw new Error("need to fix: whereAttrsEqual filter");
            // taskOutput = whereAttrsEqualFilter(plan, parameters, taskOutput, filter);
            break;
        }
    }

    const task = new Task({
        graph: plan.graph,
        withQuery: plan.query,
        // afterVerb: plan.afterVerb,
        queryParameters: parameters,
        input,
        output: taskOutput,
        // context: plan.context,
        //plan: plan,
        //trace: null,
        //executionType,
        //schemaOnly: executionType === 'schemaOnly',
    });

    if (plan.verb !== 'get') {
        throw new Error("fix? task.streaming");
        // task.streaming(); // awkward special case - verbs assume streaming
    }

    if (plan.outputSchema)
        task.output.receive({ t: c_schema, schema: plan.outputSchema });

    if (!plan.nativeCallback) {
        throw new Error("executePlan: plan is missing a nativeCallback");
    }

    runTaskCallback(task, plan.nativeCallback);
}

