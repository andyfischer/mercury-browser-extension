
import { colorize, stripAnsi } from './AnsiColors'
import { Stream, c_item, c_fail } from '../Stream'

const white = str => colorize({ r: 255,g: 255, b: 255 }, str);
const grey = str => colorize({ r: 120, g: 120, b: 120}, str);
const green = str => colorize({ r: 0, g: 255, b: 0}, str);
const red = str => colorize({ r: 255, g: 0, b: 0}, str);
const yellow = str => colorize({ r: 255, g: 255, b: 0}, str);

function timestamp() {
    return (new Date()).toISOString()
}

let hasHadErrorSavingLog = false;

let _logConfiguration = {
    shortTimestamps: (process.env.LOGGING_STYLE === 'dev')
}

export function configureLogs(config: { shortTimestamps: boolean }) {
    _logConfiguration = config;
}

export function checkForStartupBlockingError() {
    if (hasHadErrorSavingLog) {
        return { msg: "Failed to write a log message to database" }
    }
}

export function saveLog(log_type: string, event: any) {
    let ts = timestamp();
    let consoleTs = ts;

    if (_logConfiguration.shortTimestamps) {
        consoleTs = ts.slice(11, 19);
    }

    let messageText = `${consoleTs} ${event.msg}`

    if (event.topic)
        messageText = `[${event.topic}] ${messageText}`

    // Print to stdout/stderr
    switch (log_type) {
    case 'info':
        console.log(messageText);
        break;
    case 'warn':
        console.warn(yellow(messageText));
        break;
    case 'error':
    case 'exception': {
        let formatted = red(messageText);
        if (event.stack)
            formatted += '\n' + grey(''+event.stack);

        formatted += '\n' + JSON.stringify(event);
        console.error(formatted);
        break;
    }
    }

    const cleanData = {
        ...event,
        msg: stripAnsi(event.msg + '')
    };

    /*
    try {
        getNodeStore().run(
            `insert into logs2 (ts, log_type, json_data) values (?, ?, ?)`,
            [ts, log_type, JSON.stringify(cleanData)],
        )
    } catch (err) {
        if (hasHadErrorSavingLog)
            return;

        console.warn(err);
        console.warn("Logger failed to save message to database (this warning only shows once)");
        hasHadErrorSavingLog = true;
    }
    */
}

export function info(msg: string) {
    saveLog('info', { msg });
}

export function warn(msg: string) {
    saveLog('warn', { msg });
}

export function error(msg: string) {
    saveLog('error', { msg });
}

export function startupInfo(msg: string) {
    return saveLog('info', { msg, topic: 'startup' });
}

export function logException(err: Error) {
    saveLog('exception', { msg: err.message, stack: err.stack })
}

export function safeAside(callback: () => Promise<any>) {
    try {
        callback()
        .catch(err => logException(err));
    } catch (err) {
        logException(err);
    }
}

export function createNestedLoggerStream(topic: string): Stream {
    const stream = new Stream();

    stream.sendTo(evt => {
        switch (evt.t) {
            case c_item:
                saveLog(evt.item.level || 'info', { msg: evt.item.msg, topic });
                break;
            case c_fail:
                saveLog('error', { msg: `[${topic}] ${evt.error.errorMessage}` })
                break;
        }
    });

    return stream;
}

