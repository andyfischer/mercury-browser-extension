/*
 * UrlBase
 *
 * Helper class for remapping original assert URLs onto a new base URL.
 */

import { Location } from './Location'

export class UrlBase {
    location: Location
    base: string

    constructor(location: Location) {
        this.location = location;
        this.base = `${location.protocol}//${location.hostname}/`;
    }

    isOnRoot(url: string) {
        return url.startsWith(this.base);
    }

    /*
     * Fix a URL to have the correct protocol and href;
     */
    getFixedUrl(url: string) {
        if (!url)
            return url;

        if (url.indexOf('://') !== -1 || url.startsWith('data:')) {
            // URL is already fine.
            return url;
        }

        if (url.startsWith('//')) {
            // Just needs protocol.
            return this.location.protocol + url;
        }

        const fixed = new URL(url, this.base);
        return fixed.href;
    }
}
