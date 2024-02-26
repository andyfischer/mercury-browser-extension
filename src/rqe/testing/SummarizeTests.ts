
import { red, grey } from '../repl/AnsiColors'
import { TestFailures } from './TestState';

export function startTestSession() {
    // todo
}

export function summarizeTestSessionToConsole() {
    for (const globalFail of TestFailures.each()) {
        console.log(`${red('FAIL')} ${globalFail.message}\n${grey(globalFail.stack)}`);
    }
}
