
export type ItemEqualityFn = (item: any) => boolean;

export function getIndexKeyForItem(attrs: string[], item: any) {
    if (attrs.length === 1)
        return item[attrs[0]];

    const keyElements: string[] = [];

    for (const attr of attrs) {
        let s = item[attr] + '';
        s = s.replace(/\//g, '\\/');
        keyElements.push(s);
    }

    return keyElements.join('/');
}

export function getIndexKeyForArgs(args: any[]) {
    if (args.length === 1)
        return args[0];

    const keyElements: string[] = [];

    for (const arg of args) {
        let s = arg + '';
        s = s.replace(/\//g, '\\/');
        keyElements.push(s);
    }

    return keyElements.join('/');
}