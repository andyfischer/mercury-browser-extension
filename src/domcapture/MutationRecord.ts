
export default interface MutationRecord {
    type: 'attributes' | 'characterData' | 'childList' | 'styleRules'
    target: Node
    attributeName?: string
    addedNodes?: NodeList
    removedNodes?: NodeList
    startIndex?: number

    // not used
    attributeNamespace?: any
    nextSibling?: any
    previousSibling?: any
    oldValue?: any
}
