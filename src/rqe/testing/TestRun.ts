
import { StringIDSource } from '../utils/IDSource'
import { Table, compileSchema, Schema } from '../table'
import { ErrorItem, captureException } from '../Errors'
import { Stream } from '../Stream'
import { diffValues } from '../utils/DiffValues'
import { red, grey } from '../repl/AnsiColors'
import { joinStreams } from '../utils/joinStreams'
import { callbackToStream } from '../handler'

export interface Failure {
    failure_id: string
    message: string
    stack?: any
    errorItem?: ErrorItem
    fixCallback?: Function
}

let _failuresSchema: Schema;

function getFailuresSchema() {
    if (!_failuresSchema) {
        _failuresSchema = compileSchema({
            name: 'TestFailures',
            funcs: [
                'get(failure_id)'
            ]
        });
    }

    return _failuresSchema;
}

export class TestRun {
    nextFailureId = new StringIDSource('fail-');
    failures = getFailuresSchema().createTable()
    printFailures = false
    numberOfExpects = 0

    recordFailure(failure: Failure): string {
        if (!failure.failure_id)
            failure.failure_id = this.nextFailureId.take();

        if (!failure.stack) {
            let stack = (new Error()).stack;
            stack = stack.split('\n').slice(2).join('\n');
            failure.stack = stack;
        }

        this.failures.insert(failure);

        if (this.printFailures) {
            let formattedStackTrace = ''+failure.stack;
            formattedStackTrace = formattedStackTrace.split('\n').slice(1).join('\n');
            console.error(`failure: ${failure.message}\n${formattedStackTrace}`);
        }

        return failure.failure_id;
    }

    recordUnhandledError(errorItem: ErrorItem) {
        return this.recordFailure({
            failure_id: this.nextFailureId.take(),
            message: errorItem.errorMessage,
            stack: errorItem.stack,
            errorItem,
        });
    }

    recordUnhandledException(e: Error) {
        const item = captureException(e);
        return this.recordUnhandledError(item);
    }

    /*
    expect(actual: any) {
        this.numberOfExpects++;
        return new Expect(actual, { testRun: this, throwOnFailure: false });
    }
    */

    expectEquals(actual: any, value: any) {
        const diff = diffValues(actual, value);
        if (diff.equal)
            return;

        this.recordFailure({
            failure_id: this.nextFailureId.take(),
            message: `Expected ${actual} to equal ${value}`,
        })
    }

    printResults() {
        console.log(`TestRun finished. ${this.failures.size()} failure(s) out of ${this.numberOfExpects} assertions.`);
        for (const fail of this.failures.each()) {
            console.log(`${red('FAIL')} ${fail.message}\n${grey(fail.stack)}`);
        }
    }

    fixAll(): Stream {
        const out = new Stream();

        if (this.failures.size() === 0) {
            out.put("fixAll - no failures found!")
            return;
        }

        const fixable: Failure[] = [];
        for (const fail of this.failures.each()) {
            if (fail.fixCallback)
                fixable.push(fail);
        }

        if (fixable.length === 0) {
            out.put(`fixAll - saw ${this.failures.size()} failure(s) but 0 were fixable`);
            return;
        }

        const outputs = joinStreams(fixable.length, out);

        let index = 0;
        for (const fail of fixable) {
            callbackToStream(fail.fixCallback, outputs[index]);
            index++;
        }

        return out;
    }
}
