
import { LexedText, TokenIterator, t_plain_value, t_newline, t_bar, t_slash,
    t_integer, t_rparen, t_right_arrow, lexStringToIterator, t_comma, t_semicolon } from '../lexer'
import { parseQueryTagFromTokens } from './parseQueryTag'
import { ParseError } from './ParseError'
import { QueryTag, Query, QueryNode, TagValueType } from '../query'
import { MultistepQuery } from '../query/Query';

function maybeParseVerbWithCount(it: TokenIterator): QueryTag[] {
    let startPos = it.position;

    if (it.nextText() !== "limit" && it.nextText() !== "last")
        return null;

    const verb = it.nextText();
    it.consume();
    it.skipNewlines();

    if (!it.nextIs(t_integer)) {
        it.position = startPos;
        return null;
    }

    const count = it.nextText();
    it.consume(t_integer);

    // Success
    const tags: QueryTag[] = [
        new QueryTag(verb, null),
        new QueryTag('count', { t: TagValueType.string_value, str: count }),
    ];

    for (const entry of parseTags(it)) {
        tags.push(entry);
    }

    return tags;
}

function maybeParseWaitVerb(it: TokenIterator): QueryTag[] {
    let startPos = it.position;

    if (it.nextText() !== "wait")
        return null;

    const verb = it.nextText();
    it.consume();
    it.skipNewlines();

    if (!it.nextIs(t_integer)) {
        it.position = startPos;
        return null;
    }

    const duration = it.nextText();
    it.consume(t_integer);

    // Success
    const tags: QueryTag[] = [
        new QueryTag(verb, null),
        new QueryTag('duration', null)
    ];

    for (const tag of parseTags(it)) {
        tags.push(tag);
    }

    return tags;
}

function maybeParseRename(it: TokenIterator): QueryTag[] {
    let startPos = it.position;

    if (it.nextText() !== "rename")
        return null;

    const verb = it.nextText();
    it.consume();
    it.skipNewlines();

    let from: string;
    let to: string;

    if (!it.nextIs(t_plain_value)) {
        it.position = startPos;
        return null;
    }

    from = it.consumeAsText();
    it.skipNewlines();

    if (!it.nextIs(t_right_arrow)) {
        it.position = startPos;
        return null;
    }

    it.consume(t_right_arrow);
    it.skipNewlines();

    if (!it.nextIs(t_plain_value)) {
        it.position = startPos;
        return null;
    }

    to = it.consumeAsText();

    // Success
    const tags: QueryTag[] = [
        new QueryTag(verb, null),
        new QueryTag('from', {t: TagValueType.string_value, str: from}),
        new QueryTag('to', {t: TagValueType.string_value, str: to}),
    ]

    for (const tag of parseTags(it)) {
        tags.push(tag);
    }

    return tags;
}

/*
function maybeParseWhere(it: TokenIterator) {
    let startPos = it.position;

    if (it.nextText() !== "where")
        return null;

    it.consume();
    it.skipNewlines();

    const conditions = [];

    // TODO
}
*/

const specialSyntaxPaths = [
    maybeParseVerbWithCount,
    maybeParseRename,
    maybeParseWaitVerb,
];

function* parseTags(it: TokenIterator) {
    while (true) {
        it.skipNewlines();

        if (it.finished() || it.nextIs(t_newline) || it.nextIs(t_bar) || it.nextIs(t_slash) || it.nextIs(t_rparen) || it.nextIs(t_semicolon))
            break;

        const tag: QueryTag = parseQueryTagFromTokens(it);

        it.tryConsume(t_comma);

        yield tag;
    }
}

export function parseSingleQueryFromTokens(it: TokenIterator): Query | ParseError {

    it.skipNewlines();

    // Special syntaxes
    for (const path of specialSyntaxPaths) {
        const parseSuccess = path(it);
        if (parseSuccess)
            return new Query(parseSuccess);
    }
    
    let tags: QueryTag[] = [];
    
    for (const tag of parseTags(it)) {
        tags.push(tag);
    }

    return new Query(tags);
}

export function parseQueryFromTokens(it: TokenIterator): QueryNode | ParseError {

    const steps: Query[] = [];
    let isFirst = true;
    let isTransform = false;

    while (!it.finished()) {

        it.skipSpaces();

        if (it.finished())
            break;

        if (it.nextIs(t_bar) || it.nextIs(t_slash)) {
            // Queries can start with a leading | , which means to interpret this as a transform.
            // Consume it and loop (and isFirst will be false on next iteration)
            if (isFirst)
                isTransform = true;
            it.consume();
            continue;
        }

        const step: Query | ParseError = parseSingleQueryFromTokens(it);
        if (step.t === 'parseError')
            return step;

        steps.push(step as Query);

        if (!it.tryConsume(t_bar) && !it.tryConsume(t_slash))
            break;

        isFirst = false;
    }

    if (steps.length === 0)
        return null;

    if (steps.length === 1)
        return steps[0];

    return new MultistepQuery(steps);
}

/*
 * Parse a single-step query.
 *
 * Does not support multistep queries (use parseMultiQuery for that)
 */
export function parseQuery(str: string): Query {
    const lexed = new LexedText(str);
    const it = lexed.startIterator();
    const result = parseQueryFromTokens(it);

    if (result.t === 'parseError')
        throw result;

    if (result.t === 'multistep')
        throw new Error("parseQuery didn't expect a multistep query: " + str);

    if (result.t === 'tag')
        return new Query([result]);

    return result;
}

/*
 * Parse a query (might result in a single-step or multi-step)
 */
export function parseMultiQuery(str: string): Query | MultistepQuery {
    try {
        const lexed = new LexedText(str);
        const it = lexed.startIterator();
        const result = parseQueryFromTokens(it);

        if (result.t === 'parseError')
            throw result;

        if (result.t === 'tag')
            return new Query([result]);

        return result;
    } catch (err) {
        console.error('unexpected error when parsing: ', str);
        throw err;
    }
}
