const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('../duel-engine.js');
const {Duel,SETTINGS:S,POWERS,ARENAS,terrainAt,laneY,zoneSpan,hazardTouches,ballisticAngle}=G;

const fight=(seed=11,options={})=>{const d=new Duel({seed,...options});while(d.phase!=='fight')d.step();d.drainEvents();return d;};
// A clean arena: no hazards, gaps or pickups, so rules can be checked in isolation.
const arena=(seed=11,options)=>{const d=fight(seed,options);d.hazards=[];d.gaps=[];d.pickups=[];d.fill=()=>{};return d;};
const run=(d,seconds,each=()=>{})=>{for(let i=0;i<Math.round(seconds/S.fixedStep);i++){each(d,i);d.step();}};
const types=d=>d.drainEvents().map(e=>e.type);
const place=(d,p,lane,offset)=>{p.lane=p.fromLane=lane;p.shift=1;p.offset=offset;p.vx=0;p.y=p.fromY=laneY(d.terrain,lane,d.worldX(p));};

test('identical seeds and inputs give identical duels',()=>{
  const a=new Duel({seed:99}),b=new Duel({seed:99});
  const script=(d,i)=>{d.hold(0,i%240<120);d.hold(1,i%300>150);if(i%97===0)d.press(0,'up');if(i%131===0)d.press(1,'down');if(i%400===0){d.press(1,'shield');d.press(0,'power');d.press(1,'use0');d.press(1,'next');}};
  run(a,25,script);run(b,25,script);
  assert.deepEqual(a.snapshot(),b.snapshot());
});

test('curved decks keep room for pilots in every arena',()=>{
  for(const [index] of ARENAS.entries())for(let seed=1;seed<=10;seed++){
    const d=new Duel({seed});d.terrain.arena=index;
    let minUpper=1e9,minLower=1e9,flat=true;const first=terrainAt(d.terrain,0).floor;
    for(let x=0;x<40000;x+=7){
      const s=terrainAt(d.terrain,x);
      minUpper=Math.min(minUpper,s.mid-s.ceil);minLower=Math.min(minLower,s.floor-s.mid-S.midThickness);
      if(Math.abs(s.floor-first)>8)flat=false;
      assert.ok(s.ceil>40&&s.floor<580,`decks stay on screen (${ARENAS[index].name})`);
    }
    assert.ok(minUpper>=149.99&&minLower>=114.99,`${ARENAS[index].name}: spacing ${minUpper.toFixed(0)}/${minLower.toFixed(0)}`);
    assert.ok(!flat,'decks are curved, not straight');
  }
});

test('each round is a different arena',()=>{
  const d=fight(4);const first=d.terrain.arena;
  d.hurt(d.players[1],200,0,'shot');d.step();run(d,S.roundOver+.1);
  assert.equal(d.round,2);assert.notEqual(d.terrain.arena,first);
});

test('grounded pilots ride the curve, and downhill speeds them up',()=>{
  const d=arena(5);const p=d.players[0];
  let seenUp=false,seenDown=false;
  run(d,6,()=>{
    assert.ok(Math.abs(p.y-laneY(d.terrain,0,d.worldX(p)))<1e-6);
    if(p.vx>5)seenDown=true;if(p.vx<-5)seenUp=true;
  });
  assert.ok(seenDown&&seenUp,'slopes push forward downhill and back uphill');
});

test('three decks: up and down move one level; openings let you pass through; the ceiling is inverted',()=>{
  const d=arena();const p=d.players[0];
  d.press(0,'up');run(d,.4);assert.equal(p.lane,1);
  d.press(0,'up');run(d,.4);assert.equal(p.lane,2);assert.equal(d.inversion(p),-1);
  d.press(0,'down');d.press(0,'down');run(d,.8);assert.equal(p.lane,0);
  d.gaps.push({id:1,surface:1,x:d.worldX(p)-100,w:400});
  d.press(0,'up');run(d,.5);assert.equal(p.lane,2);
});

test('the bridge drops you to the floor; floor openings are a void that costs health; quick reactions climb out',()=>{
  const d=arena();const p=d.players[0];
  d.press(0,'up');run(d,.4);
  d.gaps.push({id:1,surface:1,x:d.worldX(p)+20,w:300});
  run(d,.6);assert.equal(p.lane,0);assert.equal(p.hp,S.maxHp);
  d.gaps.push({id:2,surface:0,x:d.worldX(p)+20,w:400});
  run(d,1.2);assert.ok(types(d).includes('void'));assert.equal(p.hp,S.maxHp-S.voidDamage);
  const e=arena();const q=e.players[0];
  e.gaps.push({id:3,surface:0,x:e.worldX(q)-10,w:400});
  run(e,.06);assert.ok(q.falling);e.press(0,'up');run(e,.4);assert.equal(q.lane,1);assert.equal(q.hp,S.maxHp);
});

test('bullets fall in the shooter’s own gravity, and auto-aim solves the arc',()=>{
  const d=arena();const a=d.players[0];
  d.shoot(a);assert.ok(d.bullets.at(-1).g>0,'floor shots fall down');
  place(d,a,2,350);a.cooldown=0;d.shoot(a);assert.ok(d.bullets.at(-1).g<0,'ceiling shots fall up');
  // The solved angle lands on the target in free flight for both gravities.
  for(const g of [S.bulletGravity,-S.bulletGravity])for(const [dx,dy] of [[400,-150],[600,120],[-500,-60],[300,0]]){
    const angle=ballisticAngle(dx,dy,1050,g,1);let x=0,y=0,vx=Math.cos(angle)*1050,vy=Math.sin(angle)*1050,best=1e9;
    for(let t=0;t<2;t+=1/600){vy+=g/600;x+=vx/600;y+=vy/600;best=Math.min(best,Math.hypot(x-dx,y-dy));}
    assert.ok(best<8,`arc misses (${dx},${dy}) g=${g} by ${best.toFixed(1)}`);
  }
});

test('ammo is limited, refills with distance, and clicks dry',()=>{
  const d=arena();const [a,b]=d.players;place(d,b,0,700);b.hp=1e4;a.nextAmmoAt=1e9;
  d.hold(0,true);run(d,7);
  assert.equal(a.ammo,0);assert.equal(d.stats[0].shots,S.startAmmo);assert.ok(b.hp<1e4,'arcing shots land');
  assert.ok(types(d).includes('dry'));
  const e=arena();const p=e.players[0];p.ammo=0;run(e,12);assert.ok(p.ammo>=S.ammoRefill);assert.ok(types(e).includes('refill'));
});

test('the bridge is cover for arcing shots, but the rail fires straight through it',()=>{
  const d=arena();const [a,b]=d.players;place(d,b,2,800);
  d.hold(0,true);run(d,1.5);d.hold(0,false);run(d,1);
  assert.equal(b.hp,S.maxHp,'blaster rounds stop on the bridge');
  place(d,b,2,800);a.weapon='rail';a.special=5;a.cooldown=0;
  d.hold(0,true);run(d,.2);d.hold(0,false);run(d,.5);
  assert.ok(b.hp<S.maxHp,'rail pierces cover');
});

test('floating asteroids never touch a running pilot but bounce one who switches decks into them',()=>{
  const d=arena();const a=d.players[0];
  const x=d.worldX(a)+20,span=zoneSpan(d.terrain,0,x);
  d.hazards.push({id:50,type:'rock',zone:0,x,y:(span.top+span.bottom)/2,r:Math.min(30,(span.bottom-span.top)/2-3),hp:40,w:0});
  assert.ok(!hazardTouches(d.hazards[0],x,laneY(d.terrain,0,x),S.radius,0));
  d.press(0,'up');run(d,.5);
  assert.equal(a.lane,0,'bounced back to the floor');assert.equal(a.hp,S.maxHp-S.rockDamage);
  assert.ok(types(d).includes('bounce'));
});

test('shield is manual, costs power, blocks and parries shots',()=>{
  const d=arena();const [a,b]=d.players;place(d,b,0,700);
  run(d,.5);assert.equal(b.shield,0,'never automatic');
  b.power=S.shieldCost;d.press(1,'shield');run(d,.02);assert.ok(b.shield>0);
  d.hold(0,true);run(d,.8);d.hold(0,false);
  assert.ok(types(d).includes('reflect'));assert.equal(b.hp,S.maxHp);assert.ok(a.hp<S.maxHp,'parried rounds hit the shooter');
  run(d,2);b.power=0;d.press(1,'shield');run(d,.02);assert.equal(b.shield,0);assert.ok(types(d).includes('no-power'));
});

test('powers are found as orbs, carried up to three, selected and spent one at a time',()=>{
  const d=arena();const p=d.players[0];
  assert.deepEqual(p.inventory,[],'nobody starts with a power');
  d.press(0,'power');run(d,.02);assert.ok(types(d).includes('no-item'));
  for(const power of ['well','hex','blades','echo'])d.collect(p,{type:'orb',power});
  assert.deepEqual(p.inventory,['well','hex','blades'],'carry at most three');assert.equal(p.selected,2,'the newest is selected');
  assert.ok(p.power>S.startPower,'a fourth orb turns into power');
  d.press(0,'next');run(d,.02);assert.equal(p.selected,0);
  d.press(0,'use1');run(d,.02);assert.deepEqual(p.inventory,['well','blades'],'tapping a slot uses that power');assert.ok(p.hex===0);
  d.press(0,'power');run(d,.02);assert.equal(d.stats[0].powers,1,'cooldown blocks instant reuse');
  run(d,S.powerCooldown);d.press(0,'power');run(d,.02);assert.equal(d.stats[0].powers,2);assert.deepEqual(p.inventory,['blades']);
});

test('each pilot finds an early orb on their starting deck',()=>{
  const d=new Duel({seed:5});while(d.beat<4)d.generateBeat();const orbs=d.pickups.filter(x=>x.type==='orb'&&!x.dropped).slice(0,2);
  assert.deepEqual(orbs.map(o=>o.lane),[0,2]);assert.ok(orbs.every(o=>G.POWER_IDS.includes(o.power)));
});

test('Gravity Well swallows enemy bullets, drags the rival and crushes obstacles',()=>{
  const d=arena();const [a,b]=d.players;place(d,b,0,750);
  a.inventory=['well'];d.press(0,'power');run(d,1.5);
  assert.equal(d.wells.length,1);const w=d.wells[0];
  d.bullets.push({id:900,owner:1,kind:'blaster',x:d.camX+w.offset+60,y:w.y,vx:-300,vy:0,g:0,life:1,damage:5,hits:[]});
  d.hazards.push({id:901,type:'rock',zone:0,x:d.camX+w.offset+20,y:w.y,r:20,hp:15,w:0});
  const hp=b.hp,distance=Math.abs(b.offset-w.offset);run(d,1.2);
  assert.ok(types(d).includes('swallow'));assert.ok(d.hazards.find(h=>h.id===901).destroyed,'rock crushed');
  assert.ok(Math.abs(b.offset-w.offset)<distance||b.hp<hp,'rival dragged or hurt');
});

test('Time Echo repeats every shot 0.6 s later for free',()=>{
  const d=arena();const a=d.players[0];a.inventory=['echo'];
  d.press(0,'power');run(d,.02);
  d.hold(0,true);run(d,.5);d.hold(0,false);const shots=d.stats[0].shots;run(d,1);
  assert.equal(types(d).filter(t=>t==='echo-shot').length,shots);assert.equal(a.ammo,S.startAmmo-shots);
});

test('Comet Roll lands on the rival’s deck, smashes spikes and hits the rival',()=>{
  const d=arena();const [a,b]=d.players;place(d,b,1,500);a.inventory=['comet'];
  const spikes={id:77,type:'spikes',lane:1,x:d.worldX(b)+560,w:60,hp:18};spikes.shapes=G.hazardShapes(d.terrain,spikes);d.hazards.push(spikes);
  b.hazardCd=99;d.press(0,'power');run(d,.02);
  assert.equal(d.comets[0].lane,1);
  run(d,2.5,()=>{b.hazardCd=99;});
  assert.ok(spikes.destroyed,'spikes smashed');assert.ok(b.hp<=S.maxHp-22,'rival hit');
});

test('Orbit Blades cut bullets and nearby rivals',()=>{
  const d=arena();const [a,b]=d.players;place(d,b,0,a.offset+50);
  a.inventory=['blades'];d.press(0,'power');run(d,.02);
  d.bullets.push({id:901,owner:1,kind:'blaster',x:d.worldX(a)+48,y:a.y-9,vx:-d.speed,vy:0,g:0,life:1,damage:5,hits:[]});
  run(d,1);
  assert.ok(!d.bullets.some(x=>x.id===901));assert.ok(b.hp<S.maxHp);
});

test('Gravity Hex flings the rival to the far deck and flips their controls',()=>{
  const d=arena();const [a,b]=d.players;place(d,b,0,750);
  a.inventory=['hex'];d.press(0,'power');run(d,2);
  assert.equal(b.lane,2,'flung to the ceiling');assert.ok(b.hex>0);
  run(d,.3);d.press(1,'up');run(d,.4);assert.equal(b.lane,1,'up now moves down');
});

test('Boomerangs fly out and come back',()=>{
  const d=arena();const [a,b]=d.players;place(d,b,0,1000);b.hp=1e4;
  d.collect(a,{type:'boomerang'});a.cooldown=0;d.shoot(a);const id=d.bullets.at(-1).id;
  let turned=false;run(d,1.6,()=>{if(d.bullets.find(q=>q.id===id)?.turned)turned=true;});
  assert.ok(turned);
});

test('rings between decks reward a brave crossing with power',()=>{
  const d=arena();const p=d.players[0];p.power=10;
  const x=d.worldX(p)+30,span=zoneSpan(d.terrain,0,x);
  d.pickups.push({id:5,type:'ring',x,y:(span.top+span.bottom)/2});
  d.press(0,'up');run(d,.4);
  assert.ok(p.power>=10+S.ringPower);
});

test('health caps at full, hazards hurt, dash moves you ahead, falling behind costs health',()=>{
  const d=arena();const p=d.players[0];
  p.hp=90;d.collect(p,{type:'health'});assert.equal(p.hp,S.maxHp);
  const spikes={id:5,type:'spikes',lane:0,x:d.worldX(p)+30,w:80,hp:18};spikes.shapes=G.hazardShapes(d.terrain,spikes);d.hazards.push(spikes);
  run(d,.6);assert.equal(p.hp,S.maxHp-16);
  const e=arena();const q=e.players[0];q.power=50;const before=q.offset;e.press(0,'dash');run(e,.5);assert.ok(q.offset>before+100);
  q.offset=S.minOffset+1;q.vx=-500;run(e,.2);assert.ok(types(e).includes('behind'));
});

test('a knockout wins the round; two rounds win the match; overtime ends stalemates',()=>{
  const d=fight();
  d.hurt(d.players[1],200,0,'shot');d.step();assert.deepEqual(d.wins,[1,0]);
  run(d,S.roundOver+.1);assert.equal(d.players[1].hp,S.maxHp);
  run(d,S.countdown+.1);d.hurt(d.players[1],200,0,'shot');d.step();run(d,S.roundOver+.1);
  assert.equal(d.phase,'matchover');assert.equal(d.matchWinner,0);
  d.restartMatch();assert.deepEqual(d.wins,[0,0]);
  const e=arena();run(e,S.roundSeconds+S.maxHp/S.overtimeDrain+1);assert.notEqual(e.phase,'fight');
});

test('level director never blocks all three decks, and floating objects never touch running pilots',()=>{
  for(let seed=1;seed<=30;seed++){
    const d=new Duel({seed});d.camX=0;
    while(d.nextX<50000)d.generateBeat();
    for(let x=S.runway;x<50000;x+=10){
      const blocked=new Set();
      for(const h of d.hazards){
        if(!h.shapes||h.type==='boost'||x<h.x-S.radius||x>h.x+h.w+S.radius)continue;
        if(h.type==='laser')h.lanes.forEach(l=>blocked.add(l));else blocked.add(h.lane);
      }
      for(const g of d.gaps)if(x>g.x&&x<g.x+g.w)blocked.add(g.surface);
      assert.ok(blocked.size<3,`seed ${seed} blocks every deck at ${x}`);
    }
    for(const h of d.hazards)if(h.type==='rock'||h.type==='gate')for(const lane of [0,1,2])for(let dx=-80;dx<=80;dx+=10)for(const time of [0,.3,.7,1.1])
      assert.ok(!hazardTouches(h,h.x+dx,laneY(d.terrain,lane,h.x+dx),S.radius-2,time),`seed ${seed}: ${h.type} touches lane ${lane}`);
    for(const g of d.gaps)if(g.surface!==1)for(const m of d.gaps)if(m.surface===1)assert.ok(g.x+g.w<m.x||m.x+m.w<g.x);
  }
});

test('snapshots are compact JSON with finite numbers',()=>{
  const d=fight(3);
  let largest=0;
  run(d,12,(x,i)=>{x.hold(0,true);x.hold(1,true);if(i===200){x.players[0].inventory=['well','echo'];x.players[1].inventory=['comet','blades'];x.press(0,'power');x.press(1,'power');x.press(1,'use0');}if(i===400)x.press(0,'power');if(i%30===0)largest=Math.max(largest,JSON.stringify(x.snapshot()).length);});
  assert.ok(largest<9000,`snapshot ${largest} bytes`);
  for(const p of JSON.parse(JSON.stringify(d.snapshot())).players)for(const k of ['x','y','hp','power','ammo','inv'])assert.ok(Number.isFinite(p[k]),k);
});

test('names and avatars are sanitised',()=>{
  const d=new Duel({players:[{name:'<b>Zed</b>!!',avatar:'nope'},{}]});
  assert.equal(d.players[0].name,'bZedb');assert.equal(d.players[0].avatar,'orbit');assert.equal(d.players[1].name,'Player 2');
  assert.ok(!G.POWER_IDS.includes('swap'),'Swap Shift is removed');
});
