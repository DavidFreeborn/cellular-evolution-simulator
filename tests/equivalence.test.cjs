const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {load,add,rng,withRandom,root}=require('./helpers.cjs');
test('optimised noses match the original directional equations in every facing and across seams',()=>{
    const api=load(),w=new api.World(32);const random=rng(1234);
    for(let i=0;i<w.ctype.length;i++)w.ctype[i]=random()<.3?9:0;
    const o=add(api,w,[[31,31,5],[0,31,6],[31,0,6],[0,0,6]]);
    const xx=[1,0,-1,0],xy=[0,-1,0,1],yx=[0,1,0,-1],yy=[1,0,-1,0];
    for(let facing=0;facing<4;facing++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){
        o.facing=facing;const expected=new Float32Array(4),totals=[0,0,0,0];
        for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
            if(!ox&&!oy)continue;let idx=w.getIdx(w.wrap(x+ox*xx[facing]+oy*xy[facing]),w.wrap(y+ox*yx[facing]+oy*yy[facing]));
            const occupied=!o.occupiedSet.has(idx)&&w.ctype[idx]!==0,mask=[oy<0&&ox<=1,ox>0&&oy<=1,oy>0&&ox>=-1,ox<0&&oy>=-1];
            mask.forEach((included,i)=>{if(included){totals[i]++;if(occupied)expected[i]++;}});
        }
        expected.forEach((v,i)=>{expected[i]=v/totals[i];});const actual=new Float32Array(4);w.senseNoseInto(o,x,y,o.occupiedSet,actual,0);assert.deepEqual(actual,expected);
    }
});
test('reused movement buffers preserve bodies across blocked and successful moves and rotations',()=>{
    const api=load(),w=new api.World(32),o=add(api,w,[[31,31,1],[0,31,6],[31,0,6],[0,0,6]]);
    withRandom(rng(8),()=>{for(let i=0;i<1000;i++){
        const success=i%2?w.tryShiftOrg(o,1,0):w.tryRotateOrg(o,true);
        assert.equal(success,true);assert.equal(new Set(o.xs.map((x,j)=>w.getIdx(x,o.ys[j]))).size,4);
        for(let j=0;j<o.xs.length;j++)assert.equal(w.owner[w.getIdx(o.xs[j],o.ys[j])],o.id);
    }});
    const x=w.wrap(o.xs[0]+1),y=o.ys[0];
    const idx=w.getIdx(x,y),oldOwner=w.owner[idx];w.owner[idx]=999;
    const beforeX=o.xs.slice(),beforeY=o.ys.slice();assert.equal(w.tryShiftOrg(o,1,0),false);
    assert.deepEqual(o.xs,beforeX);assert.deepEqual(o.ys,beforeY);w.owner[idx]=oldOwner;
});
function clockFixture(speed){const sim={speed,steps:0,stepBatch(n){this.steps+=n;}};
    const doc={addEventListener(){}};const source=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
    const clock=new Function('document','simulator','CELL_PHOTO',source+'\nreturn {advanceSimulationClock};')(doc,sim,6);
    return {sim,...clock};
}
test('foreground and background clocks honour 128 ticks/sec and bound catch-up work',()=>{
    for(const dt of [25,1000/60]){const f=clockFixture(128);f.advanceSimulationClock(1000);
        for(let i=1;i<=Math.round(1000/dt);i++)f.advanceSimulationClock(1000+i*dt);
        assert.ok(Math.abs(f.sim.steps-128)<=1);
        const before=f.sim.steps;f.advanceSimulationClock(3600000);assert.ok(f.sim.steps-before<=8);
    }
});
