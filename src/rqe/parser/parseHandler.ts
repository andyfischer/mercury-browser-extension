
import { TokenIterator, lexStringToIterator, LexedText, t_right_arrow } from '../lexer';
import { Handler, HandlerTag } from '../handler'
import { ParseError } from './ParseError';
import { QueryTag } from '../query';
import { parseQueryTagFromTokens } from './parseQueryTag';

export function parseHandlerFromTokens(it: TokenIterator): Handler | ParseError {
    const handlerTags: HandlerTag[] = [];

    let hasSeenArrow = false;

    while (!it.finished()) {
        it.skipSpaces();

        if (it.finished())
            break;

        if (it.tryConsume(t_right_arrow)) {
            hasSeenArrow = true;
            continue;
        }

        const tag: QueryTag = parseQueryTagFromTokens(it);

        const resultTag: HandlerTag = {
            attr: tag.attr,
            isRequired: !tag.isAttrOptional && !hasSeenArrow,
            requiresValue: (tag.isParameter && !tag.isValueOptional) && !hasSeenArrow,
            isParameter: tag.isParameter || tag.isValueOptional,
            isOutput: hasSeenArrow,
        };

        if (tag.attr === ":") 
            throw it.createError("Colon not supported in table decl");

        if (tag.isQuery()) {
            // Handle the details from the nested query.
            for (const nestedTag of tag.getQuery().tags) {
                if (nestedTag.attr === 'required') {
                    resultTag.isRequired = true;
                    continue;
                }

                if (nestedTag.attr === 'optional') {
                    resultTag.isRequired = false;
                    continue;
                }

                if (nestedTag.attr === 'integer') {
                    resultTag.expectedType = 'integer';
                    continue;
                }

                throw it.createError("Unexpected nested tag: " + nestedTag.attr);
            }

        } else if (tag.value != null) {
            throw it.createError("Value not supported in table decl");
        }

        handlerTags.push(resultTag);
    }

    return new Handler(handlerTags);
}

export function parseHandler(str: string) {
    if (str.startsWith('[v2]')) {
        throw new Error("don't use [v2] label anymore");
    }

    const lexed = new LexedText(str);
    const it = lexed.startIterator();
    const result = parseHandlerFromTokens(it);

    if (result.t === 'parseError') {
        throw new Error(`parse error on "${str}": ` + result);
    }

    const handler = result as Handler;

    return handler;
}
