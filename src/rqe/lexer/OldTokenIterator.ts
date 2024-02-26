
import { Token, OldLexedText, t_space, t_newline, t_ident } from '.'
import SourcePos from './SourcePos'
import TokenDef from './TokenDef'
import { LexerSettings } from './LexerSettings'

export class OldTokenIterator {
    position: number = 0
    tokens: Token[]
    sourceText?: OldLexedText
    settings: LexerSettings

    constructor(text: OldLexedText, settings: LexerSettings = {}) {
        this.tokens = text.tokens;
        this.sourceText = text;
        this.settings = settings;
    }

    getPosition() {
        return this.position;
    }

    restore(position: number) {
        this.position = position;
    }

    copy() {
        const it = new OldTokenIterator(this.sourceText);
        it.position = this.position;
        return it;
    }

    next(lookahead: number = 0): Token {
        const pos = this.position + lookahead;

        if (pos < 0) {
            return {
                textStart: 0,
                textEnd: 0,
                tokenIndex: 0,
                length: 0,
                lineStart: 0,
                lineEnd: 0,
                columnStart: 0,
                leadingIndent: 0,
                match: null
            }
        }

        if (pos >= this.tokens.length) {
            const lastToken = this.tokens[this.tokens.length - 1];
            if (!lastToken) {
                return {
                    textStart: 0,
                    textEnd: 0,
                    tokenIndex: -1,
                    length: 0,
                    lineStart: 0,
                    lineEnd: 0,
                    columnStart: 0,
                    leadingIndent: 0,
                    match: null
                }
            }
            return {
                textStart: lastToken.textEnd,
                textEnd: lastToken.textEnd,
                tokenIndex: -1,
                length: 0,
                lineStart: lastToken.lineStart,
                columnStart: lastToken.columnStart + lastToken.length,
                lineEnd: lastToken.lineStart,
                leadingIndent: lastToken.leadingIndent,
                match: null
            }
        }

        return this.tokens[pos];
    }

    nextIs(match: TokenDef, lookahead: number = 0): boolean {
        const token = this.next(lookahead);
        return token.match === match;
    }

    nextText(lookahead: number = 0): string {
        const token = this.next(lookahead);
        return this.sourceText.getTokenText(token);
    }

    nextIsIdentifier(str: string, lookahead: number = 0): boolean {
        return this.nextIs(t_ident, lookahead) && this.nextText(lookahead) === str;
    }

    nextUnquotedText(lookahead: number = 0): string {
        const token = this.next(lookahead);
        return this.sourceText.getUnquotedText(token);
    }

    nextLength(lookahead: number = 0): number {
        const token = this.next(lookahead);
        return token.textEnd - token.textStart;
    }

    finished(lookahead: number = 0): boolean {
        return (this.position + lookahead) >= this.tokens.length;
    }

    advance() {
        /*
        add stuff here to debug parsers
        if (this.nextText() === 'interface')
            console.log('consumed interface', new Error())
        */

        this.position += 1;
    }

    jumpTo(pos: number) {
        this.position = pos;
    }

    consume(match: TokenDef = null) {
        if (match !== null && !this.nextIs(match))
            throw new Error(`expected token: ${match?.name}, found: ${this.next().match?.name} (${this.nextText()})`);

        this.advance();
    }

    consumeWhile(condition: (next: Token) => boolean) {
        while (!this.finished() && condition(this.next()))
            this.advance();
    }

    consumeIdentifier(s: string) {
        if (!this.nextIsIdentifier(s)) {
            throw new Error(`consume expected identifier: "${s}, found: ${this.nextText()}`);
        }

        this.advance();
    }

    consumeAsText(lookahead: number = 0): string {
        const str = this.nextText(lookahead);
        this.consume();
        return str;
    }

    consumeAsUnquotedText(lookahead: number = 0): string {
        const str = this.nextUnquotedText(lookahead);
        this.consume();
        return str;
    }

    consumeAsTextWhile(condition: (next: Token) => boolean) {
        let str = '';
        let stuckCounter = 0;

        while (!this.finished() && condition(this.next())) {
            str += this.consumeAsText();
            stuckCounter += 1;
            if (stuckCounter > 10000) {
                throw new Error("infinite loop in consumeAsTextWhile?")
            }
        }

        return str;
    }

    tryConsume(match: TokenDef): boolean {
        if (this.nextIs(match)) {
            this.consume();
            return true;
        }
        return false;
    }

    skipWhile(condition: (next: Token) => boolean) {
        while (condition(this.next()) && !this.finished())
            this.consume();
    }

    skipUntilNewline() {
        this.skipWhile(token => token.match !== t_newline);
        if (this.nextIs(t_newline))
            this.consume();
    }

    skipSpaces() {
        while (this.nextIs(t_space))
            this.consume(t_space);
    }

    skipNewlines() {
        while (this.nextIs(t_space) || this.nextIs(t_newline))
            this.consume();
    }

    lookaheadSkipSpaces(lookahead: number = 0) {
        while (this.nextIs(t_space, lookahead))
            lookahead++;
        return lookahead;
    }

    lookaheadAdvance(lookahead: number) {
        lookahead++;
        if (this.nextIs(t_space, lookahead))
            lookahead++;
    }

    consumeSpace() {
        while (this.nextIs(t_space))
            this.consume(t_space);
    }

    consumeWhitespace() {
        while (this.nextIs(t_space) || this.nextIs(t_newline))
            this.consume();
    }

    toSourcePos(firstToken: Token, lastToken: Token): SourcePos {
        return {
            posStart: firstToken.textStart,
            posEnd: lastToken.textEnd,
            lineStart: firstToken.lineStart,
            columnStart: firstToken.columnStart,
            lineEnd: firstToken.lineStart,
            columnEnd: lastToken.columnStart + lastToken.length
        }
    }

    getReadableSourcePos(pos: number) {
        if (pos >= this.tokens.length)
            pos = this.tokens.length - 1;

        const token = this.tokens[pos];
        if (!token)
            throw new Error("getReadableSourcePos - token not found at " + pos);
        return `line ${token.lineStart}, char ${token.columnStart}`;
    }

    spanToString(textStart: number, textEnd: number) {
        const startToken = this.tokens[textStart];
        const endToken = this.tokens[textEnd];

        return this.sourceText.originalStr.slice(startToken.textStart, endToken.textEnd);
    }
}
