

export class RateTracker {
    count = 0

    startedAt: number = null
    onTrigger: () => void
    maxCount: number
    timeWindowMs: number

    constructor(maxCount: number, timeWindowMs: number, onTrigger: () => void) {
        this.onTrigger = onTrigger;
        this.startedAt = Date.now()
        this.maxCount = maxCount;
        this.timeWindowMs = timeWindowMs;
    }

    inc(n = 1) {
        this.count += n;

        if (this.count > this.maxCount) {
            const now = Date.now()
            const withinTimeThreshold = (now - this.startedAt) < this.timeWindowMs;

            if (withinTimeThreshold) {
                try {
                    this.onTrigger();
                } catch (e) {
                    console.error(e);
                }
            }

            this.startedAt = now;
            this.count = 0;
        }
    }
}
