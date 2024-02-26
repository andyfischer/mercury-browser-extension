
import { c_item, c_fail, Stream } from '../Stream'
import { captureException, ErrorItem } from '../Errors'
import { colorize, } from '../repl/AnsiColors'

export const c_log_info = 1;
export const c_log_warn = 2;
export const c_log_error = 3;

export interface LogEvent {
    message?: string
    level?: typeof c_log_info | typeof c_log_warn | typeof c_log_error
    topic?: string
    stack?: any
    [ key: string ]: any
}

const red = str => colorize({ r: 255, g: 120, b: 130}, str);
const grey = str => colorize({ r: 120, g: 120, b: 120}, str);
const yellow = str => colorize({ r: 255, g: 255, b: 120}, str);

function timestamp() {
    return (new Date()).toISOString()
}

export function logEvent(event: LogEvent) {
    let ts = timestamp();

    let level = event.level || c_log_info;

    if (event.error || event.errorCode)
        level = c_log_error;

    let tsForConsole = (new Date(ts)).toLocaleTimeString().split(' ')[0];

    let consoleText = `${tsForConsole} ${event.message || "(no message)"}`

    if (event?.topic) {
        consoleText = `[${event.topic}] ` + consoleText;
    }

    const otherContext = {
        ...event
    }

    delete otherContext.message;
    delete otherContext.level;
    delete otherContext.topic;
    delete otherContext.stack;

    if (Object.keys(otherContext).length > 0)
        consoleText += ' ' + JSON.stringify(otherContext);

    let afterLine = '';

    if (event.stack) {
        afterLine += '\n' + grey(''+event.stack);
    }

    switch (level) {
    case c_log_info:
        console.log(consoleText + afterLine);
        break;
    case c_log_warn:
        console.warn(yellow(consoleText) + afterLine);
        break;
    case c_log_error:
        console.error(red(consoleText) + afterLine);
        break;
    }
}

export function info(message: string, context?: LogEvent) {
    logEvent({ ...context, level: c_log_info, message });
}

export function warn(message: string, context?: LogEvent) {
    logEvent({ ...context, level: c_log_warn, message });
}

export function logError(error: Error | ErrorItem | string, context?: any) {
    const errorItem: ErrorItem = captureException(error, context);

    const asLogEvent: LogEvent = {
        ...errorItem,
        message: null,
        level: c_log_error,
    }

    if (asLogEvent.errorMessage) {
        asLogEvent.message = asLogEvent.errorMessage;
        delete asLogEvent.errorMessage;
    }

    if (!asLogEvent.message) {
        asLogEvent.message = errorItem.errorType;
    }

    if (!asLogEvent.message) {
        asLogEvent.message = "(no .errorMessage or .errorType)"
    }

    logEvent(asLogEvent);
}

export function createNestedLoggerStream(topic: string) {
    const stream = new Stream<LogEvent>();

    stream.sendTo(evt => {
        switch (evt.t) {
            case c_item: {
                const event: LogEvent = { ...evt.item, topic };
                logEvent(event);
                break;
            }

            case c_fail: {
                const event: LogEvent = { level: c_log_error, ...evt.error, topic }
                logError(event);
                break;
            }
        }
    });

    return stream;
}
