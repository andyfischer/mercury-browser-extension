
import { Table } from './Table'
import { Stream } from '../Stream'
import { recordUnhandledException } from '../Errors'

export function listenToValueChange<T = any>(table: Table<T>, callback: (newValue: T, oldValue: T) => void): Stream {
    const stream = table.listen();

    let current = table.get();

    callback(current, null);

    stream.sendTo({
        receive(msg) {
            let latest = table.get();
            if (current != latest) {
                try {
                    callback(latest, current);
                } catch (e) {
                    recordUnhandledException(e);
                }
            }
            current = latest;
        }
    })

    return stream;
}

