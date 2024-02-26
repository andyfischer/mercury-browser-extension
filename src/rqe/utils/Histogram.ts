
export class Histogram<K = string> {
    values = new Map<K, number>()
    total = 0

    has(key: K) {
        return this.values.has(key);
    }

    get(key: K) {
        return this.values.get(key);
    }

    init(key: K) {
        if (!this.values.has(key))
            this.values.set(key, 0);
    }

    increment(key: K, count: number = 1) {
        this.total += count;
        if (this.values.has(key))
            this.values.set(key, this.values.get(key) + count);
        else
            this.values.set(key, count);
    }

    entries() {
        return this.values.entries();
    }
}
