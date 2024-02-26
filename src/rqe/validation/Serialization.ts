
import { EnableWarningOnUnserializableData } from '../config'

export function assertDataIsSerializable(data: any, depth: number = 0) {
    if (depth > 5) {
        return;
    }

    if (EnableWarningOnUnserializableData) {

        if (!data)
            return;

        // First check some known common types.
        if (data?.t === 'stream')
            throw new Error(`can't serialize type: Stream`);

        // At the moment the important one to catch is Function because it will be silently ignored
        // by JSON.stringify.
        //
        // Other types that are silently ignored by JSON.stringify are Undefined (which is fine) and
        // Symbol (not used by us)
        //
        // There are other possible serialization errors (like cyclic references) but these throw an
        // exception in JSON.stringify, so there's your assertion, buddy.

        if (typeof data === 'function') {
            const err = new Error("can't serialize type: function");
            err['badType'] = 'function'
            err['path'] = [];
            throw err;
        }

        if (typeof data === 'object') {
            for (const [k,v] of Object.entries(data)) {
                try {
                    assertDataIsSerializable(v, depth + 1);
                } catch (err) {
                    if (err['badType']) {
                        err['path'] = [k].concat(err['path']);
                        err.message = `can't serialize type: ${err['badType']} (at path: ${err['path'].join('.')})`;
                        throw err;
                    }
                }
            }
        }
    }
}
