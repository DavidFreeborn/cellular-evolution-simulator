// Compare preparation cost and drawing object count for a long population history.
const { performance } = require('node:perf_hooks');
const { load } = require('../tests/helpers.cjs');
const sourceRoot = process.argv[2] === '--source-root' ? process.argv[3] : undefined;
const revision = sourceRoot ? undefined : process.argv[2] || undefined;
const { Simulator } = load({ revision, sourceRoot });
const sim = new Simulator();
sim.popHistory = Array.from({ length: 1000001 }, (_, i) => i === 543210 ? 10000 : i % 100);
const samples = [];
let series;
for (let repeat = 0; repeat < 6; repeat++) {
    const start = performance.now();
    series = sim.getFullPopulationHistory(1600);
    const elapsed = performance.now() - start;
    if (repeat > 0) samples.push(elapsed);
}
samples.sort((a,b) => a-b);
console.log(JSON.stringify({ revision: revision || sourceRoot || 'working tree', samples,
    medianMs: samples[2], rawSamples: sim.popHistory.length, drawingPoints: series.length }, null, 2));
