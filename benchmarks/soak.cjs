// Seeded integration runs on the current source, with source hashes in the output.
// node benchmarks/soak.cjs [ticks=5000] [seed=1]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { load, rng, withRandom, stats, root } = require('../tests/helpers.cjs');
const { checkWorld } = require('../tests/invariants.cjs');
const ticks = Number(process.argv[2] || 5000);
const seed = Number(process.argv[3] || 1);
const hashes = Object.fromEntries(['constants', 'brain', 'organism', 'corpse', 'world', 'simulator'].map(name =>
    [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'js', `${name}.js`))).digest('hex')]));
const runs = [];
for (const mode of ['default', 'central', 'refugia']) {
    withRandom(rng(seed), () => {
        const api = load(), world = new api.World(), counters = stats();
        world.setSunlightMode(mode);
        world.seedRandomOrganisms(30);
        // These detailed event arrays belong to the UI; avoid retaining them in a headless run.
        delete counters.birthSignatures;
        delete counters.predatorSignatures;
        const snapshots = [];
        let checks = 0, maxEnergyDrift = 0, ghostKills = 0;
        const bite = world.tryContactBite.bind(world);
        world.tryContactBite = (org, ...args) => {
            const live = world.organisms.get(org.id) === org;
            const result = bite(org, ...args);
            if (!live && result) ghostKills++;
            return result;
        };
        const start = Date.now();
        for (let tick = 1; tick <= ticks; tick++) {
            world.tick(0, counters);
            if (tick % 100 === 0 || tick === ticks) {
                checkWorld(world);
                checks++;
                let energy = 0, cells = 0, sensoryMovers = 0, hidden = 0;
                for (const org of world.organisms.values()) {
                    energy += org.energy;
                    cells += org.ts.length;
                    sensoryMovers += !!(org.muscleCount && (org.typeCounts[2] || org.typeCounts[5]));
                    hidden += org.brain.hiddenSizes.length > 0;
                }
                maxEnergyDrift = Math.max(maxEnergyDrift, Math.abs(world.runningTotalEnergy - energy));
                if (tick % 1000 === 0 || tick === ticks) snapshots.push({ tick, population: world.organisms.size,
                    meanSize: cells / (world.organisms.size || 1), sensoryMovers, hidden });
            }
        }
        runs.push({ mode, seed, ticks, checks, ghostKills, maxEnergyDrift, ...counters,
            elapsedSeconds: (Date.now() - start) / 1000, snapshots });
    });
}
console.log(JSON.stringify({ node: process.version, hashes, runs }, null, 2));
