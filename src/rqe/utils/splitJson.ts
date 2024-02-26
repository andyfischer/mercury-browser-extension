
export function* splitJson(str: string) {
    if (!str)
        return;

    let itemStart = 0;
    let betweenItems = true;
    let insideString = false;
    let depth = 0;
    let escape = false;

    for (let lookahead = 0; lookahead < str.length; lookahead++) {
        if (betweenItems) {
            if (str[lookahead] !== '{')
                throw new Error(`syntax error at char ${lookahead}: expected '{', saw: ${str[lookahead]}`);

            itemStart = lookahead;
            depth = 1;
            betweenItems = false;
            continue;
        }

        if (escape) {
            escape = false;
            continue;
        }

        switch (str[lookahead]) {
        case '"':
            insideString = !insideString;
            continue;
        case '\\':
            escape = true;
            continue;
        case '{':
            if (insideString)
                continue;

            depth++;
            continue;
        case '}':
            if (insideString)
                continue;

            depth--;

            if (depth === 0) {
                yield { t: 'item', str: str.slice(itemStart, lookahead + 1) }
                betweenItems = true;
            }

            continue;
        }
    }

    if (!betweenItems) {
        yield { t: 'unfinished', remaining: str.slice(itemStart) }
    }
}
