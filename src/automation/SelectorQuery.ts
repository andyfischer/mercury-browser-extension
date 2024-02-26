
import { toQuery, QueryLike, Query } from '../rqe/query'

function findElementUsingQuery(queryLike: QueryLike) {
    let query = toQuery(queryLike);

    if (query.t === 'multistep') {
        if (query.steps.length !== 1)
            throw new Error('no support for multistep queries yet');

        query = query.steps[0];
    }

    query = query as Query;

    let elementName = null;
    let attributes: { attr: string, value: string }[] = [];

    for (const tag of query.tags) {
        if (tag.value?.t === 'query') {
            if (tag.value.tags[0].toString() === 'attr') {
                attributes.push({ attr: tag.value.tags[1].attr, value: tag.value.tags[1].attr });
            }
        }
    }
}
