
import { toException, ErrorItem } from './Errors'
import { captureException, ErrorContext } from './Errors'
import { openAsyncIterator } from './utils/openAsyncIterator'
import { StreamSuperTrace, StreamSuperDuperTrace } from './config'
import { IDSource } from './utils/IDSource'
import { SchemaDecl } from './table/SchemaDecl'
const TraceCloseEvents = false;

export enum StreamEventType {
    // Basic stream events.
    c_item = 101,
    c_done = 102,
    c_fail = 103,
    c_close = 104,

    // Extra data
    c_header = 110,
    c_comment = 111,
    c_related = 112,
    c_schema = 113,
    c_info = 114,
    c_warn = 115,

    // Table listener events.
    c_start_updates = 120,
    c_restart = 121,
    c_delta = 122,
};

export const c_item = StreamEventType.c_item;
export const c_done = StreamEventType.c_done;
export const c_fail = StreamEventType.c_fail;
export const c_close = StreamEventType.c_close;
export const c_header = StreamEventType.c_header;
export const c_comment = StreamEventType.c_comment;
export const c_related = StreamEventType.c_related;
export const c_schema = StreamEventType.c_schema;
export const c_start_updates = StreamEventType.c_start_updates;
export const c_restart = StreamEventType.c_restart;
export const c_delta = StreamEventType.c_delta;
export const c_info = StreamEventType.c_info;
export const c_warn = StreamEventType.c_warn;

export type LogLevel = typeof c_info | typeof c_warn

export interface StreamItem<ItemType = any> { t: StreamEventType.c_item, item: ItemType }
export interface StreamClose { t: StreamEventType.c_close }
export interface StreamFail { t: StreamEventType.c_fail, error: ErrorItem, }
export interface StreamHeader { t: StreamEventType.c_header, comment?: string }
export interface StreamSchema { t: StreamEventType.c_schema, schema: SchemaDecl }
export interface StreamRestart { t: StreamEventType.c_restart }
export interface StreamRelatedItem { t: StreamEventType.c_related, item: any }
export interface StreamComment { t: StreamEventType.c_comment, message: string, level?: LogLevel, details?: any }
export interface StreamDone { t: StreamEventType.c_done }
export interface StreamStartUpdates { t: StreamEventType.c_start_updates }
export interface StreamDelta { t: StreamEventType.c_delta, func: string, params: any[] }

export type StreamEvent<ItemType = any> = StreamSchema | StreamItem<ItemType> | StreamFail
    | StreamRelatedItem | StreamComment
    | StreamDone | StreamClose | StreamHeader
    | StreamStartUpdates | StreamRestart | StreamDelta ;

export interface StreamReceiver<ItemType = any> {
    receive(event: StreamEvent<ItemType>): void
    isClosed?: () => boolean
}

export type StreamReceiverCallback<ItemType = any> = (event: StreamEvent<ItemType>) => void

export type LooseStreamReceiver<ItemType = any> = StreamReceiver<ItemType> | StreamReceiverCallback<ItemType>

export interface DebugMetadata {
    name: string
}

const _globalID = new IDSource()


export class Stream<ItemType = any> implements StreamReceiver {
    t = 'stream'
    globalId: number = _globalID.take()
    receiver: StreamReceiver = null
    closedByUpstream = false;
    closedByDownstream = false;
    upstreamData?: any
    upstreamMetadata?: { name: string }
    downstreamMetadata?: { name: string }

    closedByUpstreamTrace: any
    closedByDownstreamTrace: any

    // Backlog data (if the output isn't connected yet)
    backlog: StreamEvent[] = [];

    isStream() {
        return true;
    }

    isClosed() {
        return this.closedByUpstream || this.closedByDownstream;
    }

    hasDownstream() {
        return !!this.receiver;
    }

    _sendToReceiver(event: StreamEvent) {
        try {
            this.receiver.receive(event);
        } catch (e) {
            if (exceptionIsBackpressureStop(e)) {
                this.closeByDownstream();
                return;
            }

            throw e;
        }
    }

    receive(event: StreamEvent) {
        //if (this.isClosed())
        if (this.closedByDownstream)
            throw new BackpressureStop();

        if ((event as any).t === 'done') {
            // Legacy
            throw new Error("don't use 'done' events any more");
        }

        if (StreamSuperTrace || StreamSuperDuperTrace) {
            console.log(`${this.getDebugLabel()} received:`, event);

            if (StreamSuperDuperTrace) {
                const trace = ((new Error()).stack + '').replace(/^Error:/, '');
                console.log('at: ' + trace);
            }
        }

        // Check for 'close' event.
        switch (event.t) {
        case c_close:
            if (this.closedByUpstream)
                throw new ProtocolError(`${this.getDebugLabel()} Got a duplicate 'close' event`);

            this.closedByUpstream = true;

            if (TraceCloseEvents)
                this.closedByUpstreamTrace = (new Error());
            break;
        }

        if (this.receiver) {
            this._sendToReceiver(event);
            
        //} else {
        } else if (this.backlog) {
            //if (!this.backlog)
            //    this.backlog = [];
            this.backlog.push(event);
        }
    }

    sendTo(receiver: LooseStreamReceiver) {
        if (typeof receiver === 'function')
            receiver = { receive: receiver };

        if (this.hasDownstream())
            throw new UsageError(`${this.getDebugLabel()} already has a receiver`);

        if (!receiver.receive)
            throw new UsageError("invalid StreamReceiver, missing .receive")

        this.receiver = receiver;

        if (StreamSuperTrace) {
            console.log(`${this.getDebugLabel()} is now sending to:`,
                        (receiver as any).getDebugLabel ? (receiver as any).getDebugLabel() : 'anonymous receiver');
        }

        if (this.backlog) {
            // Send the pending backlog.
            const backlog = this.backlog;
            delete this.backlog;

            for (const event of backlog) {
                if (this.closedByDownstream)
                    // they don't want our events anymore.
                    break;

                this._sendToReceiver(event);
            }
        }
    }

    collectEvents(callback: (events: StreamEvent[]) => void) {
        let events: StreamEvent[] = [];

        this.sendTo({
            receive(msg: StreamEvent) {
                if (events === null)
                    return;

                if (events)
                    events.push(msg);

                if (events !== null && msg.t === c_done || msg.t === c_close) {
                    callback(events);

                    events = null;
                    callback = null;
                    return;
                }
            }
        });
    }

    collectEventsSync(): StreamEvent[] {
        let events: StreamEvent[] = null;

        this.collectEvents(_events => { events = _events });

        if (events === null)
            throw new UsageError(`${this.getDebugLabel()} did not finish synchronously`);

        return events;
    }

    takeItemsSync(): ItemType[] {
        const items: ItemType[] = [];
        for (const event of this.collectEventsSync()) {
            switch (event.t) {
                case c_fail:
                    throw toException(event.error);
                case c_item:
                    items.push(event.item);
            }
        }
        return items;
    }

    collectOneItemSync(): ItemType {
        const items = this.takeItemsSync();
        if (items.length === 0)
            throw new Error(`collectOneItemSync on ${this.getDebugLabel()}: Stream did not return any items`);
        return items[0];
    }

    promiseEvents() {
        return new Promise<StreamEvent[]>((resolve, reject) => {
            this.collectEvents(resolve);
        });
    }

    // Promise that waits for the stream to finish. Any errors will be thrown.
    // Returns a list of output items.
    promiseItems() {
        return new Promise<ItemType[]>((resolve, reject) => {
            let items: ItemType[] = [];

            this.sendTo({
                receive(msg: StreamEvent) {
                    switch (msg.t) {
                    case c_item:
                        items.push(msg.item)
                        break;
                    case c_done:
                    case c_close:
                        if (items !== null)
                            resolve(items);
                        items = null;
                        break;
                    case c_fail:
                        reject(toException(msg.error));
                        break;
                    }
                }
            });
        });
    }

    // Promise that waits for the stream to finish. Any errors will be thrown.
    // Ignores output items.
    wait() {
        return new Promise<void>((resolve, reject) => {
            this.sendTo({
                receive(msg: StreamEvent) {

                    if (msg.t === c_done) {
                        resolve();
                    } else if (msg.t === c_fail) {
                        reject(toException(msg.error));
                    }
                }
            });
        });
    }

    async promiseOneItem(): Promise<ItemType> {
        const items = await this.promiseItems();
        if (items.length === 0)
            throw new Error(`promiseOneItem on ${this.getDebugLabel()}: Stream did not return any items`);
        return items[0];
    }

    // Consume this stream as a sync iterator.
    *[Symbol.iterator]() {
        yield* this.takeItemsSync();
    }
    
    // Consume this stream as an async iterator.
    async* [Symbol.asyncIterator](): AsyncIterableIterator<ItemType> {

        const { send, iterator } = openAsyncIterator<StreamEvent<ItemType>>();

        this.sendTo({ receive: send });

        for await (const evt of iterator) {
            switch (evt.t) {
            case c_done:
            case c_close:
                return;
            case c_item:
                yield evt.item;
                break;
            case c_fail:
                throw toException(evt.error);
            }
        }
    }

    takeBacklog(): StreamEvent[] {
        if (this.receiver) {
            throw new UsageError(`takeBacklog on ${this.getDebugLabel()}, stream has a receiver`);
        }

        const items = this.backlog;
        this.backlog = [];
        return items;
    }

    takeBacklogItems(): ItemType[] {
        const items = [];
        for (const evt of this.takeBacklog()) {
            switch (evt.t) {
                case c_item:
                    items.push(evt.item);

            }
        }
        return items;
    }

    // Helper functions to put events
    put(item: ItemType) { this.receive({ t: c_item, item }); }
    putRelated(item: any) { this.receive({ t: c_related, item }); }
    putDone() { this.receive({ t: c_done }); }
    putRestart() { this.receive({ t: c_restart }); }
    putError(error: ErrorItem) { this.receive({ t: c_fail, error }); }
    putSchema(schema: SchemaDecl) { this.receive({ t: c_schema, schema }); }

    putException(err: Error, context?: ErrorContext) {
        this.receive({ t: c_fail, error: captureException(err, context) });
    }

    closeWithException(err: Error, context?: ErrorContext) {
        this.putException(err, context);
        this.close();
    }

    comment(message: string, level?: LogLevel, details?: any) {
        this.receive({ t: c_comment, message, level, details });
    }

    done() {
        this.receive({t: c_done});
    }

    close() {
        this.receive({t: c_close});
    }

    closeWithError(error: ErrorItem) {
        this.receive({t: c_fail, error});
        this.receive({t: c_close});
    }

    finish() {
        this.receive({t: c_done});
        this.receive({t: c_close});
    }

    spyEvents(callback: (evt: StreamEvent<ItemType>) => void): Stream<ItemType> {
        const output = new Stream<ItemType>();

        this.sendTo({
            receive(evt) {
                callback(evt);
                output.receive(evt);
            }
        });

        return output;
    }

    // mapcat - Use a callback function that returns OutputType items. Return a new Stream
    // that includes the transformed items. Note that null/falsy items are ignored.
    map<OutputType = ItemType>(callback: (item: ItemType) => OutputType): Stream<OutputType> {
        const output = new Stream<OutputType>();

        this.sendTo({
            receive(evt) {
                switch (evt.t) {
                    case c_item:
                        try {
                            const transformed = callback(evt.item);
                            if (transformed)
                                output.put(transformed);
                        } catch (e) {
                            output.putException(e);
                        }
                        break;
                    default:
                        output.receive(evt as StreamEvent<OutputType>);
                }
            }
        });

        return output;
    }

    mapEvents<OutputType = ItemType>(callback: (evt: StreamEvent<ItemType>) => StreamEvent<OutputType>): Stream<OutputType> {
        const output = new Stream<OutputType>();

        this.sendTo({
            receive(evt) {
                try {
                    output.receive(callback(evt));
                } catch (e) {
                    output.putException(e);
                }
            }
        });

        return output;
    }

    // mapcat - Use a callback function that returns lists (of type OutputType[]), return a new
    // Stream that includes the transformed (and concatenated) items.
    mapcat<OutputType = ItemType>(callback: (item: ItemType) => OutputType[]): Stream<OutputType> {
        const output = new Stream<OutputType>();

        this.sendTo({
            receive(evt) {
                switch (evt.t) {
                    case c_item:
                        try {
                            const transformed = callback(evt.item);
                            if (transformed) {
                                for (const item of transformed)
                                    output.put(item);
                            }
                        } catch (e) {
                            output.putException(e);
                        }
                        break;
                    default:
                        output.receive(evt as StreamEvent<OutputType>);
                }
            }
        });

        return output;
    }

    forEach(callback: (ItemType) => void) {
        this.sendTo({
            receive(evt: StreamEvent) {
                switch (evt.t) {
                    case c_item:
                        try {
                            callback(evt.item);
                        } catch (e) {
                            console.error(`${this.getDebugLabel()}: unhandled exception in Stream.watchItems: `, e);
                        }
                        break;
                    case c_fail:
                        console.error(`${this.getDebugLabel()}: unhandled error in Stream.watchItems: `, evt.error);
                        break;
                }
            }
        });
    }

    spyItems(callback: (ItemType) => void) {
        return this.map(item => {
            callback(item);
            return item;
        });
    }

    closeByDownstream() {
        this.closedByDownstream = true;
        this.receiver = null;
        this.backlog = null;
    }
    
    // Debug Metadata //

    setUpstreamMetadata(data: DebugMetadata) {
        if (this.upstreamMetadata)
            throw new UsageError("Stream already has upstreamMetadata");
        this.upstreamMetadata = data;
    }

    setDownstreamMetadata(data: DebugMetadata) {
        if (this.downstreamMetadata)
            throw new UsageError("Stream already has downstreamMetadata");
        this.downstreamMetadata = data;
    }

    getDebugLabel(): string {
        let label = `Stream #${this.globalId}`;

        let details;
        let downstreamName;
        let upstreamName;

        if (this.upstreamMetadata?.name)
            upstreamName = this.upstreamMetadata?.name;

        if (this.downstreamMetadata?.name)
            downstreamName = this.downstreamMetadata?.name;

        if (!downstreamName && !this.hasDownstream())
            downstreamName = 'backlog';

        if (downstreamName || upstreamName) {
            details = `${upstreamName} -> ${downstreamName}`
        }

        if (details)
            label += ` (${details})`

        return label;
    }

    logSpy({name}: {name: string}) {
        return this.mapEvents(evt => {
            console.log(`${name}: ${eventTypeToString(evt.t)}`, (evt as any).item || evt);
            return evt;
        });
    }

    // Static Constructors //

    static newEmptyStream() {
        const stream = new Stream();
        stream.done();
        stream.close();
        return stream;
    }

    static fromList<ItemType = any>(items: ItemType[]) {
        const stream = new Stream<ItemType>();
        for (const item of items)
            stream.put(item);
        stream.done();
        stream.close();
        return stream;
    }

    static newNullStream() {
        const stream = new Stream();
        stream.sendTo(evt => {});
        return stream;
    }
}

export function isStream(value: any) {
    return value?.t === 'stream'
}

export class BackpressureStop extends Error {
    is_backpressure_stop = true

    constructor() {
        super("Can't put to stream (backpressure stop)");
    }
}

export class ProtocolError extends Error {
    is_stream_protocol_error = true

    constructor(msg: string) {
        super("Stream protocol error: " + msg);
    }
}

export class UsageError extends Error {
    is_stream_usage_error = true

    constructor(msg: string) {
        super("Stream usage error: " + msg);
    }
}

function eventTypeToString(type: StreamEventType) {
    switch (type) {
        case c_item: return 'item';
        case c_done: return 'done';
        case c_fail: return 'fail';
        case c_close: return 'close';
        case c_header: return 'header';
        case c_comment: return 'comment';
        case c_related: return 'related';
        case c_schema: return 'schema';
        case c_start_updates: return 'start_updates';
        case c_restart: return 'restart';
        case c_delta: return 'delta';
        case c_info: return 'info';
        case c_warn: return 'warn';
        default: return `unknown(${type})`;
    }
}

export function exceptionIsBackpressureStop(e: Error) {
    return (e['backpressure_stop'] || e['is_backpressure_stop']);
}