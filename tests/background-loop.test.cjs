const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
    let now = 0, nextFrame = 0;
    const frames = new Map(), listeners = {}, workers = [], intervals = new Map();
    const button = { textContent: 'Start' };
    const simulator = { running: false, speed: 15, ticks: 0, renders: 0,
        stepBatch(count) { this.ticks += count; if (!context.document.hidden) this.render(); },
        updateStats() {}, render() { this.renders++; }, init() { this.ticks = 0; } };
    class Worker {
        constructor() { this.terminated = false; workers.push(this); }
        postMessage(message) { this.message = message; }
        terminate() { this.terminated = true; }
        pulse() { if (!this.terminated) this.onmessage(); }
    }
    const context = vm.createContext({ simulator, animationId: null, Worker,
        performance: { now: () => now },
        document: { hidden: false, getElementById: () => button,
            addEventListener: (name, fn) => { listeners[name] = fn; } },
        requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
        cancelAnimationFrame: id => frames.delete(id),
        setInterval: fn => { intervals.set(++nextFrame, fn); return nextFrame; },
        clearInterval: id => intervals.delete(id),
    });
    vm.runInContext(fs.readFileSync(require.resolve('../js/simulation-clock.js'), 'utf8'), context);
    const ui = fs.readFileSync(require.resolve('../js/ui.js'), 'utf8');
    vm.runInContext(ui.slice(ui.indexOf('// The simulation clock')), context);
    return { context, simulator, workers, frames, intervals,
        time: value => { now = value; },
        hide: value => { context.document.hidden = value; listeners.visibilitychange(); } };
}

test('actual UI loop continues model steps in a hidden tab without animation frames', () => {
    const h = harness(); h.context.toggleRunning(); h.hide(true);
    assert.equal(h.frames.size, 0);
    h.time(3000); h.workers[0].pulse();
    assert.equal(h.simulator.ticks, 45); assert.equal(h.simulator.renders, 0);
    h.time(4000); h.hide(false);
    assert.equal(h.simulator.ticks, 60); assert.equal(h.frames.size, 1);
    assert.ok(h.simulator.renders > 0);
});
test('pause terminates background work and resume excludes paused time', () => {
    const h = harness(); h.context.toggleRunning(); h.hide(true);
    h.time(1000); h.workers[0].pulse(); h.context.toggleRunning();
    h.time(10000); h.workers[0].pulse();
    assert.equal(h.simulator.ticks, 15); assert.equal(h.workers[0].terminated, true);
    h.context.toggleRunning(); h.time(11000); h.workers[1].pulse();
    assert.equal(h.simulator.ticks, 30);
});
test('worker failure falls back to elapsed-time accounting without duplicate timers', () => {
    const h = harness(); h.context.toggleRunning(); h.hide(true);
    h.workers[0].onerror(); assert.equal(h.intervals.size, 1);
    h.time(2000); [...h.intervals.values()][0]();
    assert.equal(h.simulator.ticks, 30);
    h.context.stopSimLoop(); assert.equal(h.intervals.size, 0);
});
test('RAF and worker pulses at the same time do not double-count model steps', () => {
    const h = harness(); h.context.toggleRunning(); h.time(1000);
    h.workers[0].pulse(); h.context.runLoop(); h.workers[0].pulse();
    assert.equal(h.simulator.ticks, 15);
});
