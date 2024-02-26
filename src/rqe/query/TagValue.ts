
import type { Query, QueryNode } from './Query'

export interface Star {
    t: TagValueType.star;
}

export interface StringValue {
    t: TagValueType.string_value;
    str: string
}

export interface NumberValue {
    t: TagValueType.number_value;
    num: number
}

export enum TagValueType {
    query_node = 300,
    star = 301,
    string_value = 302,
    number_value = 303,
}

export type TagValue = QueryNode | Star | StringValue | NumberValue | null;

export function tagValueToString(value: TagValue) {
    switch ((value as any).t){
        case TagValueType.query_node:
            return (value as Query).toQueryString();
        case 'query':
            return (value as Query).toQueryString();
        case TagValueType.star:
            return '*';
        case TagValueType.string_value:
            return (value as StringValue).str;
        case TagValueType.number_value:
            return (value as NumberValue).num + '';
        default:
            throw new Error("tagValueToString: Unknown tag value type: " + (value as any).t);
    }
}