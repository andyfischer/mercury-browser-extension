
import { TagValue, TagValueType, tagValueToString, } from './TagValue'
import type { Query } from '../query'

export class QueryTag {
    t: 'tag' = 'tag'
    attr: string
    value: TagValue
    isValueOptional: boolean
    isAttrOptional: boolean
    isParameter: boolean

    constructor(attr?: string, value?: TagValue) {
        this.t = 'tag'
        if (attr)
            this.attr = attr;

        if (value != null)
            this.value = value || null
    }

    hasValue() {
        return this.value != null;
    }

    isQuery() {
        return this.value?.t === 'query';
    }

    getQuery() {
        if (!this.isQuery()) {
            throw new Error("Tag value is not a query");
        }

        return this.value as Query;
    }

    getValue() {
        if (this.value == null)
            return this.value;

        switch (this.value.t) {
        case TagValueType.string_value:
            return this.value.str;
        case TagValueType.number_value:
            return this.value.num;
        case TagValueType.star:
            throw new Error("can't use getValue on a star");
        default:
            return this.value;
        }
    }

    getStringValue() {
        switch (this.value.t) {
        case TagValueType.string_value:
            return this.value.str;
        case TagValueType.number_value:
            return this.value.num + '';
        default:
            throw new Error("Not a string")
        }
    }

    getNumberValue(): number {
        switch (this.value.t) {
        case TagValueType.string_value:
            return parseInt(this.value.str, 10);
        case TagValueType.number_value:
            return this.value.num;
        default:
            throw new Error("Not a number")
        }
    }
    
    toQueryString() {
        let attr = this.attr;

        if (attr === '*')
            return '*';

        let out = '';

        /*
        if (this.identifier) {
            if (this.identifier === attr)
                out += '$'
            else
                out += `[$${this.identifier}] `
        }
        */

        out += attr;

        if (this.isAttrOptional)
            out += '?';

        if (this.hasValue()) {
            if (this.value?.t === 'query') {
                out += `(${(this.value as Query).toQueryString()})`;
            } else {
                out += `=`;
                out += tagValueToString(this.value);
            }
        }

        return out;
    }
}
