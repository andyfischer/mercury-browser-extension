
import { Stream, StreamEvent, exceptionIsBackpressureStop } from '../Stream'
import { recordUnhandledException } from '../Errors'

export class StreamListenerList<ItemType = any, MetadataType = any> {
    items: Array<[ Stream<ItemType>, MetadataType ]> = []
    recordUnhandledExceptions = true

    add(metadata?: MetadataType) {
        const stream = new Stream<ItemType>();
        this.items.push([stream,metadata]);
        return stream;
    }

    *each() {
        yield* this.items;
    }

    receive(evt: StreamEvent<ItemType>) {
        let anyClosed = false;

        for (let index = 0; index < this.items.length; index++) {
            const stream = this.items[index][0];

            if (stream.isClosed()) {
                this.items[index] = null;
                anyClosed = true;
                continue;
            }

            try {
                stream.receive(evt);
            } catch (e) {
                if (exceptionIsBackpressureStop(e)) {
                    anyClosed = true;
                    this.items[index] = null;
                    continue;
                }

                if (this.recordUnhandledExceptions)
                    recordUnhandledException(e);
            }
        }

        if (anyClosed)
            this.items = this.items.filter(item => item != null);
    }

    /*
        Call the callback for each stream in the list. The callback can throw exceptions
        (including BackpressureStop) and they will be caught & handled.
    */
    forEach(callback: (stream: Stream<ItemType>, metadata: MetadataType) => void) {
        let anyClosed = false;

        for (let index = 0; index < this.items.length; index++) {
            const stream = this.items[index][0];
            const metadata = this.items[index][1];

            try {
                callback(stream, metadata);
            } catch (e) {
                if (exceptionIsBackpressureStop(e)) {
                    anyClosed = true;
                    this.items[index] = null;
                }

                if (this.recordUnhandledExceptions)
                    recordUnhandledException(e);
            }
        }

        if (anyClosed)
            this.items = this.items.filter(item => item !== null);
    }
}
