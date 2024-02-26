
import { IndentPrinter } from '../utils/IndentPrinter'
import { formatItem } from '../Format'
import { Plan, ExecutionType } from './QueryPlan'

type QueryParameters = any;

interface FormatPlanOptions {
    plan: Plan
    prefix?: string
    printer?: IndentPrinter
    parameters?: QueryParameters
    executionType?: ExecutionType
}

export function planToDebugString(opts: FormatPlanOptions) {
    const { plan } = opts;
    const printer = opts.printer || new IndentPrinter();
    printer.log(`${opts.prefix || 'Plan:'} (${plan.query ? plan.query.toQueryString(): ''}):`)
    printer.indent();
    if (opts.parameters)
        printer.log(`parameters = ${formatItem(opts.parameters)}`);
    if (opts.executionType)
        printer.log(`executionType = ${opts.executionType}`);
    printer.log(`expectedInput = ${formatItem(plan.expectedInput)}`)
    printer.log(`expectedOutput = ${formatItem(plan.expectedOutput)}`)
    printer.log(`verb = ${plan.verb}`)
    //printer.log(`afterVerb = ${plan.afterVerb.toQueryString()}`)
    //printer.log(`point = ${plan.point ? plan.point.toDeclString() : '(none)'}`)

    if (plan.knownError)
        printer.log(`knownError = ${formatItem(plan.knownError)}`)

    if (plan.checkRequiredParams.length > 0)
        printer.log(`checkRequiredParams = ${plan.checkRequiredParams}`)

    if (plan.overprovidedAttrs.length > 0)
        printer.log(`overprovidedAttrs = ${plan.overprovidedAttrs}`)

    if (plan.paramsFromQuery.size > 0)
        printer.log(`paramsFromQuery = ${plan.paramsFromQuery}`)

    printer.log(`outputFilters = ${JSON.stringify(plan.outputFilters)}`)

    if (plan.joinPlan) {
        printer.indent();
        // TODO
        /*
        if (plan.joinPlan.staticSearchTuple) {
            printer.log(`Join search type = static`);
            printer.log(`Join search = ` + plan.joinPlan.staticSearchTuple.toQueryString());
            printer.log(`Join match = ` + plan.joinPlan.staticPoint.toDeclString());
        } else {
            printer.log(`Join search type = dynamic`);
        }
        */
       /*
        if (plan.joinPlan.rhsPlan)
            toDebugString({ prefix: 'Join rhsPlan:', plan: plan.joinPlan.rhsPlan, printer });
            */
        printer.unindent();
    }
    printer.unindent();
}
