

import { Query } from './Query'
import { Graph } from '../graph'
import { Verb } from './Verb'
import { ExpectedValue } from './QueryPlan'

const AllVerbs = {
}

function getVerb(verbName: string): Verb {
    return AllVerbs[verbName]
}

export function findVerbForQuery(graph: Graph, query: Query, expectedInput: ExpectedValue) {
    const verbName = query.tags[0]?.attr;

    if (!verbName)
        throw new Error("no verb name found");

    const afterVerb = query.withoutFirstTag();

    const foundBuiltin = getVerb(verbName);
    if (foundBuiltin)
        return { verbDef: foundBuiltin, verbName, afterVerb };

    /*
    if (graph.customVerbs) {
        const foundCustom = graph.customVerbs.one({ name: verbName });
        if (foundCustom)
            return { verbDef: foundCustom.def, verbName, afterVerb }
    }
    */

    // Use default verb - either get or join
    switch (expectedInput.t) {
    case 'no_value':
        return { verbDef: getVerb('get'), verbName: 'get', afterVerb: query };
    case 'expected_value':
    case 'some_value':
        return { verbDef: getVerb('join'), verbName: 'join', afterVerb: query }
    default:
        throw new Error('unrecognized expectedInput: ' + (expectedInput as any).t);
    }

    throw new Error("couldn't find a verb");
}
