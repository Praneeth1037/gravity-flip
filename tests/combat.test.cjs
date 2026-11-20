const {test}=require('node:test');const assert=require('node:assert/strict');
const E=require('../engine.js'),S=E.SETTINGS;
function clear(){const r=new E.Run();r.obstacles=[];r.targets=[];r.collectibles=[];r.nextX=1e9;return r;}
function step(r,seconds,fire=false){for(let i=0;i<seconds/S.fixedStep;i++){if(fire)r.shoot();r.step(S.fixedStep);}}
test('machine gun consumes limited ammo, waits for distance refills, and caps reserves',()=>{
 const r=clear();assert.equal(r.ammo,48);step(r,4,true);assert.equal(r.shots,48);assert.equal(r.ammo,0);assert.ok(!r.shoot());
 const before=r.shots;step(r,.2,true);assert.equal(r.shots,before,'waiting alone before the checkpoint adds no ammo');
 while(r.meters<150)r.step(S.fixedStep);
 assert.equal(r.ammo,32);assert.equal(r.nextAmmoAt,300);assert.equal(r.drainEvents().filter(e=>e.type==='ammo').length,1);
 r.step(S.fixedStep);assert.equal(r.ammo,32,'checkpoint awarded once');
 const crate={type:'ammo',x:0,y:r.y};r.collect(crate);r.collect(crate);assert.equal(r.ammo,56,'crate awarded once');
 for(let i=0;i<10;i++)r.collect({type:'ammo',x:0,y:r.y});assert.equal(r.ammo,96);
 assert.equal(new E.Run().ammo,48,'retry starts with a fresh magazine');
});
test('Overdrive supplies ammo and spends one round per triple-shot burst',()=>{
 const r=clear();r.ammo=0;r.collect({type:'overdrive',x:0,y:r.y});assert.equal(r.ammo,24);assert.ok(r.shoot());assert.equal(r.ammo,23);assert.equal(r.bullets.length,3);
 const before=r.shots;step(r,1,true);assert.ok(r.shots>=before+19&&r.shots<=before+20);assert.ok(r.bullets.length<60);
});
function machine(id,x){return {id,kind:'moving',x,width:52,radius:26,phase:0,terrain:false};}
function travelBullet(r,seconds){for(let t=0;t<seconds;t+=S.fixedStep)r.stepWeapons(S.fixedStep);}
test('piercing pickup penetrates three machines, uses its own finite magazine, then falls back to regular ammo',()=>{
 const r=clear();r.y=313;r.obstacles=[machine(1,130),machine(2,200),machine(3,270),machine(4,340)];
 const pickup={type:'pierce',x:0,y:313};r.collect(pickup);r.shoot();r.collect(pickup);assert.equal(r.specialAmmo,17);assert.equal(r.ammo,48);
 travelBullet(r,.3);assert.equal(r.kills,3);assert.ok(!r.obstacles[3].destroyed);assert.equal(r.bullets.length,0);
 for(let i=0;i<17;i++){r.shotTimer=0;r.shoot();}assert.equal(r.specialAmmo,0);r.shotTimer=0;r.shoot();assert.equal(r.ammo,47);assert.equal(r.bullets.at(-1).type,'standard');
});
test('plasma destroys nearby machinery once without affecting distant obstacles or terrain gaps',()=>{
 const r=clear();r.y=313;r.obstacles=[machine(1,160),machine(2,210),machine(3,450),{id:4,kind:'gap-floor',x:150,width:230,terrain:true}];
 const openings=E.surfaceOpenings(r.obstacles);r.collect({type:'plasma',x:0,y:313});r.shoot();travelBullet(r,.4);
 assert.equal(r.kills,2);assert.equal(r.rewardStars,2);assert.ok(!r.obstacles[2].destroyed);assert.deepEqual(E.surfaceOpenings(r.obstacles),openings);
 assert.equal(r.drainEvents().filter(e=>e.type==='explosion').length,1);travelBullet(r,1);assert.equal(r.kills,2);
});
test('aimed projectiles hit bobbing bonus drones and pay a bounty once',()=>{
 const r=clear();r.targets=[{id:1,x:200,y:425,phase:0}];r.shoot();step(r,.3);assert.equal(r.kills,1);assert.equal(r.rewardStars,3);assert.equal(r.bonus,25);step(r,.5);assert.equal(r.kills,1);
});
test('mechanical obstacles take three hits; broken geometry does not refill platform gaps',()=>{
 const r=clear(),o={id:2,kind:'floor-tower',x:230,width:90,rise:100,terrain:true,awarded:false,minClearance:Infinity};r.obstacles=[o];
 const before=E.surfaceOpenings(r.obstacles);step(r,.55,true);assert.ok(r.alive);assert.ok(o.destroyed);assert.equal(r.rewardStars,1);assert.deepEqual(E.surfaceOpenings(r.obstacles),before);assert.equal(r.kills,1);
});
test('machine-gun bullets shatter spikes but cannot remove voids',()=>{
 const r=clear(),o={id:0,kind:'floor',x:230,width:90,height:64,terrain:true,awarded:false,minClearance:Infinity};r.obstacles=[o];step(r,.7,true);assert.ok(o.destroyed);assert.ok(r.alive);assert.equal(r.kills,1);
 const event=r.drainEvents().find(e=>e.type==='destroy');assert.ok(event.parts.length>=6&&event.parts.every(p=>p.triangle),'shards originate from the spike artwork');
 const gap={id:2,kind:'gap-floor',x:10,width:90,terrain:true};assert.ok(!E.destructible(gap));
});
test('Gold Rush doubles reward stars and combat bonuses while preserving pickup counts',()=>{
 const r=clear();r.collect({type:'double',x:0,y:r.y});r.collect({type:'star',x:0,y:r.y});assert.equal(r.stars,1);assert.equal(r.rewardStars,1);
 const target={id:1,x:200,y:425,phase:0};r.targets=[target];r.shoot();step(r,.3);assert.equal(r.rewardStars,7);assert.equal(r.bonus,50);
 const duplicate={type:'star',x:0,y:r.y};r.collect(duplicate);r.collect(duplicate);assert.equal(r.stars,2);
 step(r,10);assert.equal(r.powers.double,0);assert.equal(r.powers.overdrive,0);
});
test('three rapid destructions award a separate combo reward exactly once',()=>{
 const r=clear();for(let i=0;i<3;i++)r.bounty(100,300,3,25);assert.equal(r.rewardStars,14);assert.equal(r.kills,3);assert.equal(r.drainEvents().filter(e=>e.type==='bounty-chain').length,1);
});
