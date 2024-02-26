import { recordUnhandledException } from "../Errors";
import { Stream, StreamEvent, StreamReceiver, c_restart, exceptionIsBackpressureStop } from "../Stream";
import { Table } from "../table";

export class CacheItem {

    // Request parameters
    params: any
    input_key: string

    // Entry info
    cached_at: number = Date.now()
    expire_at: number = 0
    liveRefCount: number = 0

    // Results and listeners
    receivedEvents: StreamEvent[] = [];
    activeResultStream: Stream
    listeners: StreamListenerList = new StreamListenerList();

    // Context
    id: number
    ownerTable: Table

    constructor(ownerTable: Table, params: any, input_key: string) {
        this.ownerTable = ownerTable;
        this.params = params;
        this.input_key = input_key;
    }

    incRef() {
        this.liveRefCount++;
    }

    decRef() {
        this.liveRefCount--;

        if (this.liveRefCount <= 0) {
            this.close();
        }
    }

    close() {
        // todo: close activeResultStream ?
        this.ownerTable.delete_with_input_key(this.input_key);
    }

    /*
      Take a new stream and install & listen to it as the active result stream.

      This will close the existing active result stream, if any. Will also
      send a 'restart' event to all listeners.
    */
    setResultStream(resultStream: Stream) {
        if (this.activeResultStream) {
            this.activeResultStream.closeByDownstream();
            this.activeResultStream = null;
        }

        this.receivedEvents = [];

        resultStream.sendTo({
            receive: (evt) => {
                this.receivedEvents.push(evt);
                this.listeners.receive(evt);
            }
        });

        this.listeners.receive({ t: c_restart });
    }

    // Add a listener strream. Will catch up the listener with all received events.
    addListener(listener: StreamReceiver) {
        for (const event of this.receivedEvents) {
            try {
                listener.receive(event);
            } catch (e) {
                if (exceptionIsBackpressureStop(e)) {
                    // Already backpressured, don't add it to the list.
                    return;
                }

                recordUnhandledException(e);
                return;
            }
        }

        this.listeners.add(listener);
    }

}

class StreamListenerList implements StreamReceiver {
    listeners: StreamReceiver[] = [];

    add(receiver: StreamReceiver) {
        this.listeners.push(receiver);
    }

    receive(event: StreamEvent<any>): void {
        let anyDeleted = false;

        let index = 0;
        for (const listener of this.listeners) {

            try {
                listener.receive(event);
            } catch (e) {
                if (exceptionIsBackpressureStop(e)) {
                    this.listeners[index] = null;
                    anyDeleted = true;
                } else {
                    recordUnhandledException(e);
                }
            }

            if (listener.isClosed && listener.isClosed()) {
                this.listeners[index] = null;
                anyDeleted = true;
            }

            index++;
        }

        if (anyDeleted) {
            this.listeners = this.listeners.filter(listener => listener != null);
        }
    }
}
