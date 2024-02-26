
export class MultiMap<K = any, V = any> {
    items = new Map<K, Array<V>>()

    add(key: K, item: V) {
        if (!this.items.has(key))
            this.items.set(key, []);
        this.items.get(key).push(item);
    }

    keyCount() {
        return this.items.size;
    }

    has(key: K) {
        return this.items.has(key);
    }

    get(key: K): Array<V> {
        return this.items.get(key) || [];
    }

    delete(key: K) {
        return this.items.delete(key);
    }

    clear() {
        this.items.clear();
    }

    updateAllItems(updateFn: (item: V) => V) {
        for (const key of this.items.keys()) {
            const list = this.items.get(key);
            for (let i = 0; i < list.length; i++) {
                list[i] = updateFn(list[i]);
            }
        }
    }

    mapItemsOnKey(indexKey: any, updateCallbackFn: (item: any) => any) {
        let itemList = this.items.get(indexKey);
        if (!itemList)
            return;

        let anyDeleted = false;
        for (let i = 0; i < itemList.length; i++) {
            const newItem = updateCallbackFn(itemList[i]);
            itemList[i] = newItem;
            if (newItem == null)
                anyDeleted = true;
        }

        if (anyDeleted) {
            itemList = itemList.filter(item => item != null);
            this.items.set(indexKey, itemList);
        }
    }

    filterItemsOnKey(key: K, filter: (item: V) => boolean) {
        if (!this.items.has(key))
            return;

        let filtered = this.items.get(key).filter(filter);

        if (filtered.length === 0) {
            this.items.delete(key);
        } else {
            this.items.set(key, filtered);
        }
    }

    keys() {
        return this.items.keys();
    }

    *entries() {
        for (const [key,list] of this.items.entries()) {
            if (list == null)
                continue;
            for (const item of list)
                yield [key,item]
        }
    }

    *values() {
        for (const [key,list] of this.items.entries())
            yield* list;
    }

    valueCount() {
        let count = 0;
        for (const [key,list] of this.items.entries())
            count += list.length;
        return count;
    }
}
