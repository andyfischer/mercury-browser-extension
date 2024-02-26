
import { recordFailure } from '../Errors'

const formatString = (string, args) => {
  let index = 0
  return string.replace(/%s/g, () => JSON.stringify(args[index++]))
}

class AssertFailure extends Error {
    failure_id: string
    error_type = 'assert'

    constructor(message) {
        super(message);
    }
}

export function assert(condition, createMessage, ...extraArgs) {
  if (condition)
    return

  const message = (typeof createMessage === 'string')
    ? formatString(createMessage, extraArgs)
    : createMessage(extraArgs)

  const failure_id = recordFailure({ errorType: 'test_assert', errorMessage: message });

  const error = new AssertFailure(message);

  error.failure_id = failure_id;
  error.message = message;

  throw error;
}

export function newAssertFailure(message: string, args = {}): AssertFailure {
  const failure_id = recordFailure({ errorType: 'test_assert', errorMessage: message, ...args });
  const error = new AssertFailure(message);

  for (const [ k, v ] of Object.entries(args))
      error[k] = v;

  return error;
}
