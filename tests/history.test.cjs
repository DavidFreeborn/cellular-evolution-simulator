const test=require('node:test'),assert=require('node:assert/strict');
const {load,add,withRandom,rng}=require('./helpers.cjs');
const body=[[10,10,6],[11,10,6],[10,11,6],[11,11,6]];
function setup(){const dom=new Map(),api=load({document:{hidden:false,getElementById(id){if(!dom.has(id))dom.set(id,{});return dom.get(id);}}}),sim=new api.Simulator();
    sim.world=new api.World();sim.world.onBirth=o=>sim.registerOrganism(o,sim.world.tickCount,true);
    for(const method of ['render','renderPopChart','renderDiversityChart','renderCellDistChart','updateCellDistribution','updateTopSpeciesDetail'])sim[method]=()=>{};
    return {api,sim,dom};}
test('display refresh and seeding never replay births or add elapsed ticks',()=>{
    const {api,sim,dom}=setup(),o=add(api,sim.world,body,30);api.configure({death:0,mutation:0});sim.registerOrganism(o,0);sim.collectStats();
    withRandom(rng(1),()=>sim.stepBatch(1,true));assert.equal(dom.get('stat-generation').textContent,1);assert.equal(sim.popHistory.length,2);
    const before=sim.speciesHistory.get(o.getSignature()).totalOrgs;
    for(let i=0;i<4;i++)sim.updateStats(true);
    assert.equal(sim.speciesHistory.get(o.getSignature()).totalOrgs,before);assert.equal(sim.popHistory.length,2);
    sim.spawnCustomOrganisms(2,body.map(([x,y,type])=>({x,y,type})));
    assert.equal(sim.popHistory.length,2);assert.equal(sim.speciesHistory.get(o.getSignature()).totalOrgs,before+2);assert.equal(sim.popHistory.at(-1),sim.world.organisms.size);
});
test('an organism born and dead in one tick is represented in history',()=>{
    const {api,sim}=setup(),o=add(api,sim.world,body);sim.world.tickCount=1;sim.generation=1;sim.registerOrganism(o,1,true);
    sim.world.clearCells(o.id);sim.world.subtractFromRunningTotals(o);sim.world.organisms.delete(o.id);sim.collectStats();
    const h=sim.speciesHistory.get(o.getSignature());assert.equal(h.totalOrgs,1);assert.equal(h.firstSeen,1);assert.equal(sim.extinctionHistory[0],1);
});
test('batching collects every tick but refreshes the DOM only once',()=>{
    const {api,sim}=setup();api.configure({death:0,mutation:0});const o=add(api,sim.world,body);sim.registerOrganism(o,0);sim.collectStats();let renders=0;sim.renderPopChart=()=>renders++;
    sim.stepBatch(16);assert.equal(sim.popHistory.length,17);assert.equal(sim.generation,16);assert.equal(renders,1);
});
test('historical previews unwrap both torus boundaries',()=>{
    const {api,sim}=setup(),o=add(api,sim.world,[[223,223,6],[0,223,6],[223,0,6],[0,0,6]]),b=sim.extractBodyShape(o);
    assert.equal(Math.max(...b.xs),1);assert.equal(Math.max(...b.ys),1);
});
test('cell-history compression preserves sample span and weighted average',()=>{
    const {sim}=setup();sim.maxCellDistHistoryLength=10;sim.ticksPerChunk=5;
    for(let i=0;i<30;i++){sim.generation=i;sim.world.tickCount=i;sim.collectStats();}
    const h=sim.getFullCellDistHistory();assert.equal(h.reduce((n,x)=>n+x.span,0),30);assert.equal(sim.popHistory.length,30);
});
test('drawing large histories preserves extrema, elapsed span and raw samples',()=>{
    const {sim}=setup();sim.popHistory=Array.from({length:100001},(_,i)=>i===54321?1000:2);
    const sample=sim.getFullPopulationHistory(400);
    assert.ok(sample.length<=400);assert.equal(sample.reduce((n,x)=>n+x.span,0),100001);
    assert.equal(Math.max(...sample.map(x=>x.max)),1000);assert.equal(sim.popHistory.length,100001);assert.equal(sim.popHistory[54321],1000);
    sim.extinctionHistory=[0,2,0,2];assert.deepEqual(sim.getFullExtinctionHistory(undefined,2).map(x=>x.value),[0,1,1,1]);
});
