const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js'),S=E.SETTINGS;
const advance=(r,seconds)=>{for(let t=0;t<seconds-1e-8;t+=S.fixedStep)r.step(S.fixedStep);};
test('both surfaces safely clamp the circular hitbox; reversing momentum is immediate',()=>{
 const r=new E.Run();advance(r,.2);assert.equal(r.y,E.boundsAt(r.distance).bottom);assert.equal(r.vy,0);
 r.flip();assert.equal(r.vy,-S.flipImpulse);advance(r,.12);assert.ok(r.vy<0);r.flip();assert.ok(r.vy>0);advance(r,.5);assert.equal(r.y,E.boundsAt(r.distance).bottom);
 r.flip();advance(r,E.crossTime()+.05);assert.equal(r.y,E.boundsAt(r.distance).top);assert.equal(r.vy,0);assert.ok(r.alive);
});
test('fixed stepping produces identical motion at 30, 60, 120 and 144 FPS',()=>{
 function simulate(fps){const r=new E.Run();r.flip();let a=0;for(let i=0;i<fps*3;i++){a+=1/fps;while(a+1e-10>=S.fixedStep){r.step(S.fixedStep);a-=S.fixedStep;}}return [r.distance,r.y,r.vy,r.alive];}
 for(const fps of [30,120,144])assert.deepEqual(simulate(fps),simulate(60));
});
test('actual spike geometry detects contact but permits clear space beside the tip',()=>{
 const o={kind:'floor',x:100,width:90,height:70};
 assert.ok(E.clearance(o,115,430,0)<0);assert.ok(E.clearance(o,100,420,0)>0);
 const r=new E.Run();advance(r,5);assert.equal(r.alive,false);assert.equal(r.drainEvents().filter(e=>e.type==='crash').length,1);
 const c={kind:'ceiling',x:100,width:90,height:70};assert.ok(E.clearance(c,115,170,0)<0);
 const m={kind:'moving',x:100,width:52,radius:26,phase:0};assert.ok(E.clearance(m,126,300,0)<0);assert.ok(E.clearance(m,126,S.floor-S.radius,0)>0);
});
test('safe runway, ordered introduction, conservative spacing and narrow-screen reaction budget',()=>{
 const r=new E.Run();assert.equal(r.obstacles[0].kind,'floor');assert.equal(r.obstacles[1].kind,'ceiling');assert.ok(r.obstacles[0].x/S.baseSpeed>2.5&&r.obstacles[0].x/S.baseSpeed<3);
 assert.ok(E.minimumGap()>=S.maxSpeed*(E.crossTime()+S.reactionSeconds)+2*S.radius);
 const visibility=(S.minimumWidth*.77-30)/S.maxSpeed;assert.ok(visibility>E.crossTime()+S.reactionSeconds);
});
test('every generated sequence has a safe surface route for 5 minutes, including capped speed and movers',()=>{
 for(let seed=1;seed<=24;seed++){
 const r=new E.Run(0,seed),seen=new Set();let movers=0,maxSeen=0;
 for(let i=0;i<300/S.fixedStep&&r.alive;i++){
   const next=r.obstacles.find(o=>o.x+o.width+S.radius>=r.distance);
   for(const o of r.obstacles){if(!seen.has(o.id)){seen.add(o.id);maxSeen++;if(o.kind==='moving'){movers++;assert.ok(r.time>=S.movingAfterSeconds);}
      const j=r.obstacles.indexOf(o);if(j>0)assert.ok(o.x-(r.obstacles[j-1].x+r.obstacles[j-1].width)>=E.minimumGap());}}
   // React only once the leading edge is within the narrowest screen's visible area.
   if(next&&next.x-r.distance<300){
     const desired=E.safeGravity(next,r.gravity);
     if(r.gravity!==desired)r.flip();
   }
   r.collectibles=[]; // Fairness must not depend on shields, magnets, slow time, or rewards.
   r.step(S.fixedStep);r.drainEvents();
 }
 assert.ok(r.alive,`route crashed at ${r.time}s`);assert.equal(r.speed,S.maxSpeed);assert.ok(movers>0);assert.ok(maxSeen>100);
 }
});
test('genuine near misses award exactly once, distant passes never award',()=>{
 const r=new E.Run();r.obstacles=[{id:0,kind:'floor',x:10,width:90,height:64,minClearance:Infinity,awarded:false}];r.collectibles=[];r.nextX=1e9;
 // Maintain a deliberate skim across all three spike tips, 5 units clear of the circle.
 for(let i=0;i<100;i++){r.y=S.floor-64-S.radius-5;r.vy=0;r.step(S.fixedStep);}
 assert.ok(r.alive);assert.equal(r.bonus,S.nearMissBonus);advance(r,1);assert.equal(r.bonus,S.nearMissBonus);
 const safe=new E.Run();safe.flip();advance(safe,5);assert.equal(safe.bonus,0);
});
test('optional star approaches remain reachable for both surfaces, at base/capped speed and all size limits',()=>{
 for(const kind of ['floor','ceiling'])for(const late of [false,true])for(const height of [64,86])for(const width of [90,126]){
  let success=false;
  for(let first=0;first<1.7&&!success;first+=.01){
    const r=new E.Run();const offset=late?Math.ceil(S.speedRampMeters/S.metersPerUnit/(E.TERRAIN_SPAN*E.TERRAIN.length))*E.TERRAIN_SPAN*E.TERRAIN.length:0;r.distance=offset;
    r.obstacles=[{id:0,kind,x:offset+250,width,height,minClearance:Infinity,awarded:false}];r.nextX=1e9;
    r.collectibles=[{id:0,x:offset+210,y:kind==='floor'?S.floor-height-S.radius-18:S.ceiling+height+S.radius+18,collected:false}];
    r.y=kind==='floor'?S.floor-S.radius:S.ceiling+S.radius;r.gravity=kind==='floor'?1:-1;
    for(let i=0;i<300&&r.alive;i++){if(i===Math.round(first/S.fixedStep))r.flip();r.step(S.fixedStep);}
    if(r.alive&&r.stars)success=true;
  }
  assert.ok(success,`${kind} star reachable, cap=${late}, h=${height}, w=${width}`);
 }
});
test('collectibles are counted once and separately from distance and bonuses',()=>{
 const r=new E.Run();r.collectibles=[{id:0,x:0,y:r.y,collected:false}];advance(r,.1);assert.equal(r.stars,1);assert.equal(r.bonus,0);assert.equal(r.meters,Math.floor(S.baseSpeed*.1*S.metersPerUnit));advance(r,.1);assert.equal(r.stars,1);
});
test('save validation tolerates malformed, missing, negative, wrong-type, and locked selections',()=>{
 for(const raw of [null,'oops','[]','false','{"best":-9,"totalStars":"999","sound":0,"selected":"astro"}'])assert.deepEqual(E.readSave(raw),E.readSave(null));
 assert.deepEqual(E.readSave('{"best":54.9,"totalStars":17,"selected":"pebble","sound":false}'),{version:1,best:54,totalStars:17,selected:'pebble',sound:false});
 assert.equal(E.readSave({best:Infinity,totalStars:NaN}).best,0);
});
test('architecture uses exact rectangle geometry and leaves a safe upper/lower route in every motion phase',()=>{
 for(const kind of ['floor-tower','ceiling-tower','bridge','arch','piston-floor','piston-ceiling','comb-floor','comb-ceiling','crusher-floor','crusher-ceiling']){
  const o={kind,x:100,width:126,phase:0};
  for(let t=0;t<8;t+=.1){
   const safe=E.safeGravity(o,1)===1?S.floor-S.radius:S.ceiling+S.radius;
   for(let x=100;x<=226;x+=3)assert.ok(E.clearance(o,x,safe,t)>0,kind+' safe lane');
   for(const r of E.rectangles(o,t))assert.ok(E.clearance(o,r.x+r.w/2,r.y+r.h/2,t)<0,kind+' solid center');
  }
 }
});
test('shield saves one collision, breaks the entire obstacle, and never grants a near-miss reward',()=>{
 const r=new E.Run();r.obstacles=[{id:1,kind:'floor-tower',x:20,width:126,minClearance:Infinity,awarded:false}];r.nextX=1e9;
 r.collectibles=[{type:'shield',x:0,y:r.y,collected:false}];advance(r,1);
 assert.ok(r.alive);assert.equal(r.powers.shield,0);assert.equal(r.bonus,0);assert.ok(r.drainEvents().some(e=>e.type==='shield-break'));
 r.obstacles=[{id:2,kind:'floor',x:r.distance+20,width:90,height:64,minClearance:Infinity,awarded:false}];advance(r,.3);assert.ok(!r.alive,'a second unprotected hit is fatal');
});
test('magnet attracts stars only, and slow time expires without changing gravity or the speed cap',()=>{
 const r=new E.Run();r.collectibles=[{type:'magnet',x:0,y:r.y,collected:false},{type:'star',x:80,y:r.y-50,collected:false},{type:'shield',x:80,y:r.y-50,collected:false}];advance(r,.1);
 assert.equal(r.stars,1);assert.equal(r.powers.shield,0);assert.ok(r.powers.magnet>7);
 r.obstacles=[];r.nextX=1e9;r.collectibles=[{type:'slow',x:r.distance,y:r.y,collected:false}];advance(r,.1);assert.ok(r.speed<S.baseSpeed);assert.equal(r.gravity,1);
 advance(r,S.slowSeconds+.1);assert.equal(r.powers.slow,0);assert.ok(r.speed>S.baseSpeed&&r.speed<S.maxSpeed);advance(r,3);assert.equal(r.powers.magnet,0);
});
test('star chains and distance milestone rewards pay exactly once and stay separate from pickups',()=>{
 const r=new E.Run();r.obstacles=[];r.nextX=1e9;r.collectibles=Array.from({length:5},()=>({type:'star',x:0,y:r.y,collected:false}));advance(r,.1);
 assert.equal(r.stars,5);assert.equal(r.chain,5);assert.equal(r.bonus,S.chainBonus);advance(r,S.chainSeconds+.1);assert.equal(r.chain,0);assert.equal(r.bonus,S.chainBonus);
 r.distance=S.milestoneMeters/S.metersPerUnit;advance(r,.1);assert.equal(r.rewardStars,S.milestoneStars);advance(r,.1);assert.equal(r.rewardStars,S.milestoneStars);assert.equal(r.stars,5);
});
test('run seeds vary later authored layouts while retaining the safe introduction',()=>{
 function sequence(seed){const r=new E.Run(0,seed);r.distance=5000;r.fill();return r.obstacles.map(o=>o.kind).join(',');}
 assert.equal(sequence(17),sequence(17));assert.notEqual(sequence(17),sequence(42));
});
test('top and bottom rails have independent architecture, continuous joins, and sufficient clearance',()=>{
 let narrow=Infinity,wide=0,nonparallel=0;
 for(let x=0;x<12000;x+=5){const a=E.terrainAt(x),b=E.terrainAt(x+1),bounds=E.boundsAt(x);narrow=Math.min(narrow,a.bottom-a.top);wide=Math.max(wide,a.bottom-a.top);if(Math.abs((b.top-a.top)-(b.bottom-a.bottom))>.1)nonparallel++;assert.ok(bounds.bottom-bounds.top>170);}
 assert.ok(narrow<270&&wide>450&&nonparallel>1000);
 for(let x=1200;x<12000;x+=1200){const a=E.terrainAt(x-.001),b=E.terrainAt(x+.001);assert.ok(Math.abs(a.top-b.top)<.01&&Math.abs(a.bottom-b.bottom)<.01);}
 for(const side of ['top','bottom'])for(const [x,y] of E.terrainVertices(300,6500,side))assert.equal(y,E.terrainAt(x)[side]);
});
test('grounded avatar rides rising and falling terrain without hovering or entering the hull',()=>{
 for(const gravity of [1,-1]){const r=new E.Run();r.gravity=gravity;r.y=E.boundsAt(0)[gravity===1?'bottom':'top'];r.obstacles=[];r.collectibles=[];r.nextX=1e9;
 for(let i=0;i<5000;i++){r.step(S.fixedStep);assert.equal(r.y,E.boundsAt(r.distance)[gravity===1?'bottom':'top']);assert.equal(r.vy,0);}}
});
test('magnet visibly pulls stars through intermediate positions before awarding them once',()=>{
 const r=new E.Run();r.obstacles=[];r.nextX=1e9;r.powers.magnet=8;
 const s={type:'star',x:180,y:400,collected:false};r.collectibles=[s];r.step(S.fixedStep);
 assert.ok(s.attracted);assert.ok(s.x<180&&s.y>400);assert.equal(r.stars,0);assert.ok(s.path.length>0);
 advance(r,.6);assert.equal(r.stars,1);assert.ok(s.collected);advance(r,.6);assert.equal(r.stars,1);
});
test('random director varies order, size, spacing and phase reproducibly without moving visible obstacles',()=>{
 const signature=seed=>{const r=new E.Run(0,seed);r.time=100;r.distance=35000;r.fill();return r.obstacles.map(o=>[o.kind,o.x,o.width,o.height,o.phase,o.motionRate]);};
 assert.deepEqual(signature(42),signature(42));assert.notDeepEqual(signature(42),signature(43));
 const r=new E.Run(0,91);r.time=100;r.distance=20000;r.fill();const existing=JSON.stringify(r.obstacles);r.fill();assert.equal(JSON.stringify(r.obstacles),existing);
 const late=r.obstacles.filter(o=>o.id>2);assert.ok(new Set(late.map(o=>o.width)).size>6);assert.ok(new Set(late.map(o=>o.nextGap)).size>6);assert.ok(new Set(late.map(o=>o.phase)).size>6);
 for(const o of late)assert.ok(o.nextGap>=E.minimumGap());
});
test('distance-driven progression tightens spacing and favors forced flips and faster machinery',()=>{
 assert.equal(E.difficultyAt(0).level,1);assert.equal(E.difficultyAt(9000).level,5);assert.equal(E.difficultyAt(999999).level,8);
 function summarize(x){
  let count=0,gap=0,rate=0,transitions=0,switches=0,moving=0;
  for(let seed=1;seed<=300;seed++){
   const r=new E.Run(0,seed);r.time=100;r.distance=x;r.nextX=x+100;r.obstacles=[];r.collectibles=[];r.queue=[];r.sequence=50;r.nextRushIndex=Infinity;r.fill();let previous=0;
   for(const o of r.obstacles){
    count++;gap+=o.nextGap;rate+=o.motionRate;if(o.kind==='moving'||o.kind.startsWith('piston'))moving++;
    const lane=E.safeGravity(o,0);if(lane&&previous){transitions++;if(lane!==previous)switches++;}if(lane)previous=lane;
   }
  }
  return {gap:gap/count,rate:rate/count,switches:switches/transitions,moving:moving/count};
 }
 const early=summarize(7300),late=summarize(35000);
 assert.ok(late.gap<early.gap-50,"spacing tightens with distance (the early game already starts tight)");assert.ok(late.rate>early.rate+.5);assert.ok(late.switches>early.switches);assert.ok(late.moving>early.moving);
});
test('cruise speed increases smoothly with distance, stays capped, and does not depend on elapsed time',()=>{
 assert.equal(E.speedAt(0),S.baseSpeed);assert.equal(E.speedAt(S.speedRampMeters/S.metersPerUnit),S.maxSpeed);
 let previous=S.baseSpeed;for(let x=1;x<60000;x++){const speed=E.speedAt(x);assert.ok(speed>=previous&&speed-previous<.01&&speed<=S.maxSpeed);previous=speed;}
 const a=new E.Run(),b=new E.Run();a.distance=b.distance=5000;a.y=b.y=E.boundsAt(5000).bottom;a.obstacles=b.obstacles=[];a.nextX=b.nextX=1e9;b.time=999;
 a.step(S.fixedStep);b.step(S.fixedStep);assert.equal(a.speed,b.speed);
});

test('floor and overhead gaps remove support, cause a void fall, and permit a timely transfer',()=>{
 for(const side of ['bottom','top']){
  function fixture(){const r=new E.Run();r.distance=390;r.gravity=side==='bottom'?1:-1;r.y=E.boundsAt(r.distance)[side];r.vy=0;r.nextX=1e9;r.collectibles=[];r.obstacles=[{id:2,terrain:true,kind:side==='bottom'?'gap-floor':'gap-ceiling',x:400,width:360,minClearance:Infinity,awarded:false}];return r;}
  const missed=fixture();advance(missed,.18);assert.notEqual(missed.y,E.boundsAt(missed.distance)[side],'no invisible surface in a gap');advance(missed,1);assert.ok(!missed.alive);assert.ok(missed.drainEvents().some(e=>e.reason==='void'));
  const safe=fixture();safe.flip();advance(safe,1.4);assert.ok(safe.alive);assert.equal(safe.y,E.boundsAt(safe.distance)[side==='bottom'?'top':'bottom']);
 }
});
test('drawn platform spans and collision support agree across every generated opening',()=>{
 const r=new E.Run(0,13);r.distance=40000;r.time=100;r.fill();const gaps=E.surfaceOpenings(r.obstacles);
 assert.ok(gaps.some(g=>g.major)&&gaps.some(g=>!g.major));
 for(const side of ['top','bottom']){
  const spans=E.platformSpans(0,42000,side,gaps);
  for(let x=0;x<42000;x+=7)assert.equal(E.hasSurface(x,side,gaps),spans.some(([a,b])=>x>=a&&x<=b));
 }
 for(const gap of gaps){const opposite=gap.side==='top'?'bottom':'top';for(let x=gap.from;x<=gap.to;x+=5)assert.ok(E.hasSurface(x,opposite,gaps),'every missing deck has an opposite landing route');}
});
test('open routes tolerate varied visible reaction timings at all speeds without power-ups',()=>{
 for(const lead of [250,280,320])for(let seed=1;seed<=12;seed++){
  const r=new E.Run(0,seed);
  for(let i=0;i<180/S.fixedStep&&r.alive;i++){
   const next=r.obstacles.find(o=>o.x+o.width+S.radius>=r.distance);
   if(next&&next.x-r.distance<lead){const desired=E.safeGravity(next,r.gravity);if(desired!==r.gravity)r.flip();}
   r.collectibles=[];r.step(S.fixedStep);r.drainEvents();
  }
  assert.ok(r.alive,`seed ${seed}, lead ${lead}, distance ${r.meters}`);
 }
});

test('sector palettes, platform materials, geometry and scenery crossfade continuously',()=>{
 const channels=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
 for(const stage of E.SECTORS.slice(1)){
  const start=E.themeAt(stage.at),end=E.themeAt(stage.at+S.themeBlendUnits);assert.equal(start.mix,0);assert.equal(end.mix,1);assert.equal(end.sky,stage.sky);
  let previous=E.themeAt(stage.at-1);
  for(let x=stage.at;x<=stage.at+S.themeBlendUnits+1;x++){
   const current=E.themeAt(x);for(const key of ['sky','color','deck']){const a=channels(previous[key]),b=channels(current[key]);assert.ok(a.every((v,i)=>Math.abs(v-b[i])<=1),key+' has no color jump');}
   assert.ok(Math.abs(current.thickness-previous.thickness)<.1);assert.ok(Math.abs(current.moonRadius-previous.moonRadius)<.1);
   assert.ok(Math.abs(current.layers.reduce((n,l)=>n+l.alpha,0)-1)<1e-8);previous=current;
  }
 }
});
test('new comb hurdles and opposed crushers are generated with safe spacing',()=>{
 const kinds=new Set();
 for(let seed=1;seed<=60;seed++){
  for(const late of [false,true]){const r=new E.Run(0,seed);r.time=100;r.distance=late?35000:5500;r.nextX=r.distance+100;r.sequence=30;r.queue=[];r.nextRushIndex=Infinity;r.obstacles=[];r.collectibles=[];r.fill();
   for(const o of r.obstacles){kinds.add(o.kind);if(o.kind.startsWith('comb-')||o.kind.startsWith('crusher-')){assert.ok(o.width>=130);assert.ok(o.nextGap>=E.minimumGap());}}
  }
 }
 for(const kind of ['comb-floor','comb-ceiling','crusher-floor','crusher-ceiling'])assert.ok(kinds.has(kind));
});

test('passed gaps remain unchanged while visible behind the widest camera, then retire offscreen',()=>{
 const r=new E.Run();r.obstacles=[{id:2,terrain:true,kind:'gap-floor',x:400,width:240,awarded:false,minClearance:Infinity}];r.collectibles=[];r.nextX=1e9;r.gravity=-1;
 const probe=600;r.distance=789;r.y=E.boundsAt(r.distance).top;
 for(let i=0;i<60;i++){
  assert.ok(probe>r.distance-S.maximumWidth*.23-40,'probe remains in the wide rear view');
  r.step(S.fixedStep);assert.ok(!E.hasSurface(probe,'bottom',E.surfaceOpenings(r.obstacles)),'visible gap must never fill back in');
 }
 assert.ok(S.obstacleHistory>S.maximumWidth*.23+40+120);
 r.distance=640+S.obstacleHistory+1;r.y=E.boundsAt(r.distance).top;r.step(S.fixedStep);assert.equal(r.obstacles.length,0,'old geometry is eventually retired');
});
test('rush groups alternate sides, respect crossing gaps, and escalate from three to four hurdles',()=>{
 for(const late of [false,true]){
  const r=new E.Run(0,42);r.distance=late?35000:3500;r.nextX=r.distance+100;r.sequence=6;r.queue=[];r.rushQueue=[];r.obstacles=[];r.collectibles=[];r.fill();
  // Higher speeds widen the safety gaps, so look a little further ahead to see the whole rush.
  const start=r.distance;r.distance+=2000;r.fill();r.distance=start;
  const group=r.obstacles.filter(o=>o.rushId===6);assert.equal(group.length,late?4:3);
  for(let i=0;i<group.length;i++){assert.equal(group[i].rushStep,i);assert.ok(group[i].nextGap>=E.minimumGap());if(i)assert.equal(E.safeGravity(group[i]),-E.safeGravity(group[i-1]));}
 }
});
test('clean rush completion pays once; a shield hit forfeits only the clean-clear bonus',()=>{
 for(const hit of [false,true]){
  const r=new E.Run();r.nextX=1e9;r.collectibles=[];r.obstacles=[{id:6,kind:'floor-tower',x:40,width:100,rise:100,rushId:6,rushStep:0,rushTotal:1,minClearance:Infinity,awarded:false}];
  if(hit)r.powers.shield=1;else{r.gravity=-1;r.y=S.ceiling+S.radius;}
  advance(r,1);assert.ok(r.alive);assert.equal(r.rewardStars,hit?0:2);assert.equal(r.bonus,hit?0:25);
  const completed=r.drainEvents().filter(e=>e.type==='rush-complete');assert.equal(completed.length,1);assert.equal(completed[0].clean,!hit);
  advance(r,1);assert.equal(r.rewardStars,hit?0:2);assert.ok(!r.drainEvents().some(e=>e.type==='rush-complete'));
 }
});

test('curved terrain is tangent-continuous with bounded clearance and render sampling error',()=>{
 const slope=(x,side)=>(E.terrainAt(x+.01)[side]-E.terrainAt(x-.01)[side])/.02;
 for(let x=10;x<13200;x+=7)for(const side of ['top','bottom']){
  assert.ok(Math.abs(slope(x+.1,side)-slope(x-.1,side))<.03,'no sharp tangent discontinuity');
  assert.ok(Math.abs(slope(x,side))<1.3,'slopes remain runnable');
 }
 for(const side of ['top','bottom']){
  const vertices=E.terrainVertices(2400,6000,side);
  for(let i=1;i<vertices.length;i++){const a=vertices[i-1],b=vertices[i],mid=(a[0]+b[0])/2;assert.ok(Math.abs(E.terrainAt(mid)[side]-(a[1]+b[1])/2)<.15,'drawn curve agrees with landing geometry');}
 }
 assert.equal(E.circularCap(0,0,260,95),95);
});
test('round hazard collisions match their artwork and preserve the opposite lane throughout motion',()=>{
 for(const kind of ['wheel-floor','wheel-ceiling','orbit-floor','orbit-ceiling','pendulum-floor','pendulum-ceiling'])for(const x of [2400,2900,4100,7100,9500]){
  const o={kind,x,width:kind.startsWith('pendulum')?310:190,terrain:true,phase:.3,motionRate:2.5,intensity:1};
  for(let t=0;t<5;t+=.07){
   const bodies=E.circles(o,t);assert.ok(bodies.length>0);
   for(const c of bodies){assert.ok(c.r>0);assert.ok(c.x-c.r>=x-1&&c.x+c.r<=x+o.width+1,'motion stays inside announced obstacle span');assert.ok(E.clearance(o,c.x,c.y,t)<0);}
   for(let px=x;px<=x+o.width;px+=10){const safeY=E.boundsAt(px)[E.safeGravity(o)===1?'bottom':'top'];assert.ok(E.clearance(o,px,safeY,t)>30,'opposite surface stays reachable throughout motion');}
  }
 }
 const o={kind:'pendulum-floor',x:4000,width:310,terrain:true,phase:0,motionRate:2};let prior=E.circles(o,0)[0];
 for(let t=.001;t<4;t+=.001){const next=E.circles(o,t)[0];assert.ok(Math.hypot(next.x-prior.x,next.y-prior.y)<.4,'motion has no position jumps');prior=next;}
});
