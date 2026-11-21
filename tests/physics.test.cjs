const {test}=require('node:test');const assert=require('node:assert/strict');
const E=require('../engine.js'),S=E.SETTINGS;
function clear(){const r=new E.Run(0,7);r.obstacles=[];r.targets=[];r.collectibles=[];r.nextX=1e9;return r;}
function fly(r,seconds){for(let i=0;i<seconds/S.fixedStep;i++)r.step(S.fixedStep);}
// Holds the pilot in place on a solid deck so a long physics check is not cut short by a fall.
function hold(r,x){r.distance=x;r.alive=true;r.gravity=1;r.vy=0;r.y=E.boundsAt(x).bottom;}

test('deck normals point into the tunnel on both rails, including on curves',()=>{
  for(const x of [0,450,2650,3750,9100]){
    const top=E.surfaceNormal(x,'top'),bottom=E.surfaceNormal(x,'bottom');
    assert.ok(top.y>0&&bottom.y<0);assert.ok(Math.abs(Math.hypot(top.x,top.y)-1)<1e-9);
  }
});

test('ordinary rounds ricochet off a deck, mirror about its normal, and lose energy',()=>{
  const r=clear();r.y=300;
  r.bullets.push({x:200,y:480,vx:900,vy:700,life:.85,powered:false,type:'standard',weapon:'machine',remaining:1,hitIds:[],bounces:0});
  const before=Math.hypot(900,700);fly(r,.05);
  const b=r.bullets[0];assert.ok(b,'round survives the first deck contact');
  assert.equal(b.bounces,1);assert.ok(b.vy<0,'bounced back up off the floor');
  assert.ok(Math.hypot(b.vx,b.vy)<before*.9,'energy lost in the bounce');
  assert.ok(r.drainEvents().some(e=>e.type==='ricochet'));
});

test('rounds stop after the ricochet limit; rail and plasma never bounce',()=>{
  const r=clear();
  r.bullets.push({x:200,y:480,vx:300,vy:900,life:5,type:'standard',remaining:1,hitIds:[],bounces:S.maxRicochets});
  r.bullets.push({x:200,y:480,vx:300,vy:900,life:5,type:'pierce',remaining:3,hitIds:[],bounces:0});
  fly(r,.1);assert.equal(r.bullets.length,0);
});

test('a kill with a bounced round is a bank shot worth bonus points',()=>{
  const r=clear();const bonus=r.bonus;
  r.targets.push({id:'d',x:400,y:200,phase:0,destroyed:false});
  const ty=E.targetY(r.targets[0],r.time+S.fixedStep);
  r.bullets.push({x:395,y:ty,vx:600,vy:0,life:.5,type:'standard',remaining:1,hitIds:[],bounces:1});
  fly(r,.02);
  const events=r.drainEvents();
  assert.ok(events.some(e=>e.type==='bank-shot'));assert.equal(r.bankShots,1);
  assert.equal(r.bonus,bonus+25+S.bankShotBonus);
});

test('pendulums follow real swing physics and stay inside their safety limit',()=>{
  const r=clear();const o={id:5,kind:'pendulum-ceiling',x:2600,width:300,terrain:true,phase:.4,motionRate:2,intensity:.5};
  r.obstacles.push(o);r.distance=2000;fly(r,.01);assert.ok(o.swing,'swing state created');
  let crossings=0,prev=Math.sign(o.swing.a),maxA=0;
  for(let i=0;i<6/S.fixedStep;i++){hold(r,2000);r.step(S.fixedStep);const s=Math.sign(o.swing.a);if(s&&s!==prev){crossings++;prev=s;}maxA=Math.max(maxA,Math.abs(o.swing.a));}
  assert.ok(crossings>=3&&crossings<=6,'keeps swinging back and forth: '+crossings);
  assert.ok(maxA<=E.SWING_LIMIT+1e-9&&maxA>.6,'amplitude near the design and capped: '+maxA);
});

test('shooting a pendulum shoves it along its arc, and the safe lane survives any shove',()=>{
  const r=clear();const o={id:5,kind:'pendulum-floor',x:2600,width:300,terrain:true,phase:0,motionRate:2,intensity:.5,hp:99};
  r.obstacles.push(o);r.distance=2000;r.time=0;fly(r,.01);
  o.swing.a=0;o.swing.w=0;
  r.shove(o,{x:0,y:0,vx:1400,vy:0,type:'standard'});assert.ok(o.swing.w>0,'pushed forward');
  r.shove(o,{x:0,y:0,vx:-1400,vy:0,type:'pierce'});assert.ok(o.swing.w<0,'rail pushes twice as hard');
  for(let k=0;k<40;k++){
    o.swing.w+=(k%3?1:-1)*3;
    for(let i=0;i<12;i++){hold(r,2000);r.step(S.fixedStep);}
    for(let px=o.x;px<=o.x+o.width;px+=15){const safeY=E.boundsAt(px)[E.safeGravity(o)===1?'bottom':'top'];assert.ok(E.clearance(o,px,safeY,r.time)>30);}
    for(const c of E.circles(o,r.time))assert.ok(c.x-c.r>=o.x-1&&c.x+c.r<=o.x+o.width+1);
  }
});

test('bullet hits on a pendulum emit a shove event',()=>{
  const r=clear();const o={id:5,kind:'pendulum-ceiling',x:900,width:300,terrain:true,phase:0,motionRate:2,intensity:0,hp:99};
  r.obstacles.push(o);fly(r,.01);
  const ball=E.circles(o,r.time)[0];
  r.bullets.push({x:ball.x-ball.r-8,y:ball.y,vx:1400,vy:0,life:.5,type:'standard',remaining:1,hitIds:[],bounces:0});
  const w=o.swing.w;r.step(S.fixedStep);
  assert.ok(r.drainEvents().some(e=>e.type==='shove'));assert.notEqual(o.swing.w,w);
});
