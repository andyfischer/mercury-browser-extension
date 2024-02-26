
import { Stream } from '../Stream'
import { recordUnhandledException } from '../Errors'
import { parseHandler } from '../parser/parseHandler';
import { Task } from '../task';
import { dynamicOutputToStream } from '../streamUtil/dynamicOutputToStream';

/*
 * Execute a callback and send the result to the output Stream.
 *
 * This uses resolveOutputToStream for resolving the output value.
 * This function also catches exceptions and sends them as an error
 * into the Stream.
 */
export function callbackToStream(callback: Function, stream: Stream) {

    let output;

    try {
        output = callback();

    } catch (e) {
        if (stream.closedByUpstream) {
            recordUnhandledException(e);
            return;
        }

        if ((e as any).backpressure_stop || (e as any).is_backpressure_stop) {
            // Function is deliberately being killed by a BackpressureStop exception. Not an error.
            return;
        }

        stream.putException(e);
        stream.close();
        return;
    }

    dynamicOutputToStream(output, stream);
}

export function declaredFunctionToHandler(decl: string, callback: Function) {

    const handler = parseHandler(decl);

    const params = handler.getParamAttrs();

    handler.setCallback((task: Task) => {
        const stream = new Stream();

        callbackToStream(() => {
            // Find the args mentioned by the declaration and extract them into
            // a list to send to the callback.
            const args = params.map(param => {
                if (task.hasValue(param))
                    return task.getValue(param);

                // Check if this is an implicit param.
                if (param === 'task')
                    return task;

                return null;
            });
            return callback(...args);
        }, stream);

        return stream;
    });

    return handler;
}
