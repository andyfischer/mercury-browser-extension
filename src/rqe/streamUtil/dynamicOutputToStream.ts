import { recordUnhandledException } from "../Errors";
import { Stream } from "../Stream";

/*
 * Take a dynamic value and send it to a Stream.
 *
 * The value can be:
 *   - A plain value or object (sent as a single item)
 *   - A list (sent as a list of items)
 *   - A Table object (all items are sent into the stream)
 *   - A Stream object (piped into the result stream)
 *   - An iterator, either sync or async.
 *   - A Promise (after it's resolved, then the value is handled as above).
 *
 */
export function dynamicOutputToStream(output: any, stream: Stream) {

    if (!output) {
        stream.finish();
        return;
    }

    if (output.t === 'stream') {
        output.sendTo(stream);
        return;
    }

    if (output.t === 'table') {
        for (const item of output.each())
            stream.put(item);
        stream.finish();
        return;
    }

    if (Array.isArray(output)) {
        stream.putSchema({hint: 'list'});
        for (const el of output)
            stream.put(el);
        stream.finish();
        return;
    }

    const isObject = typeof output === 'object';

    if (isObject && output[Symbol.iterator] !== undefined) {
        stream.putSchema({hint: 'list'});
        for (const el of output)
            stream.put(el);
        stream.finish();
        return;
    }

    if (isObject && output[Symbol.asyncIterator] !== undefined) {
        stream.putSchema({hint: 'list'});
        (async () => {
            for await (const el of output)
                stream.put(el);
            stream.finish();
        })();
        return;
    }

    if (output.then) {
        output.then(resolved => {
            dynamicOutputToStream(resolved, stream);
        })
        .catch(e => {
            if (stream.closedByUpstream) {
                recordUnhandledException(e);
                return;
            }

            if ((e as any).backpressure_stop || (e as any).is_backpressure_stop) {
                // Function is deliberately being killed by a BackpressureStop exception. Not an error.
                stream.close();
                return;
            }

            // console.error(err);

            stream.putException(e);
            stream.close();
        });

        return;
    }

    stream.putSchema({hint: 'value'});
    stream.put(output);
    stream.finish();
}
