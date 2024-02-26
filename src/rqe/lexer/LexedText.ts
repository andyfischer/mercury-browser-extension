
import { compileSchema, Schema, Table } from '../table'
import { LexerSettings } from './LexerSettings'
import { lexTextToTokenList } from './lexifyString'
import { t_space, t_newline, t_tab, t_quoted_string } from './tokens'
import { Token } from './Token'
import { TokenIterator, Options as IteratorOptions } from './TokenIterator'
import { Query, QueryTag } from '../query'
import unescape from './unescape'

interface SourceLine {
    lineNumber: number
    tokenStart: number
    tokenEnd: number
    firstNonIndentToken: number
}

export interface TokenRange {
    tokenStart: number
    tokenEnd: number
}

export interface TextRange {
    textStart: number
    textEnd: number
}

export interface LineRangeOptions {
    includeIndent?: boolean
    includeNewline?: boolean
}

let schema_tokens: Schema;
let schema_sourcelines: Schema;

export type Range = TokenRange | TextRange | number

let _hasInitializedSchemas = false;

function initializeSchemas() {
    if (_hasInitializedSchemas)
        return;

    schema_tokens = compileSchema<Token>({
        name: 'Tokens',
        funcs: [
            // Can't rely on string parsing this point because of a recursive dependency.
            new Query([new QueryTag('each')]),
            new Query([new QueryTag('get', new Query([new QueryTag('tokenIndex')]))]),
            new Query([new QueryTag('listAll')]),
        ]
    });

    schema_sourcelines = compileSchema<SourceLine>({
        name: 'SourceLines',
        funcs: [
            // Can't rely on string parsing this point because of a recursive dependency.
            new Query([new QueryTag('each')]),
            new Query([new QueryTag('get', new Query([new QueryTag('lineNumber')]))]),
            new Query([new QueryTag('has', new Query([new QueryTag('lineNumber')]))]),
        ]
    });
    _hasInitializedSchemas = true;
}

export class LexedText {
    originalString: string
    tokens: Table<Token>
    tokensList: Token[]
    lines: Table<SourceLine>

    constructor(str: string, settings: LexerSettings = {}) {
        initializeSchemas();
        this.tokens = schema_tokens.createTable()
        this.lines = schema_sourcelines.createTable()

        this.originalString = str;

        let tokenIndex = 0;
        for (const token of lexTextToTokenList(str, settings)) {
            token.tokenIndex = tokenIndex;
            this.tokens.insert(token);

            const isIndent = token.match === t_space || token.match === t_tab;

            for (let lineNumber = token.lineStart; lineNumber <= token.lineEnd; lineNumber++) {
                if (this.lines.has_lineNumber(lineNumber)) {
                    const line = this.lines.get_with_lineNumber(lineNumber);
                    line.tokenEnd = tokenIndex;

                    if (!isIndent && line.firstNonIndentToken === -1)
                        line.firstNonIndentToken = tokenIndex;

                } else {
                    this.lines.insert({
                        lineNumber,
                        tokenStart: tokenIndex,
                        tokenEnd: tokenIndex,
                        firstNonIndentToken: isIndent ? -1 : tokenIndex
                    });
                }
            }

            tokenIndex++;
        }

        this.tokensList = this.tokens.listAll();
    }

    lastTextIndex() {
        return this.originalString.length;
    }

    resolveRange(range: Range): TextRange {
        if (typeof range === 'number') {
            range = { tokenStart: range, tokenEnd: range } as TokenRange;
        }

        if ((range as TokenRange).tokenStart != null) {
            range = range as TokenRange;
            const firstToken = this.tokens.get_with_tokenIndex(range.tokenStart);
            const lastToken = this.tokens.get_with_tokenIndex(range.tokenEnd);
            return { textStart: firstToken.textStart, textEnd: lastToken.textEnd }
        }

        if ((range as TextRange).textStart != null) {
            return range as TextRange;
        }

        throw new Error("unsupported range");
    }

    getRangeForLine(lineNumber: number, options: LineRangeOptions = {}): TokenRange {
        const found = this.lines.get_with_lineNumber(lineNumber);
        if (!found)
            throw new Error("line number not found: " + lineNumber);

        const range: TokenRange = {
            tokenStart: found.tokenStart,
            tokenEnd: found.tokenEnd,
        }

        if (options.includeIndent === false) {
            const it = this.startIterator(range.tokenStart);
            it.tryConsume(t_space);
            range.tokenStart = it.getPosition();
        }
        
        if (options.includeNewline === false) {
            const it = this.startIterator(range.tokenStart, { reverse: true });
            it.tryConsume(t_newline);
            range.tokenEnd = it.getPosition();
        }

        return range;
    }

    getText(range: Range) {
        const textRange = this.resolveRange(range);
        return this.originalString.slice(textRange.textStart, textRange.textEnd);
    }

    getUnquotedText(token: Token) {
        if (token.match === t_quoted_string) {
            const str = this.originalString.slice(token.textStart + 1, token.textEnd - 1);
            return unescape(str);
        }

        return this.getText(token);
    }

    startIterator(position?: number, options?: IteratorOptions) {
        return new TokenIterator(this, position, options);
    }
}
