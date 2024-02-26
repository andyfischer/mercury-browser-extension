
import { Query, QueryTag } from './Query'
import { Graph } from '../graph'
import { WarnOnMultipleMatches, VerboseTraceFindMatch, VerboseTraceFindMatchFails } from '../config'
import { ErrorItem } from '../Errors'
import { Handler } from '../handler'

// Exact match: the query specifies the exact same thing that
// the mount provides.
//
// This might be a universal attribute ("attribute") or it might
// be a specific value("attribute=x").

interface AttrExactMatch {
    t: 'exact'
}

// Partially filled / underprovided: The query asks for a universal
// match and the mount provides a specific subset.
//
// In this situation we might combine the results of multiple mounts,
// to deliver all the possible values that the query asks for.
interface AttrPartiallyFilled {
    t: 'attr_partially_filled'
}

// Overprovided: The query asks for a specific attribute value, and
// the provider gives a universal match.
//
// In this situation we'll probably use the mount, and then we'll
// add a "where" filter on the results.
//
// Slightly deprecated - only used when the graph has .enableOverprovideFilter=true
interface AttrOverprovided {
    t: 'attr_overprovided'
}

interface UnusedOptional {
    t: 'unused_optional'
}

export type AttrMatch = AttrExactMatch | AttrPartiallyFilled | AttrOverprovided | UnusedOptional;

export interface QueryToHandlerMatch {
    handler: Handler
    attrs: Map<string, AttrMatch>
    unusedOptionalsCount: number
}

export class MatchContext {

}

/*
 * findOneQueryTagOnHandler
 *
 * Search the Handler to find a tag matching this query tag.
 */
function findOneQueryTagOnHandler(ctx: MatchContext, tag: QueryTag, handler: Handler): AttrMatch {
    const attr = tag.attr;

    // const queryHasKnownValue = tag.value.t !== 'no_value' && tag.value.t !== 'abstract';
    // const queryWillHaveValue = queryHasKnownValue || (tag.value.t === 'abstract') || !!tag.identifier;
    const handlerTag = handler.getTag(tag.attr);

    if (!handlerTag) {

        // Mount does not provide this attribute.
        if (VerboseTraceFindMatchFails) {
            console.log(`  match failed, handler does not have attr '${attr}':`, handler.toDeclString());
        }

        return null;
    }

    if (handlerTag.requiresValue && !tag.hasValue()) {
        // Mount requires a value and the query doesn't provide.
        if (VerboseTraceFindMatchFails) {
            console.log(`  match failed, handler requires value for '${attr}':`, handler.toDeclString());
        }
        return null;
    }

    /*
    if (handlerTag.specificValue) {
        if (queryHasKnownValue) {
            if (tvalEquals(handlerTag.specificValue, tag.value)) {
                return { t: 'exact' };
            } else {
                // Value not equal
                if (VerboseTraceFindMatchFails) {
                    console.log(`  match failed, unequal known value for ${attr}:`, handler.toDeclString());
                }
                return null;
            }
        }

        if (queryWillHaveValue) {
            console.warn(`warning: can't yet support a match that is conditional on value (${attr})`);
            if (VerboseTraceFindMatchFails) {
                console.log(`  match failed, dynamic value for ${attr}:`, handler.toDeclString());
            }
            return null;
        }

        return null;
    }
    */

    /*
    if (tag.hasValue() && (!handlerTag.requiresValue && !handlerTag.isParameter)) {
        // Query provides a value and the mount does accept one, this will overprovide data
        // and the results will need to be filtered.
        
        if (handler.graph.enableOverprovideFilter)
            return { t: 'attr_overprovided' };
        else
            return null;
    }*/

    // Query provides a value and the mount accepts a value.
    return { t: 'exact' };
}

/*
 Try to match this query with this handler.
*/
export function matchQueryWithHandler(ctx: MatchContext, query: Query, handler: Handler): QueryToHandlerMatch {

    if (VerboseTraceFindMatchFails) {
        console.log('matchQueryWithHandler looking at handler: ' + handler.toDeclString())
    }

    const attrMatches = new Map();
    let unusedOptionalsCount = 0;

    // Check each query tag and try to find it on the handler.
    for (const tag of query.tags) {

        if (tag.attr === undefined || tag.attr === 'undefined')
            throw new Error("attr = undefined?");
        
        if (!tag.attr)
            continue;
        
        let match = findOneQueryTagOnHandler(ctx, tag, handler);

        if (!match) {
            if (tag.isAttrOptional) {
                // Handler does not have this tag, but it's optional.
                match = { t: 'unused_optional' }
                unusedOptionalsCount++;
            } else {
                return null;
            }
        }

        attrMatches.set(tag.attr, match);
    }

    // Check each tag on the mount to see if we missed anything required.
    for (const handlerTag of handler.tags) {
        if (handlerTag.isRequired && !attrMatches.has(handlerTag.attr)) {
            // Handler requires this attribute.
            if (VerboseTraceFindMatchFails) {
                console.log(`  match failed, handler requires ${handlerTag.attr}:`, handler.toDeclString());
            }
            return null;
        }
    }

    if (VerboseTraceFindMatch) {
        console.log(`  match success for:`, handler.toDeclString(), { attrMatches });
    }

    return {
        handler,
        attrs: attrMatches,
        unusedOptionalsCount,
    }
}

export function getClosestWrongQueryMountMatch(ctx: MatchContext, query: Query, handler: Handler) {

    const attrMatches = new Map();
    const matchProblems = [];
    let unusedOptionalsCount = 0;

    // Check each attribute on the query.
    for (const tag of query.tags) {
        if (!tag.attr)
            continue;
        
        let match = findOneQueryTagOnHandler(ctx, tag, handler);

        if (!match) {
            if (tag.isAttrOptional) {
                match = { t: 'unused_optional' }
                unusedOptionalsCount++;
                continue;
            }

            if (handler.hasAttr(tag.attr) && handler.requiresValue(tag.attr) && !query.hasValue(tag.attr)) {
                matchProblems.push({
                    attr: tag.attr,
                    t: 'missing_required_value',
                });
                continue;
            }

            matchProblems.push({
                attr: tag.attr,
                t: 'missing_from_point',
            });

            continue;
        }

        attrMatches.set(tag.attr, match);
    }

    // Double check each attr on the handler to see if we missed anything required.
    for (const handlerTag of handler.tags) {
        if (handlerTag.isRequired && !query.hasAttr(handlerTag.attr)) {
            // Handler requires this attribute.
            matchProblems.push({
                t: 'missing_from_query',
                attr: handlerTag.attr,
            });
        }
    }

    return {
        attrs: attrMatches,
        unusedOptionalsCount,
        matchProblems,
    }
}

export function matchHandlerToQuery(ctx: MatchContext, graph: Graph, query: Query): QueryToHandlerMatch | null {
    if (!graph)
        throw new Error("missing graph");

    if (VerboseTraceFindMatch)
        console.log('FindMatch searching for: ', query.toQueryString());

    let matches: QueryToHandlerMatch[] = [];

    let numberChecked = 0;

    for (const handler of graph.eachHandler()) {
        const match = matchQueryWithHandler(ctx, query, handler);
        numberChecked++;

        if (match)
            matches.push(match);
    }

    if (matches.length === 0) {
        if (VerboseTraceFindMatch) {
            console.error('FindMatch no match found for: ', query.toQueryString());
            if (numberChecked == 0)
                console.error('(graph has no handlers)');
        }
        return null;
    }

    // Prefer fewer missed optionals
    matches.sort((a,b) => a.unusedOptionalsCount - b.unusedOptionalsCount);

    // Error on ambiguous match (future: maybe do something better here)
    if (matches.length > 1 && matches[0].unusedOptionalsCount === matches[1].unusedOptionalsCount) {
        if (WarnOnMultipleMatches)
            console.warn("ambiguous match warning: multiple found for: " + query.toQueryString());
    }

    const match = matches[0];

    return match;
}

export function findClosestWrongMatches(ctx: MatchContext, graph: Graph, query: Query) {
    let bestScore = null;
    let bestMatches = null;

    /*
    const points = graph.everyMountPoint();
    for (const handler of points) {
        const match = getClosestWrongQueryMountMatch(ctx, query, handler);

        const score = match.attrs.size;

        if (bestScore === null || score > bestScore) {
            bestScore = score;
            bestMatches = [{handler, match}];
        } else if (score == bestScore) {
            bestMatches.push({handler, match});
        }
    }
    */

    return {
        bestMatches
    }
}

export function errorForNoTableFound(ctx: MatchContext, graph: Graph, query: Query): ErrorItem {

    const closestMatches = findClosestWrongMatches(ctx, graph, query);

    let error: ErrorItem = {
        errorType: 'no_handler_found',
        fromQuery: query.toQueryString(),
    }

    /*
    if (graph.tracingName) {
        error.data = error.data || [];
        error.data.push({
            searchedGraph: null,
            graph_name: graph.tracingName,
        });
    }

    if (closestMatches?.bestMatches?.length > 0) {
        error.data = error.data || [];

        let maxClosestPointsIncluded = 5;
        let count = 0;
        for (const { match, handler } of closestMatches.bestMatches) {
            error.data.push({
                nearbyMatch: null,
                point_id: handler.localId,
                point_decl: handler.toDeclString(),
                match_problems: match.matchProblems,
            });


            count++;
            if (count > maxClosestPointsIncluded)
                break;
        }
    }
    */

    return error;
}

