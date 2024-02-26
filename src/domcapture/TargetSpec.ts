
interface Target {
    el: Element
    name: string
    shallow?: boolean
}

export type TargetSpec = Target[]
export type LooseTargetSpec = TargetSpec | 'entire_page'

export function resolveTargetSpec(spec: LooseTargetSpec): TargetSpec {
    if (spec === 'entire_page')
        return entirePage();
    return spec;
}

export function entirePage(): TargetSpec {
    return [{
        el: document.head,
        name: 'head'
    }, {
        el: document.body,
        name: 'body'
    },{
        el: document.head.parentElement,
        name: 'html',
        shallow: true
    }]
}
