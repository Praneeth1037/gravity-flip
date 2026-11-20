const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js'),M=require('../motion.js'),S=E.SETTINGS;
function step(r,p,n){for(let i=0;i<n;i++){r.step(S.fixedStep);M.updatePose(p,r,S.fixedStep);}}
test('ascent immediately tilts the rig and ceiling landing inverts it',()=>{
 const r=new E.Run(),p=M.createPose();r.flip();step(r,p,3);assert.ok(p.angle<-.05);assert.ok(!p.grounded);
 step(r,p,75);assert.ok(p.grounded);assert.ok(p.inversion===-1&&Math.cos(p.angle)>0);assert.equal(p.facing,1);
 r.flip();step(r,p,75);assert.ok(p.grounded);assert.equal(p.inversion,1);assert.equal(p.angle,p.slope);assert.equal(p.facing,1);
});
test('running has alternating bent legs, planted soles, and faster cadence with distance',()=>{
 const r=new E.Run(),p=M.createPose();const poses=[];
 for(let i=0;i<30;i++){step(r,p,1);const legs=[M.legPose(p,-1),M.legPose(p,1)];assert.ok(legs.some(l=>l.stance));for(const l of legs){if(l.stance)assert.equal(l.foot.y,17);assert.ok(Number.isFinite(l.knee.x));}poses.push(legs[0].foot.x);}
 assert.ok(Math.max(...poses)-Math.min(...poses)>15);
 const a=M.createPose(),b=M.createPose();r.distance=30;M.updatePose(a,r,S.fixedStep);r.distance=60;M.updatePose(b,r,S.fixedStep);assert.ok(b.phase>a.phase);
});
test('reduced motion removes stride/bob while retaining correct gravity orientation',()=>{
 const r=new E.Run(),p=M.createPose();r.gravity=-1;r.y=E.boundsAt(0).top;M.updatePose(p,r,S.fixedStep,true);assert.equal(p.phase,0);assert.equal(p.bob,0);assert.ok(p.inversion===-1&&Math.cos(p.angle)>0);
});

test('forward gaze never reverses and planted soles align with slopes on both sides',()=>{
 for(const gravity of [1,-1])for(let x=300;x<10000;x+=59){
  const r=new E.Run(),p=M.createPose();r.obstacles=[];r.distance=x;r.gravity=gravity;r.y=E.boundsAt(x)[gravity===1?'bottom':'top'];r.vy=0;
  M.updatePose(p,r,S.fixedStep);assert.ok(Math.cos(p.angle)>.6);assert.equal(p.facing,1);assert.equal(p.inversion,gravity);
  const soleY=r.y+p.anchorOffset+gravity*17/Math.cos(p.angle);
  assert.ok(Math.abs(soleY-E.terrainAt(x)[gravity===1?'bottom':'top'])<1e-8);
 }
 const r=new E.Run(),p=M.createPose();for(let i=0;i<120;i++){if(i%14===0)r.flip();step(r,p,1);assert.ok(Math.cos(p.angle)>.6,'rapid flips keep the profile facing right');}
});
