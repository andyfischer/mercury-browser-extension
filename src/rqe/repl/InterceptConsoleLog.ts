import { StackTraceAllConsoleLogs } from '../config'

function getStack() {
    return ((new Error()).stack + '').replace(/^Error:/, '');
}

if (StackTraceAllConsoleLogs) {
    let originalConsoleLog = console.log;
    console.log = (...strs: string[]) => {
        originalConsoleLog.apply(null, strs);
        originalConsoleLog('console.log call: ' + getStack());
    }
    
    let originalConsoleWarn = console.warn;
    console.warn = (...strs: string[]) => {
        originalConsoleWarn.apply(null, strs);
        const stackLines = ((new Error()).stack + '').replace(/^Error:/, '');
        originalConsoleWarn('console.warn call: ' + getStack());
    }

    let originalConsoleError = console.error;
    console.error = (...strs: string[]) => {
        originalConsoleError.apply(null, strs);
        const stackLines = ((new Error()).stack + '').replace(/^Error:/, '');
        originalConsoleError('console.error call: ' + getStack());
    }
}