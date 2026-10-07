// Fixed workloads isolate throughput from evolutionary changes in population size.
const { performance } = require('node:perf_hooks');
const { load, rng, withRandom, add, stats } = require('../tests/helpers.cjs');
const sourceRoot = process.argv[2] === '--source-root' ? process.argv[3] : undefined;
const revision = sourceRoot ? undefined : process.argv[2] || undefined;
const results = [];
for (const scenario of ['passive', 'sensory', 'clone']) {
    const times = [];
    for (let repeat = 0; repeat < 5; repeat++) {
        const api = load({ revision, sourceRoot });
        api.configure({ death: 0 });
        withRandom(rng(123), () => {
            const world = new api.World();
            if (scenario === 'clone') {
                const org = add(api, world, [[1,1,1],[2,1,2],[1,2,5],[2,2,6]], 25, [8,8]);
                for (let i = 0; i < 1000; i++) org.brain.cloneMutate();
                const start = performance.now();
                for (let i = 0; i < 20000; i++) org.brain.cloneMutate();
                times.push(performance.now() - start);
            } else {
                const sensory = scenario === 'sensory';
                for (let y = 2; y < 224; y += 5) for (let x = 2; x < 224; x += 5) {
                    const body = [[x,y,6],[x+1,y,6],[x,y+1,6],[x+1,y+1,6]];
                    if (sensory) body.push([x+2,y,2],[x+2,y+1,5],[x+1,y+2,8]);
                    const org = add(api, world, body, 25, sensory ? [4] : []);
                    // No muscles or teeth; births disabled by pop cap. Fixed population.
                    org.brain.layers.at(-1).biases[0] = -.5;
                }
                const cap = world.organisms.size, counters = stats();
                for (let i = 0; i < 100; i++) world.tick(cap, counters);
                const start = performance.now();
                for (let i = 0; i < 1000; i++) world.tick(cap, counters);
                times.push(performance.now() - start);
                if (world.organisms.size !== cap) throw new Error('Workload population changed');
            }
        });
    }
    times.sort((a,b) => a-b);
    results.push({scenario, medianMs:times[2], minMs:times[0], maxMs:times[4], samples:times});
}
console.log(JSON.stringify({revision:revision || sourceRoot || 'working tree', node:process.version, results}, null, 2));
