
import { timedOut } from '../utils/timedOut'
import { Expect } from './Expect'
import { Stream } from '../Stream'
import { StringIDSource } from '../utils/IDSource'
import { ErrorItem, startGlobalErrorListener, errorItemToString } from '../Errors'
import { MultiMap } from '../utils/MultiMap'
import { green, red, yellow, black, grey, greenBg, redBg, yellowBg } from '../repl/AnsiColors'
import { TestCases } from './TestState'
import { compileSchema, lazySchema } from '../table'

export type TestCallback = () => void | Promise<void>

export interface TestCase {
    id?: string
    description: string
    callback: TestCallback
    definedAt?: string
    enabled: boolean
}

export interface TestError {
    failure_id?: string
    error_type: string
    message?: string
    stack?: any
    run_id: string
}

export interface TestResult {
    run_id: string
    testCase: TestCase
    errors: TestError[]
    coincidenceErrors: ErrorItem[]
}

export interface SummarizeOptions {
    listAllPassingTests?: boolean
}

type Scenario = { t: 'default_scenario' } | { t: 'enable_alt_impl', name: string }

const TestRunsSchema = lazySchema({
    name: "TestRuns",
    attrs: [
        'run_id(auto)'
    ],
    funcs: [
    ]
});

const ActiveTestRunsSchema = lazySchema({
    name: "ActiveTestRuns",
    funcs: [
        'listAll',
        'delete(run_id)'
    ]
});

export class TestFramework {

    testTimeoutMs = 5000
    globalFailureListener: Stream

    testRuns = TestRunsSchema.createTable();
    activeTestRuns = ActiveTestRunsSchema.createTable();

    async runSingleCase(testCase: TestCase) {
        if (!testCase.enabled)
            return;

        const { run_id } = this.testRuns.insert({});
        this.activeTestRuns.insert({run_id});
        let preexistingFailureIds = [];

        const result: TestResult = {
            run_id,
            testCase,
            errors: [],
            coincidenceErrors: [],
        };

        let promise;

        try {
            promise = Promise.resolve(testCase.callback());
        } catch (err) {
            const error_type = err['error_type'] || 'unhandled_exception';
            result.errors.push({ 
                ...err,
                stack: err.stack,
                message: err.message,
                error_type,
                run_id,
            });
            promise = Promise.resolve(null);
        }

        promise = promise.catch(err => {
            const error_type = err['error_type'] || 'unhandled_rejection';
            result.errors.push({
                ...err,
                stack: err.stack,
                message: err.message,
                error_type,
                run_id,
            });
        });

        if (await timedOut(promise, this.testTimeoutMs)) {
            result.errors.push({ error_type: 'timed_out', run_id });
        }

        this.activeTestRuns.delete_with_run_id(run_id);
        return result;
    }

    async runTestCases(cases: TestCase[]): Promise<TestResult[]> {
        // Start a new session
        if (this.globalFailureListener) {
            throw new Error("TestFramework.runTestCases usage issue: globalFailureListener already open");
        }
        
        this.globalFailureListener = startGlobalErrorListener();

        this.globalFailureListener.forEach(error => {
            console.log("Unhandled " + errorItemToString(error));

            const activeRuns = this.activeTestRuns.listAll();
            console.log(' Test cases running during this error:');

            for (const activeRun of activeRuns) {
                const { run_id } = activeRun;
                const runDetails = this.testRuns.get_with_run_id(run_id);
                console.log('  ' + runDetails.testCase.description);
            }
        });
        
        // Run each test
        const results = Promise.all(cases.map(testCase => this.runSingleCase(testCase)));

        // Finish session
        this.globalFailureListener.closeByDownstream();
        this.globalFailureListener = null;

        return results;
    }
}

interface OverallSummary {
    passedCount: number
    failedCount: number
    totalCount: number
    hasDisplayedCoincidenceError: Set<any>
    options: SummarizeOptions
}

export function summarizeOneTestResult(testResult: TestResult, summary: OverallSummary, log: (s?: any) => void) {
    const passed = testResult.errors.length === 0;
    const errorsByScenario = new MultiMap();

    // Update summary
    summary.totalCount++;
    if (passed)
        summary.passedCount++;
    else
        summary.failedCount++;

    let leftSideLabel;

    if (passed) {
        leftSideLabel = black(greenBg(' PASS '));
    } else {
        leftSideLabel = black(redBg(' FAIL '))
    }

    let definedAtSection = '';
    if (testResult.testCase.definedAt)
        definedAtSection = ` - ${grey(testResult.testCase.definedAt)}`

    if (passed && !summary.options.listAllPassingTests)
        return;

    log(`${leftSideLabel} ${testResult.testCase.description}${definedAtSection}`);

    for (const error of testResult.errors) {
        log(error)
        summary.hasDisplayedCoincidenceError.add(error.failure_id);
        // log(`${yellow('Error: ' + error.message) + '\n' + error.stack}`)
    }
}

export function summarizeTestResults(results: TestResult[], log: (s?: any) => void, options: SummarizeOptions = {}) {

    if (options.listAllPassingTests === undefined)
        options.listAllPassingTests = true;

    const summary: OverallSummary = {
        passedCount: 0,
        failedCount: 0,
        totalCount: 0,
        hasDisplayedCoincidenceError: new Set(),
        options,
    }

    for (const testResult of results) {
        summarizeOneTestResult(testResult, summary, log);
    }

    log();

    let coincidenceErrorCount = 0;

    for (const testResult of results) {
        for (const error of testResult.coincidenceErrors) {
            if (summary.hasDisplayedCoincidenceError.has(error.failureId))
                continue;

            summary.hasDisplayedCoincidenceError.add(error.failureId);
            coincidenceErrorCount++;

            log(`${yellow('Error: ' + error.errorMessage) + '\n' + error.stack}`)
        }
    }

    if (coincidenceErrorCount > 0)
        log();

    let countSections = [];
    if (summary.failedCount > 0) {
        countSections.push(red(`${summary.failedCount} failed`));
    }

    countSections.push(green(`${summary.passedCount} passed`));
    countSections.push(`${summary.totalCount} total`);

    log(`Tests: ${countSections.join(', ')}`);
    if (coincidenceErrorCount > 0)
        log(`${yellow(coincidenceErrorCount + " error(s) occurred during tests")}`);

    log();
}

export function summarizeTestResultsToString(results: TestResult[]) {
    let lines = [];
    summarizeTestResults(results, str => {
        if (str === undefined)
            str = '';
        lines.push(JSON.stringify(str));
    });
    return lines.join('\n');
}

function getFunctionDefinedAt(stack: any) {
    let definedAt = stack.toString().split('\n')[2];

    definedAt = definedAt.slice(definedAt.indexOf('(') + 1, definedAt.indexOf(')'));
    let lineNumber = definedAt.slice(definedAt.indexOf(':'), definedAt.length);
    lineNumber = ':' + lineNumber.split(':')[1];
    definedAt = definedAt.slice(0, definedAt.indexOf(':')) + lineNumber;

    return definedAt;
}

export function it(description: string, callback: TestCallback) {
    const stack = (new Error()).stack;

    TestCases.insert({
        description,
        callback,
        definedAt: getFunctionDefinedAt(stack),
        enabled: true
    });
}

export function xit(description: string, callback: TestCallback) {
    const stack = (new Error()).stack;

    TestCases.insert({
        description,
        callback,
        definedAt: getFunctionDefinedAt(stack),
        enabled: false
    });
}

export function expect(value) {
    return new Expect(value);
}

export function describe(description: string, callback: () => void) {
    // todo - maybe do more stuff here
    callback();
}
