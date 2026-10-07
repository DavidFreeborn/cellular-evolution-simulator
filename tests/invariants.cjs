const assert = require('node:assert/strict');

function checkWorld(w) {
    const counts=new Int32Array(10),photos=new Int16Array(w.size*w.size),owners=new Int32Array(w.size*w.size).fill(-1),species=new Map();let energy=0;
    for(const o of w.organisms.values()) {
        assert.ok(Number.isFinite(o.energy)&&o.energy>0);assert.ok(o.ts.length>=4&&o.ts.length<=40);assert.ok(w.isContiguous(o.xs,o.ys));
        assert.equal(new Set(o.cellIds).size,o.ts.length);assert.equal(o.brain.din,1+o.typeCounts[5]*4+o.typeCounts[2]*8);assert.equal(o.brain.dout,1+o.typeCounts[8]+(o.typeCounts[1]?4:0));
        energy+=o.energy;species.set(o.getSignature(),(species.get(o.getSignature())||0)+1);
        o.ts.forEach((t,i)=>{const idx=w.getIdx(o.xs[i],o.ys[i]);assert.equal(owners[idx],-1);owners[idx]=o.id;counts[t]++;assert.equal(w.ctype[idx],t);
            if(t===6)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)photos[w.getIdx(w.wrap(o.xs[i]+dx),w.wrap(o.ys[i]+dy))]++;
        });
    }
    assert.deepEqual(w.owner,owners);assert.deepEqual(w.runningCellCounts,counts);assert.deepEqual(w.photoNeighborCounts,photos);assert.deepEqual(w.runningSpeciesCounts,species);assert.ok(Math.abs(w.runningTotalEnergy-energy)<.00001);
    assert.equal(w.ctype.filter(v=>v===9).length,w.corpseTracker.corpses.size);
}
module.exports = { checkWorld };
