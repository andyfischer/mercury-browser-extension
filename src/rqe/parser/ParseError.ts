
export class ParseError extends Error {
    t: 'parseError' = 'parseError'
    message: string

    constructor(message) {
        super(message);
    }
}
