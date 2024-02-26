
import { QueryTag } from './QueryTag'

export type QueryLike = string | Query | QueryNode
export type QueryNode = MultistepQuery | Query | QueryTag
export { QueryTag } from './QueryTag'

export class MultistepQuery {
    t: 'multistep' = 'multistep'
    steps: Query[]

    constructor(steps: Query[]) {
        this.steps = steps
    }
}

export class Query {

    t: 'query' = 'query'
    tags: QueryTag[]
    tagsByAttr: Map<string, QueryTag>

    constructor(tags: QueryTag[]) {
        this.tags = tags;
        this._refresh();
    }

    freeze() {
        Object.freeze(this);
    }

    withoutFirstTag() {
        return new Query(this.tags.slice(1));
    }

    has(attr: string) {
        return this.tagsByAttr.has(attr);
    }

    hasAttr(attr: string) {
        return this.tagsByAttr.has(attr);
    }

    hasValue(attr: string) {
        const tag = this.getAttr(attr);
        return tag && tag.hasValue();
    }

    getValue(attr: string) {
        const tag = this.getAttr(attr);
        if (!tag)
            throw new Error("no value for: " + attr);
        return tag.getValue();
    }
    getNumber(attr: string): number {
        const tag = this.getAttr(attr);
        if (!tag)
            throw new Error("no value for: " + attr);
        return tag.getNumberValue();
    }

    getAttr(attr: string) {
        return this.tagsByAttr.get(attr);
    }

    getQuery(attr: string) {
        const tag = this.getAttr(attr);
        if (!tag) {
            throw new Error("no value for: " + attr);
        }
        return tag.getQuery();
    }

    tagAtIndex(index: number) {
        return this.tags[index];
    }

    getPositionalAttr(index: number) {
        return this.tags[index]?.attr;
    }

    getCommand() {
        return this.tags[0].attr;
    }

    getPositionalValue(index: number) {
        return this.tags[index].getValue();
    }

    toQueryString() {
        const out = [];

        for (const tag of this.tags) {
            out.push(tag.toQueryString());
        }

        return out.join(' ');
    }

    toItemValue() {
        const item: any = {};
        for (const tag of this.tags) {
            item[tag.attr] = tag.getValue();
        }

        return item;
    }

    _refresh() {
        this.tagsByAttr = new Map<string, QueryTag>()
        for (const tag of this.tags)
            if (tag.attr)
                this.tagsByAttr.set(tag.attr, tag);
    }
}

