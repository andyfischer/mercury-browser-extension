import { QueryLike } from "./Query";

export function queryToString(queryLike: QueryLike): string {
    if (typeof queryLike === 'string')
        return queryLike;


    if (queryLike?.t === 'query') {
        let tagStrs: string[] = [];

        for (const tag of queryLike.tags) {
            tagStrs.push(tag.toQueryString());
        }

        return tagStrs.join(' ');
    }

    return ''; // TODO
}