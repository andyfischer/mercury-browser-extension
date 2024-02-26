
import { GraphLike, } from '../graph'
// import { listEveryVerb } from '../verbs/_list'

export function getCompletions(graph: GraphLike, line: string): string[] {
    if (!line || line === "")
        return [];

    let lastWordDivider = -1;

    for (let i=0; i < line.length; i++) {
        const c = line[i];
        if (c === ' ' || c === '|')
            lastWordDivider = i;
    }

    const priorLine = line.substring(0, lastWordDivider+1);
    const lastWord = line.substring(lastWordDivider+1);

    const found = new Map<string,true>();

    /*
    for (const verb of listEveryVerb()) {
        if (verb.startsWith(lastWord))
            found.set(verb, true);
    }
    */

    for (const handler of graph.eachHandler()) {
        for (const tag of handler.tags) {
            if (tag.attr.startsWith(lastWord)) {
                found.set(tag.attr, true);
            }
        }
    }

    const completions = [];
    for (const key of found.keys())
        completions.push(priorLine + key);

    return completions;
}
