
import { Table, Schema, compileSchema, lazySchema } from '../table'
import { Stream, StreamEvent, c_close, c_restart } from '../Stream'
import { formatItem } from '../Format'
import { callbackToStream } from '../handler/NativeCallback'
import { VerboseLogCacheActivity, VeryVerboseLogCacheActivity } from '../config'
import { CacheItemHandle } from './CacheItemHandle'
import { CacheItem } from './CacheItem'

export type RequestParams = any

export interface RequestContext {
    logSpy?: { name: string }
}

export interface HandlerItem {
    id?: string
    name?: string
    scope?: string
    callback: (params: RequestParams) => void
}

export type CacheTable = Table<CacheItem>
export type HandlerTable = Table<HandlerItem>

interface FunctionCacheOptions {
    items?: 'default'
    handlers?: 'default'
}

export const CacheItemsSchema = lazySchema({
    name: 'CacheItems',
    attrs: [
        'input_key','id auto'
    ],
    funcs: [
        'get(id)',
        'get(input_key)',
        'delete(input_key)',
        'each',
    ]
})

export const CacheHandlersSchema = lazySchema({
    name: 'CacheHandlers',
    attrs: [
        'id(auto)',
        'name'
    ],
    funcs: [
        'get(id)',
        'get(name)',
        'get(scope)',
        'each',
    ]
})

export class FunctionCache {
    items: CacheTable
    handlers: HandlerTable

    constructor(options: FunctionCacheOptions = {}) {
        this.items = CacheItemsSchema.createTable();
        this.handlers = CacheHandlersSchema.createTable();

        if (VerboseLogCacheActivity)
            console.log('created a new FunctionCache', this);
    }

    /**
     * Fetch a cache item using the request.
     *
     * May return an existing item if one exists.
     */
    getItem(params: RequestParams, context: RequestContext = {}): CacheItem {
        const input_key = formatItem(params);

        if (VeryVerboseLogCacheActivity)
            console.log('FunctionCache.getItem is looking for: ' + input_key);

        let foundEntry = this.items.get_with_input_key(input_key);

        if (foundEntry && foundEntry.expire_at) {
            if (foundEntry.expire_at < Date.now()) {
                // Existing value has expired, delete it.
                this.items.delete_with_input_key(input_key);
                foundEntry = null;

                if (VeryVerboseLogCacheActivity)
                    console.log('FunctionCache.getItem noticed that an existing item was expired for: ' + input_key);
            }
        }

        if (foundEntry) {

            if (VeryVerboseLogCacheActivity)
                console.log('FunctionCache.getItem found an existing valid entry: ' + input_key, { foundEntry });

            // Found a valid existing result.
            return foundEntry;
        }

        // Need to create a new cache item
        const item: CacheItem = new CacheItem(this.items, params, input_key);

        if (VerboseLogCacheActivity)
            console.log('FunctionCache added a new cache item: ' + item.input_key, item);

        this.items.insert(item);

        // Perform the request and listen to the output.
        this.refreshItem(item, context);

        return item;
    }

    setHandler(name: string, callback: (params: RequestParams) => any) {
        this.handlers.insert({ name, callback });
    }

    setCatchallHandler(callback: (params: RequestParams) => any) {
        const existing = this.handlers.get_with_scope('*');
        if (existing)
            throw new Error("cache already has a catch-all handler");

        this.handlers.insert({ scope: '*', callback });
    }

    findHandler(params: RequestParams): HandlerItem {
        if (params?.func) {
            const found = this.handlers.get_with_name(params.func);
            if (found)
                return found;
        }

        const catchall = this.handlers.get_with_scope('*');
        if (catchall)
            return catchall;

        return null;
    }

    refreshItem(item: CacheItem, requestContext: RequestContext = {}) {
        const handler = this.findHandler(item.params);
        if (!handler)
            throw new Error("no handler found for: " + item.input_key)

        let resultStream = new Stream();
        resultStream.setDownstreamMetadata({ name: 'FunctionCache calling refreshItem' });

        if (requestContext.logSpy) {
            resultStream = resultStream.logSpy(requestContext.logSpy);
        }

        item.setResultStream(resultStream);

        callbackToStream(() => handler.callback(item.params), resultStream)
    }

    invalidateItem(item: CacheItem) {
        if (item.liveRefCount > 0) {
            // console.log('invalidateItem refresh: ', item);
            this.refreshItem(item)
        } else {
            item.close();
        }
    }

    invalidateWithFilter(filter: (item: CacheItem) => boolean) {
        for (const item of this.items.each()) {
            if (filter(item)) {
                this.invalidateItem(item);
            }
        }
    }

    listen(params: RequestParams, once?: boolean) {
        const item = this.getItem(params);
        return this.listenToItem(item);
    }

    listenToItem(item: CacheItem) {
        if (!item)
            throw new Error("listenToItem usage error: item not found");

        const stream = new Stream();
        stream.setUpstreamMetadata({ name: 'FunctionCache listenToItem' });

        // Catch up
        for (const event of item.receivedEvents) {
            stream.receive(event);
        }

        item.listeners.add(stream);

        return stream;
    }

    newHandle() {
        return new CacheItemHandle(this);
    }
}
