const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {chromium}=require('@playwright/test');
const port=5197,url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port)},stdio:'ignore'});
const output=path.resolve(__dirname,'../artifacts');fs.mkdirSync(output,{recursive:true});
let browser,checks=0;const errors=[];
const check=(condition,description)=>{assert.ok(condition,description);checks++;console.log('✓ '+description);};
const snapshot=p=>p.evaluate(()=>GravityFlip.snapshot());
async function fresh(options={}){const context=await browser.newContext({viewport:{width:1440,height:900},...options});await context.addInitScript(()=>{Math.random=()=>1/4294967296;});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.clock.install();await p.goto(url);return p;}
async function tick(p,ms){await p.clock.runFor(ms);}
async function play(p){await p.locator('#play').click();check((await snapshot(p)).state==='ready','Home opens Ready');await p.locator('#launch').click();await tick(p,30);}
(async()=>{
 try{
  for(let i=0;i<50;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  browser=await chromium.launch({channel:'chrome',headless:true});
  const p=await fresh();await p.screenshot({path:output+'/home-desktop.png'});
  check((await snapshot(p)).state==='home','opens on Home');check((await p.locator('.home-controls').innerText()).includes('SPACE')&&(await p.locator('.home-controls').innerText()).includes('Fire'),'home explains Space to jump and F to fire');
  await play(p);check((await snapshot(p)).flips===0,'menu clicks never flip gravity');
  const startPose=(await snapshot(p)).pose;await tick(p,80);const runningPose=(await snapshot(p)).pose;check(runningPose.phase>startPose.phase&&runningPose.legs.some(l=>l.stance),'running cadence advances with a planted leg');
  await p.keyboard.press('Space');check((await snapshot(p)).gravity===-1,'Space flips up immediately');await tick(p,80);{const f=await snapshot(p);check(f.pose.angle<-.05&&!f.pose.grounded,'ascent visibly tilts the articulated avatar');}await p.screenshot({path:output+'/runner-ascent-desktop.png'});await tick(p,420);
  {const f=await snapshot(p);check(f.y===f.bounds.top,'safe ceiling landing on the current rail');check(f.pose.grounded&&f.pose.inversion===-1&&Math.cos(f.pose.angle)>.6,'ceiling landing inverts the running rig');}
  await p.keyboard.press('ArrowUp');await tick(p,500);{const f=await snapshot(p);check(f.y===f.bounds.bottom,'Arrow Up flips down and follows the floor contour');check(f.pose.grounded&&f.pose.inversion===1&&f.pose.angle===f.pose.slope,'floor landing returns the rig upright');}
  await p.mouse.click(1000,400);check((await snapshot(p)).flips===3,'mouse click flips once');
  await p.keyboard.press('p');const paused=await snapshot(p);await tick(p,2000);check((await snapshot(p)).distance===paused.distance,'P pauses distance and physics');
  await p.locator('#resume').click();await tick(p,100);check((await snapshot(p)).state==='playing','explicit Resume works');
  await p.keyboard.press('Escape');check((await snapshot(p)).state==='paused','Escape pauses');
  await p.locator('#resume').click();await p.locator('#sound').click();const afterSound=await snapshot(p);check(!afterSound.save.sound&&afterSound.flips===3,'persistent sound toggle does not flip');
  await p.locator('#pause').click();check((await snapshot(p)).state==='paused','HUD pause button works');
  await p.locator('#paused [data-home]').click();check((await snapshot(p)).state==='home','pause Home navigation works');
  const banked=(await snapshot(p)).save.best;await p.reload();check(!(await snapshot(p)).save.sound&&(await snapshot(p)).save.best===banked,'best and sound preference survive reload');
  await play(p);for(let i=0;i<110&&(await snapshot(p)).state==='playing';i++)await tick(p,50); // Crash into the first floor obstacle with no flips.
  check((await snapshot(p)).state==='over','hazard contact ends the run');
  check(await p.locator('#retry').isDisabled(),'crash cooldown blocks accidental restart');
  await p.mouse.click(1000,400);await p.keyboard.press('Space');check((await snapshot(p)).state==='over','crash-adjacent playfield click or Space cannot restart');
  await tick(p,700);await p.screenshot({path:output+'/game-over-desktop.png'});
  const best=(await snapshot(p)).save.best;check(best>0,'crash persists best distance');
  await p.locator('#retry').click();check((await snapshot(p)).state==='playing'&&(await snapshot(p)).meters===0,'Retry starts immediately without reload');
  check((await snapshot(p)).previousBest===best,'previous best is retained as a run marker');
  await tick(p,2200);await p.screenshot({path:output+'/playing-desktop.png'});
  // Visibility event follows the same browser callback; the real property cannot be assigned normally.
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  check((await snapshot(p)).state==='paused','hidden tab pauses');
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await tick(p,200);check((await snapshot(p)).state==='paused','visible tab requires explicit resume');
  const beforeResize=await snapshot(p);await p.setViewportSize({width:390,height:844});check((await snapshot(p)).y===beforeResize.y,'resizing preserves physics and collisions');
  await p.locator('#resume').click();await tick(p,30);await p.screenshot({path:output+'/playing-mobile.png'});
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),'mobile playfield fits without scrolling');
  await p.close();
  const mobile=await fresh({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
  await mobile.screenshot({path:output+'/home-mobile.png'});await mobile.locator('#play').tap();await mobile.touchscreen.tap(25,350);await tick(mobile,30);
  check((await snapshot(mobile)).state==='playing'&&(await snapshot(mobile)).flips===0,'first playfield touch launches the safe intro');
  await mobile.touchscreen.tap(250,400);await tick(mobile,50);check((await snapshot(mobile)).flips===1,'touch plus compatibility mouse events produce exactly one flip');
  await mobile.touchscreen.tap(250,400);await tick(mobile,50);check((await snapshot(mobile)).flips===2,'second touch immediately reverses movement');
  await mobile.locator('#pause').tap();await tick(mobile,100);check((await snapshot(mobile)).flips===2&&(await snapshot(mobile)).state==='paused','mobile menu buttons never flip');
  await mobile.locator('#paused [data-home]').tap();
  await mobile.evaluate(()=>localStorage.setItem('gravity-flip-v1',JSON.stringify({best:200,totalStars:17,selected:'pebble',sound:false})));await mobile.reload();
  check(await mobile.locator('[data-avatar=pebble]').getAttribute('aria-pressed')==='true','earned avatar selection restores');
  await mobile.locator('[data-avatar=wisp]').tap();await mobile.reload();check((await snapshot(mobile)).save.selected==='wisp','selected unlocked cosmetic persists');
  await mobile.locator('[data-avatar=astro]').tap();check((await snapshot(mobile)).save.selected==='wisp','locked cosmetic cannot be selected');
  await mobile.evaluate(()=>localStorage.setItem('gravity-flip-v1','invalid JSON'));await mobile.reload();check((await snapshot(mobile)).save.best===0,'invalid localStorage recovers gracefully');
  await mobile.emulateMedia({reducedMotion:'reduce'});check((await snapshot(mobile)).reducedMotion,'reduced-motion preference is honored');
  await mobile.close();
  const small=await fresh({viewport:{width:320,height:568}});await small.screenshot({path:output+'/home-small.png'});
  const title=await small.locator('#title').boundingBox(),topbar=await small.locator('.topbar').boundingBox();check(title.y>=topbar.y+topbar.height,'enlarged title clears the header on small mobile');
  for(const selector of ['#play','#avatars','.cosmetic-note']){
    await small.locator(selector).scrollIntoViewIfNeeded();const b=await small.locator(selector).boundingBox(),footer=await small.locator('footer').boundingBox();
    check(b.x>=0&&b.x+b.width<=320&&b.y>=74&&b.y+b.height<footer.y,selector+' remains accessible in the larger scrollable menu');
  }
  await small.locator('#home').evaluate(el=>el.scrollTop=0);
  await small.setViewportSize({width:844,height:390});await tick(small,50);await small.screenshot({path:output+'/home-landscape.png'});
  for(const selector of ['#play','#avatars']){const b=await small.locator(selector).boundingBox();check(b.y>=0&&b.y+b.height<=390,selector+' fits landscape');}
  await play(small);
  for(const viewport of [{width:844,height:390},{width:320,height:568}]){
    await small.setViewportSize(viewport);await tick(small,50);
    const s=await snapshot(small),box=await small.locator('#flight-status').boundingBox();
    const top=s.view.oy+60*s.view.scale,bottom=s.view.oy+550*s.view.scale;
    check(box.y+box.height<=top||box.y>=bottom,'status strip clears both landing lanes at '+viewport.width+'×'+viewport.height);
  }
  await small.close();
  const flight=await fresh({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await play(flight);
  const seenPowers=new Set(),seenKinds=new Set(),captured=new Set(),seenRides=new Set();let sawAttraction=false,sawFloorGap=false,sawRoofGap=false,alwaysForward=true,sawBlend=false;let priorGaps=[],gapChecks=0;const rushSizes=new Set();let sawCleanRush=false;
  for(let i=0;i<850;i++){
    const f=await snapshot(flight);
    if(f.collectibles.some(s=>s.attracted&&!s.collected&&s.path?.length>2)){sawAttraction=true;if(!captured.has('magnet-flight')){await flight.screenshot({path:output+'/magnet-flight-mobile.png'});captured.add('magnet-flight');}}
    assert.equal(f.state,'playing','extended flight stays alive');
    for(const g of priorGaps)if(g.to>=f.distance-f.view.w*.23-40){assert.ok(f.openings.some(now=>now.id===g.id&&now.side===g.side&&now.from===g.from&&now.to===g.to),'visible gaps never reconnect behind the player');gapChecks++;}
    priorGaps=f.openings;
    if(f.rush){rushSizes.add(f.rush.total);if(f.rush.done&&f.rush.clean)sawCleanRush=true;if(!f.rush.done&&!captured.has('rush')){await flight.screenshot({path:output+'/flip-rush-mobile.png'});captured.add('rush');}}
    if(f.theme.mix>0&&f.theme.mix<1){sawBlend=true;if(!captured.has('theme-blend')){await flight.screenshot({path:output+'/theme-blend-mobile.png'});captured.add('theme-blend');}}
    alwaysForward=alwaysForward&&f.pose.facing===1&&(f.ride||Math.cos(f.pose.angle)>.6);if(f.ride)seenRides.add(f.ride.kind==='twist'?'twist':f.ride.kind.split('-')[0]);
    sawFloorGap=sawFloorGap||f.openings.some(g=>g.major&&g.side==='bottom');sawRoofGap=sawRoofGap||f.openings.some(g=>g.major&&g.side==='top');
    if(!captured.has('open-gap')&&f.openings.some(g=>g.major&&g.from>f.distance&&g.from-f.distance<240)){await flight.screenshot({path:output+'/open-gap-mobile.png'});captured.add('open-gap');}

    for(const [key,value] of Object.entries(f.powers))if(value>0)seenPowers.add(key);
    for(const o of f.obstacles)seenKinds.add(o.kind);
    const next=f.obstacles.find(o=>o.x+o.width+17>=f.distance&&!o.destroyed);
    if(next&&next.x-f.distance<380){
      let desired=/^(loop|spiral)-|^twist$/.test(next.kind)?(next.kind==='twist'?f.gravity:next.kind.endsWith('-floor')?1:-1):next.kind.endsWith('-floor')||next.kind==='floor'||next.kind==='floor-tower'||next.kind==='piston-floor'?-1:next.kind.endsWith('-ceiling')||next.kind==='ceiling'||next.kind==='ceiling-tower'||next.kind==='piston-ceiling'?1:f.gravity;
      // On structures with two clear lanes, choose the visible collectible route.
      if(['bridge','arch','moving'].includes(next.kind)){
        const reward=f.collectibles.find(s=>!s.collected&&s.x>=next.x-160&&s.x<=next.x+next.width);
        if(reward)desired=reward.y>300?1:-1;
      }
      if(desired!==f.gravity)await flight.keyboard.press('Space');
    }
    await tick(flight,100);
    if(f.sector>0&&!captured.has(f.sector)&&next&&next.x-f.distance<220){await flight.screenshot({path:output+'/sector-'+f.sector+'-mobile.png'});captured.add(f.sector);}
    if(next&&['bridge','arch','piston-floor','piston-ceiling','comb-floor','comb-ceiling','crusher-floor','crusher-ceiling','wheel-floor','wheel-ceiling','orbit-floor','orbit-ceiling','pendulum-floor','pendulum-ceiling'].includes(next.kind)&&next.x-f.distance<210&&!captured.has(next.kind)){await flight.screenshot({path:output+'/'+next.kind+'-mobile.png'});captured.add(next.kind);}
    if(i===150){await flight.keyboard.press('p');const frozen=await snapshot(flight);await tick(flight,1200);check(JSON.stringify((await snapshot(flight)).powers)===JSON.stringify(frozen.powers),'pause freezes power-up timers');await flight.locator('#resume').click();}
  }
  const finish=await snapshot(flight);check(seenRides.size>=2&&finish.rides>=2,'loops, spirals and twists are ridden in actual play (rode: '+[...seenRides].join(', ')+')');check(gapChecks>100,'passed gaps remain disconnected across hundreds of rendered frames');check(rushSizes.has(3)&&rushSizes.has(4)&&sawCleanRush,'three- and four-hurdle rushes are playable and award a clean clear');check(sawFloorGap&&sawRoofGap,'floor gaps and disconnected overhead decks occur in actual play');check(alwaysForward,'the character faces forward throughout transfers and slope landings');check(sawAttraction,'magnet stars visibly travel toward the avatar before collection');check(finish.speed>285,'pace increases above the faster starting speed');check(finish.difficulty.level===8,'distance progression reaches the highest threat level');check(finish.sector===3,'all four station areas reached in actual gameplay');
  check(seenKinds.size>=8,'architectural and moving obstacle types render during play');check(sawBlend,'area changes pass through intermediate color and scenery blends');check([...seenKinds].some(k=>k.startsWith('crusher-')),'twin crushers appear in actual play');check([...seenKinds].some(k=>k.startsWith('orbit-'))&&[...seenKinds].some(k=>k.startsWith('pendulum-')),'orbit arrays and swinging pendulums appear during actual play');
  check(['shield','magnet','slow','overdrive','double'].every(k=>seenPowers.has(k)),'all five power-ups collected through real controls (seen: '+[...seenPowers].join(', ')+')');
  check(finish.stars>15&&finish.rewardStars>=3&&finish.bonus>0,'star chains and milestone rewards earned during play');
  await flight.keyboard.press('p');await flight.locator('#paused [data-home]').click();const bank=(await snapshot(flight)).save.totalStars;
  check(bank===finish.stars+finish.rewardStars,'collected and milestone stars bank exactly once');await flight.reload();check((await snapshot(flight)).save.totalStars===bank,'earned rewards persist after reload');
  await flight.close();
  const fall=await fresh();await play(fall);
  for(let i=0;i<120&&(await snapshot(fall)).state==='playing';i++){
    const f=await snapshot(fall),next=f.obstacles.find(o=>o.x+o.width+17>=f.distance);
    if(next&&next.id<2&&next.x-f.distance<300){const desired=next.kind==='floor'?-1:1;if(desired!==f.gravity)await fall.keyboard.press('Space');}
    await tick(fall,100);
  }
  const missed=await snapshot(fall);check(missed.state==='over'&&missed.y>670,'missing the first floor gap falls into the void and ends the run');await tick(fall,700);await fall.locator('#retry').click();check((await snapshot(fall)).state==='playing'&&(await snapshot(fall)).meters===0,'retry after a void fall restores the safe starting platform');await fall.close();
  const combat=await fresh({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await play(combat);
  await combat.keyboard.down('f');await tick(combat,350);let cs=await snapshot(combat);check(cs.shots>=5&&cs.flips===0,'holding F produces a machine-gun stream without flipping');
  await combat.keyboard.press('Space');await tick(combat,400);check((await snapshot(combat)).flips===1&&(await snapshot(combat)).shots>cs.shots,'shooting and gravity flips work together');
  await combat.keyboard.press('p');const frozenCombat=await snapshot(combat);await tick(combat,1200);check((await snapshot(combat)).shots===frozenCombat.shots&&JSON.stringify((await snapshot(combat)).bullets)===JSON.stringify(frozenCombat.bullets)&&(await snapshot(combat)).ammo===frozenCombat.ammo&&(await snapshot(combat)).nextAmmoAt===frozenCombat.nextAmmoAt,'pause freezes projectiles and automatic firing');
  await combat.keyboard.up('f');await combat.locator('#resume').click();await tick(combat,250);check((await snapshot(combat)).shots===frozenCombat.shots,'resume does not leave the blaster held down');
  const fireBox=await combat.locator('#shoot').boundingBox(),touch=await combat.context().newCDPSession(combat);cs=await snapshot(combat);
  const finger={x:fireBox.x+fireBox.width/2,y:fireBox.y+fireBox.height/2,id:1};
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});await tick(combat,250);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger,{x:150,y:400,id:2}]});await tick(combat,100);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check((await snapshot(combat)).shots>cs.shots&&(await snapshot(combat)).flips===cs.flips+1,'two-finger touch supports holding FIRE and tapping to flip without duplicates');
  await combat.keyboard.press('p');await combat.locator('#paused [data-home]').click();await play(combat);await combat.keyboard.down('f');
  let poweredShots=false,combatCaptured=false,sawEmpty=false,sawRefill=false,lastAmmoAt=150;const shotTypes=new Set();
  for(let i=0;i<650;i++){
    const f=await snapshot(combat);assert.equal(f.state,'playing','combat run survives with real controls');
    sawEmpty=sawEmpty||f.ammo+f.specialAmmo===0;if(f.nextAmmoAt>lastAmmoAt)sawRefill=true;lastAmmoAt=f.nextAmmoAt;for(const b of f.bullets)shotTypes.add(b.type);
    const next=f.obstacles.find(o=>o.x+o.width+17>=f.distance);
    if(next&&next.x-f.distance<380){let desired=await combat.evaluate(o=>GravityEngine.safeGravity(o,GravityFlip.snapshot().gravity),next);
      if(['bridge','arch','moving'].includes(next.kind)){const reward=f.collectibles.find(s=>!s.collected&&s.x>=next.x-160&&s.x<=next.x+next.width);if(reward)desired=reward.y>300?1:-1;}
      if(desired!==f.gravity)await combat.keyboard.press('Space');
    }
    if(f.bullets.some(b=>b.powered)){poweredShots=true;if(!combatCaptured){await combat.screenshot({path:output+'/overdrive-combat-mobile.png'});combatCaptured=true;}}
    await tick(combat,100);
  }
  cs=await snapshot(combat);check(cs.shots>150&&cs.shots<1000&&cs.kills>=3&&cs.rewardStars>10,'limited-ammo combat earns bounties while distance and pickups replenish rounds (shots '+cs.shots+', kills '+cs.kills+', reward stars '+cs.rewardStars+')');check(poweredShots,'Overdrive produces rapid triple shots during actual gameplay');check(sawEmpty&&sawRefill,'gun runs dry and refills at distance checkpoints');check(['standard','pierce','plasma'].every(t=>shotTypes.has(t)),'all three bullet types collected and fired through real controls');
  await combat.keyboard.up('f');await combat.keyboard.press('p');await combat.locator('#paused [data-home]').click();const bankCombat=(await snapshot(combat)).save.totalStars;await combat.reload();check((await snapshot(combat)).save.totalStars===bankCombat,'combat rewards persist after returning Home and reloading');
  const audioStats=await combat.evaluate(async()=>{
    const c=new OfflineAudioContext(1,48000,48000),proxy=new Proxy(c,{get(t,key){if(key==='state')return 'running';const v=t[key];return typeof v==='function'?v.bind(t):v;}}),bank=new GravitySound(proxy);
    for(const type of ['flip','shoot','hit','star','power','burst','shield','crash'])bank.play(type,{gravity:-1,chain:3});
    const rendered=await c.startRendering(),data=rendered.getChannelData(0);let peak=0,finite=true,energy=0;for(const v of data){peak=Math.max(peak,Math.abs(v));finite=finite&&Number.isFinite(v);energy+=v*v;}bank.dispose();return {peak,finite,energy};
  });
  check(audioStats.finite&&audioStats.peak>.02&&audioStats.peak<1&&audioStats.energy>1,'layered sound synthesis renders finite, non-clipping audio');await combat.close();
  const noStorage=await browser.newContext();await noStorage.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('disabled');}});});const np=await noStorage.newPage();np.on('pageerror',e=>errors.push(e.message));await np.goto(url);check(await np.locator('#storage-note').isVisible(),'unavailable storage degrades gracefully');await np.locator('#play').click();await np.locator('#launch').click();check((await snapshot(np)).state==='playing','game works without storage');await np.close();
  check(errors.length===0,'no browser console or runtime errors: '+errors.join('; '));
  console.log(`\n${checks} browser checks passed. Screenshots: ${output}`);
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
