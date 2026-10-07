const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SimulationClock } = require('../js/simulation-clock.js');
test('delayed background heartbeats execute the same number of steps as foreground time', () => {
    const normal = new SimulationClock(), delayed = new SimulationClock();
    normal.start(0, 15); delayed.start(0, 15);
    let count = 0;
    for (let time = 50; time <= 10000; time += 50) { normal.accrue(time); count += normal.take(128); }
    delayed.accrue(10000);
    assert.equal(delayed.take(128) + delayed.take(128), count);
    assert.equal(count, 150);
});
test('work budgets retain rather than discard delayed steps', () => {
    const clock = new SimulationClock(); clock.start(0, 128); clock.accrue(1000);
    assert.equal(clock.take(8), 8); assert.equal(clock.take(1000), 120);
    assert.equal(clock.take(1), 0);
});
test('speed changes account for old and new rates; pause does not accrue time', () => {
    const clock = new SimulationClock(); clock.start(0, 10);
    clock.setRate(1000, 20); clock.accrue(2000); assert.equal(clock.take(100), 30);
    clock.stop(); clock.accrue(100000); assert.equal(clock.take(100), 0);
    clock.start(100000, 20); clock.accrue(100050); assert.equal(clock.take(100), 1);
});
