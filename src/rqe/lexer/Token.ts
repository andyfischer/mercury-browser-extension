
import TokenDef from './TokenDef'

export interface Token {
    match: TokenDef
    length: number
    tokenIndex: number
    textStart: number
    textEnd: number
    lineStart: number
    lineEnd: number
    columnStart: number
    leadingIndent: number
    pairsWithIndex?: number
}
