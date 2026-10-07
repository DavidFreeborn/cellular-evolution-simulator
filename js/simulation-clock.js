// Accumulate simulation work from elapsed time, independently of render callbacks.
// A delayed heartbeat retains its work; it never advances the generation counter
// without executing the corresponding model steps.
class SimulationClock {
    constructor() { this.running = false; this.last = 0; this.rate = 0; this.pending = 0; }
    start(now, rate) { this.running = true; this.last = now; this.rate = rate; this.pending = 0; }
    accrue(now) {
        if (!this.running) return;
        this.pending += Math.max(0, now - this.last) * this.rate / 1000;
        this.last = now;
    }
    setRate(now, rate) { this.accrue(now); this.rate = rate; }
    take(limit) {
        if (!this.running) return 0;
        const count = Math.min(limit, Math.floor(this.pending + 1e-9));
        this.pending = Math.max(0, this.pending - count);
        return count;
    }
    stop() { this.running = false; this.pending = 0; }
}
if (typeof module !== 'undefined') module.exports = { SimulationClock };
