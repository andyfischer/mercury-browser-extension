import { Stream, c_close } from "../Stream";
import { RequestContext } from "./FunctionCache";
import { VeryVerboseLogCacheActivity } from '../config'
import { FunctionCache } from './FunctionCache'
import { CacheItem } from "./CacheItem";

/*
 * Helper object to manage usage of a cache-based value.
 *
 * Notes: This object is optimized for use as a React hook.
 *
 * Responsibilities:
 *  - Initial item can be fetched synchronously (intended to be called in useState)
 *  - Listening is started as a separate step (intended to be started and cleaned up
 *    in useEffect)
 *  - Refresh() function will check for differences in the request data, and if it
 *    changes, then a different cache item is requested. (intended to be triggered
 *    during React render)
 */


type CacheRequest = any

export class CacheItemHandle {
    cache: FunctionCache
    currentCacheItem: CacheItem
    hasClosed: boolean = false

    // Stream listening to the current cache item.
    currentCacheItemListener: Stream

    // Stream sent to the handle user, includes any changes. This stream lasts for the lifespan
    // of the handle.
    updateStream: Stream

    constructor(cache: FunctionCache) {
        this.cache = cache;
    }

    refresh(req: CacheRequest, context: RequestContext = {}) {
        if (this.hasClosed)
            throw new Error("CacheItemHandle usage error: .refresh called after .close");

        if (VeryVerboseLogCacheActivity) {
            console.log('Cache refresh for: ', req);
        }

        const cacheItem = this.cache.getItem(req, context);

        if (this.currentCacheItem && (this.currentCacheItem.id == cacheItem.id)) {
            if (VeryVerboseLogCacheActivity)
                console.log('No change on refresh for: ', { req, current: this.currentCacheItem, latest: cacheItem });
            return;
        }

        if (VeryVerboseLogCacheActivity)
            console.log('Cache item has changed on refresh for: ', req);

        if (this.isListening()) {
            this._closeListener();
        }

        this.currentCacheItem = cacheItem;

        if (this.isListening()) {
            this._openListener();
        }
    }

    isListening() {
        return this.updateStream != null;
    }

    startListening() {
        if (!this.currentCacheItem)
            throw new Error("CacheItemHandle usage error: call .refresh before .startListening");

        if (this.hasClosed)
            throw new Error("CacheItemHandle usage error: .startListening called after .close");

        if (this.updateStream)
            // Already listening
            return this.updateStream;

        this.updateStream = new Stream();
        this.updateStream.setUpstreamMetadata({ name: 'CacheItemHandle updateStream' });

        this._openListener();

        return this.updateStream;
    }

    _openListener() {
        if (this.currentCacheItemListener)
            throw new Error("CacheItemHandle error: already have a listener in _openListener");

        this.currentCacheItemListener = this.cache.listenToItem(this.currentCacheItem);
        this.currentCacheItemListener.setDownstreamMetadata({name:"CacheItemHandle listening to currentCacheItem"});

        this.currentCacheItem.incRef();

        this.currentCacheItemListener.sendTo(evt => {
            if (evt.t === c_close) {
                // Keep the .updateStream open until .close() is called on this handle.
                return;
            }

            if (VeryVerboseLogCacheActivity)
                console.log('CacheItemHandle sending event to updateStream: ', evt);

            this.updateStream.receive(evt);
        });
    }

    _closeListener() {
        if (this.currentCacheItemListener) {
            this.currentCacheItemListener.closeByDownstream();
            this.currentCacheItemListener = null;

            this.currentCacheItem.decRef();

            this.updateStream.putRestart();
        }
    }

    close() {
        if (this.hasClosed)
            throw new Error("CacheItemHandle usage error: .close called twice");

        this._closeListener();
        this.currentCacheItem = null;
        this.updateStream.close();
        this.updateStream = null;
    }
}

