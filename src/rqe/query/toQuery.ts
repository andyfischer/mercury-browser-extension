
import { Query, QueryLike, QueryNode } from './Query'
import { parseQuery } from '../parser/parseQuery'

export function toQuery(queryLike: QueryLike): QueryNode {
    if (queryLike && (queryLike as Query)?.t === 'query')
        return queryLike as Query;

    const parseResult = parseQuery(queryLike as string);

    if (!parseResult)
        return new Query([]);

    return parseResult as QueryNode;
}

