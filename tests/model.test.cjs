const { checkWorld } = require('./invariants.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, rng, withRandom, dimensions, brain, add, stats } = require('./helpers.cjs');
const square = (x=10,y=10,ts=[6,6,6,6]) => [[x,y,ts[0]],[x+1,y,ts[1]],[x,y+1,ts[2]],[x+1,y+1,ts[3]]];
const line = (x,ts) => ts.map((t,i)=>[x,10+i,t]);
function approximately(a,b,tolerance=1e-6) { assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`); }

test('semantic input and output mappings survive resize, with and without hidden layers',()=>{
    for(const hidden of [[],[3],[3,2]]) {
        const a=load(), b=brain(a,[2,1,8,6],hidden,[10,11,12,13]);
        b.layers[0].weights.forEach((_, i, weights) => { weights[i] = (i + 1) / 1024; });
        b.layers.at(-1).biases.set([.1,.2,.3,.4,.5,.6]);
        const d=dimensions(a,[5,2,1,8,8,6],[14,10,11,15,12,13]);
        const c=a.MultiLayerBrain.resizeIO(b,d);
        const outputPairs = hidden.length ? Array.from({length:hidden[0]}, (_,i)=>[i,i]) : [[0,0],[1,2],[2,3],[3,4],[4,5],[5,6]];
        for (const [oldInput, newInput] of [[0,0], ...Array.from({length:8}, (_,i)=>[i+1,i+5])]) {
            for (const [oldOutput, newOutput] of outputPairs) {
                assert.equal(c.layers[0].weights[newInput*c.layers[0].size+newOutput],
                    b.layers[0].weights[oldInput*b.layers[0].size+oldOutput]);
            }
        }
        approximately(c.layers.at(-1).biases[2],.2); // same emitter moved to second slot
        approximately(c.layers.at(-1).biases[3],.3); // forward shifted with emitter count
        assert.ok(c.layers[0].weights.slice(c.layers[0].size,5*c.layers[0].size).some(v=>v!==0));
        assert.equal(b.din,9); assert.equal(b.dout,6);
    }
});
test('deleting the first sensor preserves the second sensor, not the old first channel',()=>{
    const a=load(), b=brain(a,[2,2,6,6],[],[10,11,12,13]);
    b.layers[0].weights.fill(0);b.layers[0].weights[1]=.1;b.layers[0].weights[9]=.75;
    const c=a.MultiLayerBrain.resizeIO(b,dimensions(a,[2,6,6,6],[11,12,13,14]));
    assert.equal(c.layers[0].weights[1],.75);
});
test('replacement of a sensor with equal dimensions is detected by identity',()=>{
    const a=load(), before=dimensions(a,[2,6,6,6],[1,2,3,4]), after=dimensions(a,[2,6,6,6],[5,2,3,4]);
    assert.equal(a.MultiLayerBrain.sameIOLayout(before,after),false);
});

test('reproduction remaps equal-sized sensor sets by inherited cell identity', () => {
    const api = load();
    api.configure({ mutation: 0 });
    const world = new api.World();
    const parent = add(api, world, square(10, 10, [2, 2, 6, 6]), 30);
    parent.brain.layers[0].weights.fill(0);
    parent.brain.layers[0].weights[1] = .125;
    parent.brain.layers[0].weights[9] = .75;
    world.mutateBody = (xs, ys, ts, ids) => [xs, ys, ts, [ids[1], 4, ids[2], ids[3]]];
    withRandom(rng(5), () => assert.ok(world.tryReproduce(parent, 0, stats())));
    const child = [...world.organisms.values()][1];
    assert.equal(child.brain.layers[0].weights[1], .75);
    assert.notEqual(child.brain.layers[0].weights[9], .75);
    assert.equal(parent.brain.layers[0].weights[1], .125);
});
test('zero mutation copies parameters exactly and independently',()=>{
    const a=load();a.configure({mutation:0});
    withRandom(rng(43),()=>{for(const hidden of [[],[2],[2,3]]) {
        const b=brain(a,[2,1,6,6],hidden);
        for(let n=0;n<100;n++) {const c=b.cloneMutate();assert.deepEqual(c.hiddenSizes,b.hiddenSizes);
            c.layers.forEach((l,i)=>{assert.deepEqual(l.weights,b.layers[i].weights);assert.deepEqual(l.biases,b.layers[i].biases);assert.notEqual(l.weights,b.layers[i].weights);});}
    }});
});
test('removing a hidden layer preserves downstream outputs and supports removing the last layer',()=>{
    const a=load(),b=brain(a,[1,3,6,6],[2,3]);b.layers.at(-1).biases.fill(.9);
    const c=b.removeHiddenLayer(0);assert.deepEqual(c.layers.at(-1).weights,b.layers.at(-1).weights);assert.deepEqual(c.layers.at(-1).biases,b.layers.at(-1).biases);
    const d=c.removeHiddenLayer(0);assert.deepEqual(d.hiddenSizes,[]);assert.equal(d.forward([.3]).length,5);assert.ok(d.forward([.3]).every(Number.isFinite));
});
test('passive fast evaluation is exact around the reproduction threshold',()=>{
    const a=load();for(const hidden of [[],[3]]) {const b=brain(a,[6,6,6,6],hidden);
        for(let i=0;i<=2000;i++){const v=Math.fround(i/2000);assert.equal(b.getEnergyOnlyReproduce(v),b.forward(new Float32Array([v]))[0]);}}
    const w=new a.World(),o=add(a,w,square());assert.equal(o.energyOnlyPassive,true);
});
test('dead attackers cannot kill or add phantom energy',()=>{
    const a=load(),w=new a.World(),s=stats(),aa=add(a,w,line(10,[3,6,6,6]),10),b=add(a,w,line(11,[3,6,6,6]),10),c=add(a,w,line(12,[6,6,6,6]),10);
    withRandom(()=>0,()=>w.autoBiteContact(s,[aa,b,c]));
    assert.deepEqual([...w.organisms.keys()],[aa.id,c.id]);assert.equal(s.predations,1);approximately(w.runningTotalEnergy,aa.energy+c.energy);
    assert.equal(w.consumeBiteTarget(b,12,10,s),false);
});
test('contact fights have no permanent insertion-order winner',()=>{
    const wins=new Set();for(let seed=1;seed<25;seed++)withRandom(rng(seed),()=>{
        const a=load(),w=new a.World();add(a,w,line(10,[3,6,6,6]));add(a,w,line(11,[3,6,6,6]));w.autoBiteContact(stats());assert.equal(w.organisms.size,1);wins.add([...w.organisms.keys()][0]);
    });assert.equal(wins.size,2);
});
test('whole-organism predation and shield-contact immunity remain unchanged',()=>{
    const a=load(),w=new a.World(),o=add(a,w,line(10,[3,6,6,6])),v=add(a,w,line(11,[6,...Array(39).fill(7)]));
    assert.equal(w.consumeBiteTarget(o,11,11,stats()),false);
    assert.equal(w.consumeBiteTarget(o,11,10,stats()),true);assert.equal(w.organisms.has(v.id),false);assert.equal(o._digestCooldown,8);
});
test('birth charges child construction and its reserve, conserving declared energy',()=>{
    const a=load();a.configure({mutation:0});const w=new a.World(),p=add(a,w,square(),30),before=p.energy+12;
    w.mutateBody=(xs,ys,ts,ids)=>[[...xs,xs[1]+1],[...ys,ys[1]],[...ts,6],[...ids,4]];
    assert.ok(w.tryReproduce(p,0,stats()));const c=[...w.organisms.values()][1];
    assert.equal(c.xs.length,5);assert.equal(c.energy,12);assert.equal(p.energy,3);
    assert.equal(before,p.energy+c.energy+3*(p.ts.length+c.ts.length));
});
test('unaffordable mutation and blocked reproduction leave all state intact',()=>{
    const a=load();a.configure({mutation:0});const w=new a.World(),p=add(a,w,square(),23);
    const owners=w.owner.slice(),cells=w.ctype.slice();assert.equal(w.tryReproduce(p,0,stats()),false);
    assert.deepEqual(w.owner,owners);assert.deepEqual(w.ctype,cells);assert.equal(p.energy,23);
    p.energy=30;w.canPlaceCells=()=>false;assert.equal(w.tryReproduce(p,0,stats()),false);assert.equal(p.energy,30);assert.deepEqual(w.owner,owners);
});
test('mutation always returns a unique contiguous viable body and matching cell identities',()=>{
    const a=load();a.configure({mutation:.25});const w=new a.World();
    withRandom(rng(88),()=>{let body=[[0,1,0,1],[0,0,1,1],[6,6,6,6],[0,1,2,3]];
        for(let i=0;i<3000;i++){body=w.mutateBody(...body);assert.ok(body[0].length>=4&&body[0].length<=40);assert.equal(w.isContiguous(body[0],body[1]),true);assert.equal(new Set(body[3]).size,body[0].length);}
    });
});
test('overwriting decay on placement, translation and rotation clears corpse tracking',()=>{
    const a=load(),w=new a.World();const idx=w.getIdx(10,10);w.ctype[idx]=9;w.corpseTracker.addCorpse(idx);
    const o=add(a,w,square());assert.equal(w.corpseTracker.corpses.size,0);
    const target=w.getIdx(12,10);w.ctype[target]=9;w.corpseTracker.addCorpse(target);assert.ok(w.tryShiftOrg(o,1,0));assert.equal(w.corpseTracker.corpses.size,0);
    assert.ok(w.tryRotateOrg(o,true));
});
test('extinction does not stop the world clock, light phases or corpse expiry',()=>{
    const a=load();a.configure({epoch:10});const w=new a.World();w.setSunlightMode('refugia');w.ctype[0]=9;w.corpseTracker.addCorpse(0);
    for(let i=0;i<30;i++)w.tick(0,stats());assert.equal(w.tickCount,30);assert.equal(w._sunlightPhase,3);assert.equal(w.corpseTracker.corpses.size,0);assert.equal(w.ctype[0],0);
});
test('designer rejects invalid shapes and seeds mobile brains with usable outputs',()=>{
    const a=load(),w=new a.World();assert.equal(w.spawnFromTemplate([{x:0,y:0,type:6}]),null);
    assert.equal(w.spawnFromTemplate(Array.from({length:4},()=>({x:0,y:0,type:6}))),null);
    const id=w.spawnFromTemplate(square(0,0,[1,3,6,6]).map(([x,y,type])=>({x,y,type}))),o=w.organisms.get(id);
    assert.equal(o.energy,30);assert.ok(o.brain.forward(w.sense(o))[1]>.3);
});
test('signals use the full range and sensing is simultaneous',()=>{
    const a=load();a.configure({death:0,mutation:0});const w=new a.World();
    const o=add(a,w,square(10,10,[8,6,6,6]));o.brain.layers[0].weights.fill(0);o.brain.layers[0].biases.set([-10,100]);
    const observed=[];const original=w.sense.bind(w);w.sense=org=>{observed.push(o.emitSignals[0]);return original(org);};
    const p=add(a,w,square(20,20,[2,6,6,6]));w.tick(2,stats());assert.ok(observed.every(v=>v===.5));assert.equal(o.emitSignals[0],1);
    o.brain.layers[0].biases[1]=-100;w.tick(2,stats());assert.equal(o.emitSignals[0],0);assert.ok(w.organisms.has(p.id));
});

test('long-run world invariants hold in all sunlight modes and at high mutation',()=>{
    for(const mode of ['default','central','refugia'])withRandom(rng(712),()=>{
        const a=load();a.configure({epoch:100,mutation:.1});const w=new a.World();w.setSunlightMode(mode);w.seedRandomOrganisms(30);const s=stats();
        for(let t=0;t<1200;t++){w.tick(0,s);if(t%100===0)checkWorld(w);}checkWorld(w);
    });
});

test('mixed mobile populations remain consistent under sustained mutation and reseeding', () => {
    let births = 0, predations = 0;
    for (const mode of ['default', 'central', 'refugia']) withRandom(rng(932), () => {
        const api = load();
        api.configure({ epoch: 100, mutation: .25, death: .01 });
        const world = new api.World(32), counters = stats();
        world.setSunlightMode(mode);
        const template = [[0,0,1], [1,0,3], [2,0,2], [0,1,5], [1,1,8], [2,1,6], [0,2,6], [1,2,6], [2,2,6]]
            .map(([x,y,type]) => ({x,y,type}));
        for (let tick = 0; tick < 1500; tick++) {
            if (tick % 50 === 0) {
                for (let i = 0; i < 8; i++) world.spawnFromTemplate(template);
                world.seedRandomOrganisms(8);
            }
            world.tick(100, counters);
            if (tick % 10 === 0) checkWorld(world);
        }
        checkWorld(world);
        births += counters.births;
        predations += counters.predations;
    });
    assert.ok(births > 100);
    assert.ok(predations > 100);
});
