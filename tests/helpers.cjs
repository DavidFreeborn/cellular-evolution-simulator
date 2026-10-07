const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function load({ revision, sourceRoot = root, document = {}, extras = '' } = {}) {
    const files = ['constants', 'brain', 'organism', 'corpse', 'world', 'simulator'];
    const source = files.map(name => revision
        ? execFileSync('git', ['show', `${revision}:js/${name}.js`], { cwd: root, encoding: 'utf8' })
        : fs.readFileSync(path.join(sourceRoot, 'js', `${name}.js`), 'utf8')).join('\n');
    return new Function('document', `${source}\n${extras}\nreturn {
        World, Organism, MultiLayerBrain, Simulator, calculateNNDimensions,
        configure({mutation, death, epoch} = {}) {
            if (mutation !== undefined) {
                MUT_WEIGHT_SIGMA = mutation; MUT_ADD_CELL_P = mutation;
                MUT_DEL_CELL_P = mutation * .8; MUT_SWAP_CELL_P = mutation * .8; MUT_JIGGLE_CELL_P = mutation * .6;
            }
            if (death !== undefined) RANDOM_DEATH_PROB = death;
            if (epoch !== undefined) REFUGIA_PHASE_TICKS = epoch;
        }
    };`)(document);
}
function rng(seed) {
    return () => {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function withRandom(random, fn) {
    const original = Math.random;
    Math.random = random;
    try { return fn(); } finally { Math.random = original; }
}
function dimensions(api, types, ids) {
    const counts = new Int32Array(10);
    for (const type of types) counts[type]++;
    return api.calculateNNDimensions(counts, types, ids);
}
function brain(api, types, hidden = [], ids) {
    const dims = dimensions(api, types, ids);
    return new api.MultiLayerBrain(dims.inputs, hidden, dims.outputs).setIOLayout(dims);
}
function add(api, world, body, energy = 25, hidden = []) {
    const xs = body.map(c => world.wrap(c[0]));
    const ys = body.map(c => world.wrap(c[1]));
    const ts = body.map(c => c[2]);
    const id = world.nextId++;
    const org = new api.Organism(id, xs, ys, ts, energy, brain(api, ts, hidden), 0);
    if (!world.placeCells(id, xs, ys, ts)) throw new Error('Fixture collision');
    world.initCaches(org);
    world.organisms.set(id, org);
    world.addToRunningTotals(org);
    return org;
}
const stats = () => ({ births: 0, deaths: 0, predations: 0, predatorSignatures: [], birthSignatures: [] });

module.exports = { load, rng, withRandom, dimensions, brain, add, stats, root };
