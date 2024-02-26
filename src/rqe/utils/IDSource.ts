
/**
 * A simple helper class that returns a unique ID every time you call .take()
 */
export class IDSource {
    next: number = 1;

    copyFrom(source: IDSource) {
        this.next = source.next;
    }

    take() {
        const out = this.next;
        this.next++;
        return out;
    }
}

export class StringIDSource {
    prefix: string;
    next: number = 1;

    constructor(prefix: string = '') {
        this.prefix = prefix;
    }

    take(): string {
        const result = this.prefix + this.next + '';
        this.next += 1;
        return result;
    }
}
