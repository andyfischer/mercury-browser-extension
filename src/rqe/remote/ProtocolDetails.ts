
export interface ProtocolDetailsItem {
    name: string
    responseSchema?: any
    isLongRunning?: boolean
    onSuccessInvalidateCache?: any[]
}

export function protocolDetailsSchema() {
}
