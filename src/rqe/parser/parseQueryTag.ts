
import { LexedText, TokenIterator, t_plain_value, t_slash, t_colon,
    t_dot, t_question, t_integer, t_dash, t_dollar, t_star,
    t_lparen, t_rparen, t_equals, t_double_dash, lexStringToIterator, t_newline, t_space } from '../lexer'
import { Query, QueryTag, QueryNode, TagValueType } from '../query'
import { parseQueryFromTokens } from './parseQuery'
import { ParseError } from './ParseError'

export function parseQueryTagFromTokens(it: TokenIterator): QueryTag {

    const result = new QueryTag();

    // Identifier prefix
    /*
    if (it.tryConsume(t_lbracket)) {
        result.identifier = it.consumeAsText();

        if (!it.tryConsume(t_rbracket))
            throw new Error("expected ']', found: " + it.nextText());

        it.skipSpaces();
    }

    if (it.tryConsume(t_star)) {
        result.specialAttr = { t: 'star' };
        return result;
    }

    */

    if (it.tryConsume(t_dollar)) {
        const attr = it.consumeAsUnquotedText();
        result.attr = attr;
        result.isParameter = true;

        if (it.tryConsume(t_question)) {
            result.isAttrOptional = true;
        }
        return result;
    }

    let skipAttribute = it.nextIs(t_lparen);

    // Attribute
    if (!skipAttribute) {
        result.attr = it.consumeAsUnquotedText();

        while (it.nextIs(t_plain_value)
                || it.nextIs(t_dot)
                || it.nextIs(t_dash)
                || it.nextIs(t_double_dash)
                || it.nextIs(t_integer)
                || it.nextIs(t_slash))
            result.attr += it.consumeAsUnquotedText();

        if (result.attr === '/')
            throw new Error("syntax error, attr was '/'");
    }

    //if (it.tryConsume(t_question))
        // result.isAttrOptional = true;

    let beforeParenLookahead = it.getPosition();
    it.tryConsume(t_space);
    if (it.tryConsume(t_lparen)) {
        it.restore
        let query: QueryNode | ParseError = parseQueryFromTokens(it);
        if (query.t === 'parseError')
            throw new Error((query as ParseError).message);

        query = query as QueryNode;

        if (!it.tryConsume(t_rparen))
            throw new Error("Expected )");

        result.value = query;
        return result;
    }
    it.restore(beforeParenLookahead);

    if (it.tryConsume(t_equals) || it.tryConsume(t_colon)) {
        it.skipSpaces();

        // Attibute value

        if (it.tryConsume(t_dollar)) {
            result.isParameter = true;
        } else if (it.tryConsume(t_question)) {
            result.isParameter = true;
            result.isValueOptional = true;
        } else if (it.tryConsume(t_star)) {
            result.value = { t: TagValueType.star }
        } else if (it.tryConsume(t_lparen)) {
            let query = parseQueryFromTokens(it);

            if (query.t === 'parseError')
                throw new Error("Parse error: " + query.t);

            query = query as Query;

            if (!it.tryConsume(t_rparen))
                throw new Error('Expected )');

            result.value = query;
        } else {
            let firstTokenType = it.next().match;
            let tokenCount = 0;

            if (it.finished() || it.nextIs(t_rparen))
                throw it.createError("Expected a value");

            let strValue = it.consumeAsUnquotedText();
            tokenCount++;

            // Continue to parse tokens that are valid in a string literal.
            while (it.nextIs(t_plain_value) || it.nextIs(t_dot) || it.nextIs(t_slash) || it.nextIs(t_colon)) {
                strValue += it.consumeAsUnquotedText();
                tokenCount++;
            }

            if (tokenCount === 1 && firstTokenType === t_integer) {
                // number value
                result.value = {t: TagValueType.number_value, num: parseInt(strValue, 10)};
            } else { 
                result.value = {t: TagValueType.string_value, str: strValue};
            }

        }
    }

    return result;
}

export function parseQueryTag(str: string): QueryTag {
    const lexed = new LexedText(str);
    const it = lexed.startIterator();
    return parseQueryTagFromTokens(it);
}
