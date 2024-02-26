import { LexedText, t_semicolon } from "../lexer";
import { Query, QueryNode } from "../query";
import { parseQueryFromTokens } from "./parseQuery";

export function parseFileQueries(str: string): QueryNode[] {
    let queries: QueryNode[] = [];

    try {
        const lexed = new LexedText(str);
        const it = lexed.startIterator();

        while (!it.finished()) {
            while (it.tryConsume(t_semicolon)) ;

            const result = parseQueryFromTokens(it);

            if (result.t === 'parseError')
                throw result;

            if (result.t === 'tag')
                queries.push(new Query([result]));
            else {
                if ((result as Query).tags.length === 0)
                    break;

                queries.push(result);
            }

        }

        return queries;
    } catch (err) {
        throw err;
    }
}