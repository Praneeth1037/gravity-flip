const {test}=require('node:test');const assert=require('node:assert/strict');
const E=require('../engine.js'),S=E.SETTINGS;
function setup(kind,gravity=1,x=2100){
  const r=new E.Run(0,3);r.obstacles=[];r.collectibles=[];r.targets=[];r.nextX=1e9;
  r.distance=x-150;r.gravity=gravity;r.y=E.boundsAt(r.distance)[gravity===1?'bottom':'top'];
  const g=E.rideGeometry(kind,x),o={id:9,kind,x,width:g.width,loopRadius:g.loopRadius,terrain:true,minClearance:Infinity,awarded:false};
  r.obstacles.push(o);return {r,o};
}
function runPast(r,o){let rode=false;for(let i=0;i<20/S.fixedStep&&r.alive&&r.distance<o.x+o.width+120;i++){r.step(S.fixedStep);rode=rode||!!r.ride;}return rode;}

test('a grounded pilot boards a loop on its deck, rides all the way round and earns the bonus',()=>{
  for(const [kind,gravity] of [['loop-floor',1],['loop-ceiling',-1],['spiral-floor',1],['spiral-ceiling',-1]]){
    const {r,o}=setup(kind,gravity);const bonus=r.bonus;
    assert.ok(runPast(r,o),kind+' boarded');assert.ok(r.alive);assert.equal(r.gravity,gravity,'loops keep your deck');
    assert.equal(r.rides,1);assert.equal(r.bonus,bonus+S.rideBonus[kind.split('-')[0]]);
    assert.equal(r.y,E.boundsAt(r.distance)[gravity===1?'bottom':'top'],'lands back on the deck');
  }
});

test('the twist carries you to the opposite deck with gravity reversed, from either side',()=>{
  for(const gravity of [1,-1]){
    const {r,o}=setup('twist',gravity);assert.ok(runPast(r,o));assert.ok(r.alive);
    assert.equal(r.gravity,-gravity);assert.equal(r.y,E.boundsAt(r.distance)[gravity===1?'top':'bottom']);
  }
});

test('loops on the other deck, and airborne pilots, pass by without boarding',()=>{
  {const {r,o}=setup('loop-floor',-1);assert.ok(!runPast(r,o));assert.ok(r.alive);assert.equal(r.rides,0);}
  {const {r,o}=setup('loop-floor',1);r.distance=o.x-12;r.y=E.boundsAt(r.distance).bottom-120;r.vy=-200;assert.ok(!runPast(r,o));assert.equal(r.rides,0);}
});

test('flips are locked during a ride and the camera only moves forward',()=>{
  const {r,o}=setup('loop-floor',1);let prev=r.distance,flipsBefore=r.flips;
  for(let i=0;i<10/S.fixedStep&&r.distance<o.x+o.width+50;i++){r.step(S.fixedStep);if(r.ride)r.flip();assert.ok(r.distance>=prev-1e-9);prev=r.distance;}
  assert.equal(r.flips,flipsBefore);assert.equal(r.rides,1);
});

test('ride paths stay inside the tunnel and leave the opposite runner lane clear',()=>{
  for(const kind of ['loop-floor','loop-ceiling','spiral-floor','spiral-ceiling'])for(const x of [2100,3300,5200,8800,12100]){
    const g=E.rideGeometry(kind,x),o={kind,x,width:g.width,loopRadius:g.loopRadius},side=kind.endsWith('-floor')?'bottom':'top';
    for(const p of E.ridePath(o,side).points){
      const b=E.boundsAt(p.x),t=E.terrainAt(p.x);
      assert.ok(p.y>t.top&&p.y<t.bottom,kind+' inside the tunnel');
      // The far edge of the rail (30 px out) must stay clear of a runner on the opposite deck.
      if(side==='bottom')assert.ok(p.y-30>b.top+S.radius,kind+' clears the ceiling lane at '+x);else assert.ok(p.y+30<b.bottom-S.radius,kind+' clears the floor lane at '+x);
    }
  }
});

test('rides show up regularly once the run is under way',()=>{
  const r=new E.Run(0,11);let rides=0,count=0,gapSinceRide=0,maxGap=0;const seen=new Set();
  for(let x=0;x<40000;x+=800){r.distance=x;r.fill();for(const o of r.obstacles)if(!seen.has(o.id)){seen.add(o.id);count++;if(E.isRide(o)){rides++;gapSinceRide=0;}else if(x>4000)maxGap=Math.max(maxGap,++gapSinceRide);}}
  assert.ok(rides>=8,'rides generated: '+rides);assert.ok(maxGap<=10,'longest stretch without a ride: '+maxGap);
});
