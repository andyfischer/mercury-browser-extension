
import { StringIDSource } from './utils/IDSource'
import { StreamListenerList } from './streamUtil/StreamListenerList'
import type { Schema } from './table/Schema'
import { c_item } from './Stream'

export type ErrorType = 'verb_not_found' | 'unhandled_exception' | 'provider_not_found' | 'missing_parameter'
    | 'no_handler_found' | 'Unimplemented' | 'TableNotFound'
    | 'MissingAttrs' | 'MissingValue' | 'NotSupported' | 'ExtraAttrs'
    | 'http_protocol_error' | 'invalid_value' | string

export interface ErrorItem {
    errorType?: ErrorType
    errorLayer?: string
    errorMessage?: string
    failureId?: string
    fromQuery?: string
    stack?: any
    cause?: ErrorItem
    info?: any
    topic?: any
}

export interface ErrorContext {
    errorType?: ErrorType
    errorLayer?: string
    cause?: any | Error
}

let _nextFailureId = new StringIDSource('fail-');
const _globalFailureListeners = new StreamListenerList<ErrorItem>();
_globalFailureListeners.recordUnhandledExceptions = false; // prevent recursion

export function errorItemToOneLineString(item: ErrorItem) {
    let out = `error (${item.errorType})`;

    if (item.errorMessage)
        out += `: ${item.errorMessage}`;

    return out;
}

export function errorItemToString(item: ErrorItem) {
    let out = `error`;
    if (item.errorType)
        out += ` (${item.errorType})`;

    if (item.errorMessage)
        out += `: ${item.errorMessage}`;

    if (item.stack)
        out += `\nStack trace: ${item.stack}`

    return out;
}

export class ErrorExtended extends Error {
    is_error_extended = true
    errorItem: ErrorItem

    constructor(errorItem: ErrorItem) {
        super(errorItem.errorMessage || errorItemToString(errorItem));
        this.errorItem = errorItem;
    }

    toString() {
        return errorItemToString(this.errorItem);
    }
}

export function toException(item: ErrorItem): ErrorExtended {
    return new ErrorExtended(item);
}

export function captureException(error: Error | ErrorItem | string, context: ErrorContext = {}): ErrorItem {
    if ((error as ErrorExtended).errorItem) {
        error = error as ErrorExtended;
        const errorItem = (error as ErrorExtended).errorItem;

        return {
            ...errorItem,
            ...context,
            errorMessage: errorItem.errorMessage,
            stack:  errorItem.stack || error.stack,
            errorType: errorItem.errorType || context.errorType || 'unhandled_exception',
        }
    }

    if (error instanceof Error) {
        let guessedErrorType = 'unhandled_exception';

        if (error.message.startsWith('Not found:')) {
            guessedErrorType = 'not_found';
        }

        return {
            errorMessage: error.message,
            stack: error.stack,
            ...context,
            errorType: (error as any).errorType || context.errorType || guessedErrorType,
        };
    }

    // Received some other value as an error.
    if (typeof error === 'string') {
        return { errorMessage: error };
    }

    if (error?.errorType || error?.errorMessage) {
        // Looks like an ErrorItem
        return {
            ...error,
            ...context,
        } as ErrorItem;
    }

    return {
        errorMessage: typeof error === 'string' ? error : ((error as any).errorMessage || (error as any).message),
        stack: (error as any).stack,
        ...context,
        errorType: (error as any).errorType || context.errorType || 'unknown_error',
    };
}

export function recordFailure(errorItem: ErrorItem) {
    errorItem.failureId = errorItem.failureId || _nextFailureId.take();

    // todo - more stuff here
    console.error('failure: ', errorItemToString(errorItem));

    return errorItem.failureId;
}

export function recordUnhandledException(error: Error) {
    console.error('Unhandled exception:', error)

    const errorItem = captureException(error);

    _globalFailureListeners.receive({ t: c_item, item: errorItem });
}

export function recordSchemaError(schema: Schema, errorMessage: string) {
    console.error(`Schema error on ${schema.name}: ${errorMessage}`);

    _globalFailureListeners.receive({ t: c_item, item: { errorMessage } });
}

export function startGlobalErrorListener() {
    return _globalFailureListeners.add();
}

