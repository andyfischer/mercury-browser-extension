import { assert, newAssertFailure } from './Assert'
import {
  isA,
  isFunction,
  isArray,
  isEqual,
  isObject,
  functionThrows,
  arrayContains,
  objectContains,
  stringContains
} from './TestUtils'
import { diffValues } from '../utils/DiffValues'

class AssertFailure extends Error {
    failure_id: string
    error_type = 'assert'

    constructor(message) {
        super(message);
    }
}

function getThrownException(fn, args = []) {
  try {
    fn(...args)
  } catch (error) {
      return error;
  }

  return null;
}

interface MoreOptions {
    //testRun?: TestRun
    throwOnFailure?: boolean
}

/**
 * An Expectation is a wrapper around an assertion that allows it to be written
 * in a more natural style, without the need to remember the order of arguments.
 * This helps prevent you from making mistakes when writing tests.
 */
export class Expect {
  actual: any
  context: any
  args: any
 //testRun?: TestRun
  throwOnFailure: boolean

  constructor(actual: any, options?: MoreOptions) {
    this.actual = actual
    //this.testRun = options?.testRun;
    this.throwOnFailure = options?.throwOnFailure ?? true;

    if (isFunction(actual)) {
      this.context = null
      this.args = []
    }
  }

  assert(condition: boolean, getMessage: () => string) {
     if (condition)
       return

    const message = getMessage();

    let failure_id;

    /*
    if (this.testRun) {
        failure_id = this.testRun.nextFailureId.take();
        this.testRun.recordFailure({ failure_id, message });
    }*/

    if (this.throwOnFailure) {
        const error = new AssertFailure(message);
        error.failure_id = failure_id;
        error.message = message;
        throw error;
    }
  }

  toExist(message?: string) {
    this.assert(
      this.actual,
      () => `Expected ${this.actual} to exist`
    );

    return this;
  }

  toBeTruthy(message?: string) {
      return this.toExist(message);
  }

  toBeDefined(message?: string) {
      return this.toExist(message);
  }

  toNotExist(message?: string) {
    this.assert(
      !this.actual,
      () => `Expected ${this.actual} to not exist`
    );

    return this
  }

  toBeFalsy(message?: string) {
      return this.toNotExist(message)
  }

  toBe(value) {
    this.assert(
      this.actual === value,
      () => `Expected ${this.actual} to be ${value}`,
    )

    return this
  }

  toNotBe(value) {
    this.assert(
      this.actual !== value,
      () => `Expected ${this.actual} to not be ${value}`,
    )

    return this
  }

  toEqual(value) {

    const diff = diffValues(this.actual, value);
    if (diff.equal)
        return;

    try {
      this.assert(
        false,
        () => `Expected ${this.actual} to equal ${value}`,
      );

    } catch (error) {
      error.actual = this.actual;
      error.expected = value;
      error.diff = diff;
      throw error
    }

    return this
  }

  toNotEqual(value) {
    assert(
      !isEqual(this.actual, value),
      'Expected %s to not equal %s',
      this.actual,
      value
    )

    return this
  }

  toThrow(value?: string) {

    if (!isFunction(this.actual)) {
        throw newAssertFailure("The 'actual' argument in expect(actual).toThrow() must be a function")
    }

    const thrown = getThrownException(this.actual);
    if (!thrown) {
        throw newAssertFailure("Expected function to throw but it didn't")
    }

    const diff = diffValues({ message: value }, { message: thrown.message });

    if (!diff.equal) {
        throw newAssertFailure("Exception didn't match expected", { diff })
    }

    return this;
  }

  toNotThrow(value, message) {
    assert(
      isFunction(this.actual),
      'The "actual" argument in expect(actual).toNotThrow() must be a function, %s was given',
      this.actual
    )

    assert(
      !functionThrows(this.actual, this.context, this.args, value),
      (message || 'Expected %s to not throw %s'),
      this.actual,
      value || 'an error'
    )

    return this
  }

  async toReject(value?) {
    if (!this.actual.then) {
        throw newAssertFailure("The 'actual' argument in expect(actual).toReject() must be a Promise")
    }

    try {
        await this.actual;
    } catch (err) {
      const diff = diffValues({ message: value }, { message: err.message });
      if (!diff.equal) {
        throw newAssertFailure("Exception didn't match expected", { diff })
      }
      return;
    }

    throw newAssertFailure("Promise didn't reject")
  }

  toBeA(value, message) {
    assert(
      isFunction(value) || typeof value === 'string',
      'The "value" argument in toBeA(value) must be a function or a string'
    )

    assert(
      isA(this.actual, value),
      (message || 'Expected %s to be a %s'),
      this.actual,
      value
    )

    return this
  }

  toNotBeA(value, message) {
    assert(
      isFunction(value) || typeof value === 'string',
      'The "value" argument in toNotBeA(value) must be a function or a string'
    )

    assert(
      !isA(this.actual, value),
      (message || 'Expected %s to not be a %s'),
      this.actual,
      value
    )

    return this
  }

  /*
  toMatch(pattern, message) {
    assert(
      tmatch(this.actual, pattern),
      (message || 'Expected %s to match %s'),
      this.actual,
      pattern
    )

    return this
  }

  toNotMatch(pattern, message) {
    assert(
      !tmatch(this.actual, pattern),
      (message || 'Expected %s to not match %s'),
      this.actual,
      pattern
    )

    return this
  }
  */

  toBeLessThan(value, message) {
    assert(
      typeof this.actual === 'number',
      'The "actual" argument in expect(actual).toBeLessThan() must be a number'
    )

    assert(
      typeof value === 'number',
      'The "value" argument in toBeLessThan(value) must be a number'
    )

    assert(
      this.actual < value,
      (message || 'Expected %s to be less than %s'),
      this.actual,
      value
    )

    return this
  }

  toBeLessThanOrEqualTo(value, message) {
    assert(
      typeof this.actual === 'number',
      'The "actual" argument in expect(actual).toBeLessThanOrEqualTo() must be a number'
    )

    assert(
      typeof value === 'number',
      'The "value" argument in toBeLessThanOrEqualTo(value) must be a number'
    )

    assert(
      this.actual <= value,
      (message || 'Expected %s to be less than or equal to %s'),
      this.actual,
      value
    )

    return this
  }

  toBeGreaterThan(value, message?) {
    assert(
      typeof this.actual === 'number',
      'The "actual" argument in expect(actual).toBeGreaterThan() must be a number'
    )

    assert(
      typeof value === 'number',
      'The "value" argument in toBeGreaterThan(value) must be a number'
    )

    assert(
      this.actual > value,
      (message || 'Expected %s to be greater than %s'),
      this.actual,
      value
    )

    return this
  }

  toBeGreaterThanOrEqualTo(value, message?) {
    assert(
      typeof this.actual === 'number',
      'The "actual" argument in expect(actual).toBeGreaterThanOrEqualTo() must be a number'
    )

    assert(
      typeof value === 'number',
      'The "value" argument in toBeGreaterThanOrEqualTo(value) must be a number'
    )

    assert(
      this.actual >= value,
      (message || 'Expected %s to be greater than or equal to %s'),
      this.actual,
      value
    )

    return this
  }

  toInclude(value, compareValues?, message?) {
    if (typeof compareValues === 'string') {
      message = compareValues
      compareValues = null;
    }

    if (compareValues == null)
      compareValues = isEqual

    let contains = false

    if (isArray(this.actual)) {
      contains = arrayContains(this.actual, value, compareValues)
    } else if (isObject(this.actual)) {
      contains = objectContains(this.actual, value, compareValues)
    } else if (typeof this.actual === 'string') {
      contains = stringContains(this.actual, value)
    } else {
      assert(
        false,
        'The "actual" argument in expect(actual).toInclude() must be an array, object, or a string'
      )
    }

    assert(
      contains,
      message || 'Expected %s to include %s',
      this.actual,
      value
    )

    return this
  }

  toExclude(value, compareValues, message?) {
    if (typeof compareValues === 'string') {
      message = compareValues
      compareValues = null
    }

    if (compareValues == null)
      compareValues = isEqual

    let contains = false

    if (isArray(this.actual)) {
      contains = arrayContains(this.actual, value, compareValues)
    } else if (isObject(this.actual)) {
      contains = objectContains(this.actual, value, compareValues)
    } else if (typeof this.actual === 'string') {
      contains = stringContains(this.actual, value)
    } else {
      assert(
        false,
        'The "actual" argument in expect(actual).toExclude() must be an array, object, or a string'
      )
    }

    assert(
      !contains,
      message || 'Expected %s to exclude %s',
      this.actual,
      value
    )

    return this
  }

  toIncludeKeys(keys, comparator, message?) {
    if (typeof comparator === 'string') {
      message = comparator
      comparator = null
    }

    //if (comparator == null)
    //  comparator = has

    assert(
      typeof this.actual === 'object',
      'The "actual" argument in expect(actual).toIncludeKeys() must be an object, not %s',
      this.actual
    )

    assert(
      isArray(keys),
      'The "keys" argument in expect(actual).toIncludeKeys(keys) must be an array, not %s',
      keys
    )

    const contains = keys.every(key => comparator(this.actual, key))

    assert(
      contains,
      message || 'Expected %s to include key(s) %s',
      this.actual,
      keys.join(', ')
    )

    return this
  }

  toIncludeKey(key, comparator, message?) {
    return this.toIncludeKeys([ key ], comparator, message)
  }

  toExcludeKeys(keys, comparator, message?) {
    if (typeof comparator === 'string') {
      message = comparator
      comparator = null
    }

    //if (comparator == null)
    //  comparator = has

    assert(
      typeof this.actual === 'object',
      'The "actual" argument in expect(actual).toExcludeKeys() must be an object, not %s',
      this.actual
    )

    assert(
      isArray(keys),
      'The "keys" argument in expect(actual).toIncludeKeys(keys) must be an array, not %s',
      keys
    )

    const contains = keys.every(key => comparator(this.actual, key))

    assert(
      !contains,
      message || 'Expected %s to exclude key(s) %s',
      this.actual,
      keys.join(', ')
    )

    return this
  }

  toExcludeKey(key, comparator, message?) {
    return this.toExcludeKeys([ key ], comparator, message)
  }
}
