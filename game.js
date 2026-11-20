(() => {
  'use strict';
  const E=window.GravityEngine,M=window.GravityMotion,S=E.SETTINGS,$=id=>document.getElementById(id);
  const canvas=$('field'),ctx=canvas.getContext('2d'),abort=new AbortController();
  const SAVE_KEY='gravity-flip-v1';
  let save;try{save=E.readSave(localStorage.getItem(SAVE_KEY));}catch{save=E.readSave(null);$('storage-note').hidden=false;}
  let state='home',run=new E.Run(save.best),raf=0,last=0,accumulator=0,view={w:960,h:600,scale:1,ox:0,oy:0},audio=null,soundBank=null;
  let toastUntil=0,crashAt=0,flipAt=-100,particles=[],trail=[],banked=false,disposed=false,decorTime=0,focusAfter=null;
  let pose=M.createPose(),fireKey=false,firePointer=false,shotAt=-100,novaAt=-100,novaX=0,novaY=0,popups=[],fireCodes=new Set();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal:abort.signal});
  function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{$('storage-note').hidden=false;}}
  function audioInit(){
    if(!save.sound)return;
    try{if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();soundBank=new window.GravitySound(audio);}if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}
  }
  function sound(type,weapon){if(save.sound&&soundBank)soundBank.play(type,{gravity:run.gravity,chain:run.chain,weapon});}
  function fire(){if(state!=='playing')return;audioInit();run.shoot();processEvents();}
  function effect(x,y,color,count=8){
    if(reduced.matches)return;
    for(let i=0;i<count;i++){const angle=i*2.4;particles.push({x:x+playerX()-run.distance,y,vx:Math.cos(angle)*(50+i*4),vy:Math.sin(angle)*(50+i*4),life:.45,maxLife:.45,color,world:true});}
    if(particles.length>120)particles.splice(0,particles.length-120);
  }
  function setSound(){const b=$('sound');b.innerHTML=save.sound?'♪ <span>Sound on</span>':'♩ <span>Sound off</span>';b.setAttribute('aria-label',save.sound?'Turn sound off':'Turn sound on');b.setAttribute('aria-pressed',String(save.sound));}
  function show(next){
    fireKey=false;firePointer=false;fireCodes.clear();$('shoot').classList.remove('firing');$('shoot').hidden=next!=='playing';
    state=next;$('game').dataset.state=next;
    for(const id of ['home','ready','paused','over'])$(id).hidden=id!==next;
    $('flight-status').hidden=!['playing','paused'].includes(next);$('hud').hidden=next!=='playing';$('pause').hidden=next!=='playing';
    $('phase-label').textContent={home:'FLIGHT DECK',ready:'READY TO LAUNCH',playing:'IN FLIGHT',paused:'PAUSED',over:'FLIGHT COMPLETE'}[next];
    last=0;accumulator=0;
    if(next==='home'){refreshHome();focusAfter=$('play');}
    else if(next==='ready')focusAfter=$('launch');
    else if(next==='paused')focusAfter=$('resume');
    else if(next==='playing')focusAfter=canvas;
    if(focusAfter){focusAfter.focus({preventScroll:true});focusAfter=null;}
  }
  function reset(){run=new E.Run(save.best);pose=M.createPose();particles=[];trail=[];popups=[];shotAt=-100;novaAt=-100;banked=false;flipAt=-100;toastUntil=0;$('toast').textContent='';updateHUD();}
  function launch(){audioInit();reset();show('playing');toast('A little runway. Get a feel for the flip.',2500);}
  function bank(){if(banked)return;banked=true;save.best=Math.max(save.best,run.meters);save.totalStars+=run.stars+run.rewardStars;persist();}
  function home(){if(state==='playing'||state==='paused')bank();show('home');}
  function pause(reason){if(state!=='playing')return;$('pause-reason').textContent=reason||'Your run is right where you left it.';show('paused');}
  function resume(){if(state==='paused'){audioInit();show('playing');}}
  function flip(){if(state==='ready'){launch();return;}if(state!=='playing')return;audioInit();run.flip();processEvents();}
  function toast(message,ms=1500){if(state==='playing')return;$('toast').textContent=message;toastUntil=performance.now()+ms;}
  function crash(){
    const oldStars=save.totalStars,newBest=run.meters>save.best;
    crashAt=performance.now();trail=[];bank();sound('crash');
    if(!reduced.matches)for(let i=0;i<12;i++)particles.push({x:playerX(),y:run.y,vx:Math.cos(i*2.4)*80,vy:Math.sin(i*2.4)*100,life:.5,color:i%2?'#ff898c':'#81e9ea'});
    $('result-label').textContent=newBest?'A NEW PERSONAL BEST':'FLIGHT COMPLETE';
    $('result-distance').textContent=run.meters+' m';$('result-best').textContent=save.best+' m';$('result-stars').textContent='✦ '+run.stars;
    $('result-bonus').textContent=`${run.score} points · ${run.bonus} bonus points · +${run.rewardStars} reward stars`;
    const unlocked=E.AVATARS.filter(a=>a.cost>oldStars&&a.cost<=save.totalStars);
    $('unlock-message').textContent=unlocked.length?unlocked.map(a=>a.name).join(' & ')+' unlocked in your hangar!':'Every flight is a fresh start.';
    $('retry').disabled=true;show('over');
  }
  function processEvents(){for(const e of run.drainEvents()){
    if(e.type==='flip'){flipAt=run.time;sound('flip');}
    if(e.type==='star'){if(!reduced.matches)$('stars').animate([{color:'#fff',filter:'brightness(1.7)'},{color:'#ffd076',filter:'brightness(1)'}],{duration:180});sound('star');effect(e.x,e.y,'#ffe3a0',3);}
    if(e.type==='shoot'){shotAt=run.time;pose.recoil=e.weapon==='rail'||e.weapon==='scatter'?1.5:1;sound('shoot',e.weapon);if(!reduced.matches)particles.push({x:playerX()+12,y:e.y,vx:-65,vy:-run.gravity*65,life:.22,color:'#ffc977',world:true});}
    if(e.type==='destroy'&&!reduced.matches){for(let i=0;i<e.parts.length;i++){const p=e.parts[i],a=i*2.4;particles.push({...p,x:p.x+playerX()-run.distance,vx:Math.cos(a)*155,vy:Math.sin(a)*155,life:.65,color:'#ffac97',world:true,shard:true,angle:a,spin:(i%2?1:-1)*6});}if(particles.length>140)particles.splice(0,particles.length-140);}
    if(e.type==='weapon'){sound('power');effect(e.x,e.y,{scatter:'#ffca7c',burst:'#a8ef9e',rail:'#83dbff'}[e.weapon],12);}
    if(e.type==='nova'){sound('burst');novaAt=run.time;novaX=e.x;novaY=e.y;effect(e.x,e.y,'#e3a4ff',22);}
    if(e.type==='explosion'){sound('burst');effect(e.x,e.y,'#ffad7d',18);}
    if(e.type==='ammo'){sound('power');if(e.x!==undefined)effect(e.x,e.y,'#91edb8',7);toast(e.amount?`AMMO +${e.amount} · ${run.ammo} rounds ready`:'AMMO FULL · 96 rounds ready',1700);}
    if(e.type==='hit'){sound('hit');effect(e.x,e.y,'#a7eaff',5);}
    if(e.type==='burst'){sound('burst');effect(e.x,e.y,'#ffce89',12);}
    if(e.type==='bounty-chain'){sound('reward');toast(`BLASTER COMBO · +${e.stars} stars`,1500);}

    if(e.type==='power'){sound('power');effect(e.x,e.y,'#bdefff',10);toast({shield:'◇ Shield ready · blocks one hit',magnet:'⊂ Star magnet · 8 seconds',slow:'◷ Slow time · 6 seconds',overdrive:'⌖ OVERDRIVE · triple shots + 24 ammo · 8 seconds',pierce:'⇥ PIERCING · 18 rounds · punches through 3 targets',plasma:'✺ PLASMA · 18 explosive rounds · splash damage',double:'✦ GOLD RUSH · double stars and bounties · 10 seconds'}[e.power],1800);}
    if(e.type==='shield-break'){sound('shield');toast('SHIELD SAVED YOU · keep flying',1800);}
    if(e.type==='chain'){sound('power');toast(`STAR CHAIN ×${e.count}  +${e.bonus} points`,1400);}
    if(e.type==='milestone'){sound('power');toast(`${e.meters} m MILESTONE  +${e.stars} bonus stars`,2200);}
    if(e.type==='difficulty')toast('THREAT LEVEL '+e.level+' · stay sharp',1600);
    if(e.type==='sector')toast('ENTERING '+e.name.toUpperCase(),2200);
    if(e.type==='rush-start'){sound('power');toast(`FLIP RUSH · ${e.total} alternating hurdles · clear clean for bonus stars`,2400);}
    if(e.type==='rush-complete'){if(e.clean)sound('power');toast(e.clean?`RUSH CLEARED! +${e.stars} stars · +${e.bonus} points`:'RUSH SURVIVED · clear without shield hits for a bonus',2200);}
    if(e.type==='near')toast('CLOSE CALL  +'+e.bonus+' points',1200);
    if(e.type==='crash')crash();
  }}
  function updateHUD(){
    $('distance').textContent=run.meters;$('stars').textContent=run.stars;
    $('sector-name').textContent=E.SECTORS[run.sector].name.toUpperCase();$('speed-value').textContent=Math.round(run.speed/S.baseSpeed*100)+'%';
    const special=run.specialAmmo>0,available=special?run.specialAmmo:run.ammo,mode=special?({scatter:'SCATTER',burst:'BURST',rail:'RAIL'}[run.weapon]||(run.bulletType==='pierce'?'PIERCE':'PLASMA')):'ROUNDS';
    $('ammo').textContent=available+' '+mode;$('refill-distance').textContent='+32 in '+Math.max(0,run.nextAmmoAt-run.meters)+' m';
    $('shoot').title=`${available} ${mode.toLowerCase()}${special?` · ${run.ammo} regular rounds in reserve`:''}. Next ammo refill at ${run.nextAmmoAt} m.`;
    $('shoot').classList.toggle('boosted',special||run.powers.overdrive>0);$('shoot').classList.toggle('empty',!available);$('shoot').classList.toggle('firing',!!available&&(fireKey||firePointer));
    const badges=[run.powers.phase>0?`<span class="power-badge phase" aria-label="Phase shift" title="Phase shift">◌ ${Math.ceil(run.powers.phase)}s</span>`:'',run.powers.overdrive>0?`<span class="power-badge overdrive">⌖ ${Math.ceil(run.powers.overdrive)}s</span>`:'',run.powers.double>0?`<span class="power-badge double">✦ ×2 ${Math.ceil(run.powers.double)}s</span>`:'',run.powers.shield?'<span class="power-badge">◇ 1</span>':'',run.powers.magnet>0?`<span class="power-badge magnet">⊂ ${Math.ceil(run.powers.magnet)}s</span>`:'',run.powers.slow>0?`<span class="power-badge slow">◷ ${Math.ceil(run.powers.slow)}s</span>`:''].join('');
    if($('active-powers').innerHTML!==badges)$('active-powers').innerHTML=badges;
    $('chain-status').textContent=run.rush&&!run.rush.done?'◆ '+run.rush.cleared+'/'+run.rush.total:run.chain>1?'✦ ×'+run.chain:'';
  }
  function playerX(){return view.w*.23;}
  function resize(){
    const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,3);
    canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
    view.w=Math.max(S.minimumWidth,Math.min(S.maximumWidth,S.height*r.width/r.height));
    view.scale=Math.min(r.width/view.w,r.height/S.height);view.ox=(r.width-view.w*view.scale)/2;view.oy=(r.height-S.height*view.scale)/2;view.dpr=dpr;
    // Geometry and world-space travel are unchanged by resize; only the camera changes.
    trail=[];
  }
  function round(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}}
  function ellipse(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();}
  function line(c,x1,y1,x2,y2,color,width=2){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  const runner=(...args)=>window.GravityRig.draw(...args);
  function refreshHome(){
    $('home-best').innerHTML=save.best+' <small>m</small>';$('bank').textContent='✦ '+save.totalStars+' lifetime stars';
    const host=$('avatars');host.replaceChildren();
    for(const a of E.AVATARS){
      const unlocked=save.totalStars>=a.cost,selected=save.selected===a.id;
      const b=document.createElement('button');b.className='avatar-card'+(!unlocked?' locked':'');b.dataset.avatar=a.id;b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-label',a.name+(unlocked?', select copilot':`, unlock at ${a.cost} lifetime stars`));
      const portrait=document.createElement('canvas');portrait.width=600;portrait.height=600;portrait.setAttribute('aria-hidden','true');runner(portrait.getContext('2d'),a.id,300,372,M.createPose(),420);
      b.append(portrait);const n=document.createElement('span');n.className='name';n.textContent=a.name;b.append(n);const cost=document.createElement('span');cost.className='cost';cost.textContent=selected?'SELECTED':unlocked?'READY TO FLY':'✦ '+a.cost+' stars';b.append(cost);
      // Rebuilt cards own their listeners; no retained global reference to removed cards.
      b.onclick=()=>{if(unlocked){save.selected=a.id;persist();refreshHome();host.querySelector(`[data-avatar="${a.id}"]`).focus();}else toast(`${a.name}: ${a.cost-save.totalStars} more lifetime stars to unlock.`,2200);};host.append(b);
    }
    $('avatar-description').textContent=E.AVATARS.find(a=>a.id===save.selected).description;
    const next=E.AVATARS.find(a=>a.cost>save.totalStars),progress=$('unlock-progress');
    $('next-unlock').textContent=next?'Next up: '+next.name:'Your crew is complete';
    $('unlock-count').textContent=next?save.totalStars+' / '+next.cost:'4 / 4';
    progress.max=next?next.cost:4;progress.value=next?save.totalStars:4;
  }
  const backgroundStars=Array.from({length:95},(_,i)=>({x:((i*137.63)%1600),y:110+(i*93.71)%380,r:i%8===0?1.5:.7,alpha:.2+(i%5)*.12}));
  function tunnel(offset,menu){
    const w=view.w,theme=E.themeAt(menu?6000:run.distance);
    const sky=ctx.createLinearGradient(0,0,0,600);sky.addColorStop(0,'#071121');sky.addColorStop(.55,theme.sky);sky.addColorStop(1,'#050c19');ctx.fillStyle=sky;ctx.fillRect(0,0,w,600);
    const drift=reduced.matches?0:offset;
    for(const s of backgroundStars){const x=((s.x-drift*.08)%w+w)%w;ctx.globalAlpha=s.alpha;ellipse(ctx,x,s.y,s.r,s.r,'#b8e5ff');}ctx.globalAlpha=1;
    // Open sky and distant silhouettes stay muted: only bright-edged decks are playable.
    const moonX=w*.78-(drift*.025%180);
    ellipse(ctx,moonX,210,theme.moonRadius,theme.moonRadius,theme.color+'0b');
    ctx.beginPath();ctx.ellipse(moonX,210,120,28,-.35,0,Math.PI*2);ctx.strokeStyle=theme.color+'18';ctx.lineWidth=2;ctx.stroke();
    const spacing=340,backgroundOffset=-(drift*.18%spacing);
    for(const layer of theme.layers){
    const district=layer.index;ctx.save();ctx.globalAlpha=.32*layer.alpha;
    for(let i=-1,x=backgroundOffset-spacing;x<w+spacing;i++,x+=spacing){
      if(district===0){
        const y=420+(i%3)*35;
        round(ctx,x+20,y,180,20,5,'#1c3a50','#3c5a73');
        for(let j=0;j<4;j++){const h=60+((j*47+i*13+300)%100);round(ctx,x+35+j*38,y-h,25,h,3,'#152b42','#2f4c66');}
        line(ctx,x+105,y+20,x+105,640,'#27435a',10);
        for(let j=0;j<3;j++)line(ctx,x+105,y+50+j*40,x+165,y+20+j*40,'#33506a',4);
      }else if(district===1){
        // Detached crane rigs hang above a deep industrial void.
        line(ctx,x+32,55,x+32,190,'#6e6070',9);line(ctx,x+32,66,x+230,66,'#746774',8);
        line(ctx,x+32,150,x+165,66,'#62576e',4);line(ctx,x+196,68,x+196,226,'#697382',2);
        round(ctx,x+157,226,78,44,5,'#3a3448','#78717d');
        ellipse(ctx,x+80,535,55,55,'#28273e');
        for(let j=0;j<5;j++)line(ctx,x+30+j*24,580,x+80,535,'#5b4963',4);
      }else if(district===2){
        // Broken viaducts on tall, separated pylons — no surrounding tunnel shell.
        const y=405+(i%2)*75;
        line(ctx,x+55,y,x+55,640,'#495171',15);line(ctx,x+235,y,x+235,640,'#495171',15);
        ctx.beginPath();ctx.moveTo(x+55,y+100);ctx.quadraticCurveTo(x+140,y-20,x+235,y+100);ctx.strokeStyle='#606285';ctx.lineWidth=7;ctx.stroke();
        line(ctx,x+25,y,x+105,y,'#62688c',10);line(ctx,x+176,y,x+265,y,'#62688c',10);
        for(let j=0;j<4;j++)line(ctx,x+65+j*12,y+10,x+65+j*12,y+70,'#4b5577',2);
      }else{
        ctx.beginPath();ctx.arc(x+150,300,124,-2.9,1.5);ctx.strokeStyle='#3b6d6b';ctx.lineWidth=12;ctx.stroke();
        ctx.beginPath();ctx.arc(x+150,300,102,-1.3,2.7);ctx.strokeStyle='#5a7b84';ctx.lineWidth=3;ctx.stroke();
        for(let j=0;j<5;j++){const a=j*1.25;round(ctx,x+145+Math.cos(a)*125,295+Math.sin(a)*125,22,14,3,'#2c545b','#4f7b80');}
      }
    }ctx.restore();}
    const camera=playerX()-offset,from=-camera-40,to=w-camera+40;
    const openings=menu?[
      {from:2000,to:2200,side:'top'},{from:2450,to:2700,side:'bottom'},
      {from:2950,to:3200,side:'top'},{from:3400,to:3620,side:'bottom'},
    ]:E.surfaceOpenings(run.obstacles);
    for(const side of ['top','bottom']){
      const top=side==='top',direction=top?-1:1,color=top?'#b8b4ff':'#7df6df';
      for(const [start,end] of E.platformSpans(from,to,side,openings)){
        const points=E.terrainVertices(start,end,side),thickness=theme.thickness;
        ctx.save();ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x+camera,y):ctx.moveTo(x+camera,y));
        for(const [x,y] of [...points].reverse())ctx.lineTo(x+camera,y+direction*thickness);ctx.closePath();
        ctx.fillStyle=theme.deck;ctx.fill();ctx.strokeStyle='#56667f';ctx.lineWidth=1;ctx.stroke();ctx.clip();
        for(const layer of theme.layers){const district=layer.index;ctx.globalAlpha=layer.alpha;
        for(let x=Math.floor(start/60)*60;x<end;x+=60){
          const y=E.terrainAt(x)[side];
          if(district===1){line(ctx,x+camera,y+direction*9,x+camera+30,y+direction*37,'#af88694d',7);}
          else if(district===2){line(ctx,x+camera,y+direction*4,x+camera+48,y+direction*24,'#687199',3);}
          else{round(ctx,x+camera+10,y+direction*20-4,34,8,2,'#0d1b2c','#4f667c');line(ctx,x+camera+14,y+direction*20,x+camera+36,y+direction*20,color+'70',2);}
        }}ctx.restore();
        ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x+camera,y):ctx.moveTo(x+camera,y));ctx.strokeStyle=color+'22';ctx.lineWidth=10;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();
        // Real platform ends carry amber beacons; nothing visually bridges a missing span.
        for(const edge of [start,end])if(edge>from+1&&edge<to-1){
          const y=E.terrainAt(edge)[side];line(ctx,edge+camera,y,edge+camera,y+direction*thickness,'#ffd68b',3);
          ellipse(ctx,edge+camera,y-direction*7,3,3,'#ffe3a0');
        }
        // A few small thruster pods reinforce that these are floating islands, not solid walls.
        if(end-start>120){const x=(start+end)/2,y=E.terrainAt(x)[side]+direction*(thickness+5);
          round(ctx,x+camera-15,y-5,30,10,3,'#142a3a','#435b73');line(ctx,x+camera-7,y+direction*8,x+camera+7,y+direction*8,color+'88',3);
        }
      }
    }
    for(const gap of openings)if(gap.major&&gap.from+camera<w&&gap.to+camera>0){
      const x=gap.from+camera,y=E.terrainAt(gap.from)[gap.side]+(gap.side==='bottom'?-28:32);
      ctx.fillStyle='#ffda98';ctx.textAlign='right';ctx.font='bold 11px ui-sans-serif, sans-serif';ctx.font='bold 22px ui-sans-serif, sans-serif';ctx.fillText(gap.side==='bottom'?'⇡':'⇣',x-12,y);
    }
    if(menu){ctx.fillStyle='#060e1b99';ctx.fillRect(0,0,w,600);}
  }
  function star(x,y,r,color){ctx.save();ctx.translate(x,y);ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.43:r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.restore();}
  function drawRoundHazard(o,camera){
    const bodies=E.circles(o,run.time),b=E.localBounds(o),floor=o.kind.endsWith('-floor'),direction=floor?-1:1,base=floor?b.bottom:b.top,cx=o.x+o.width/2+camera;
    ctx.save();if(o.destroyed)ctx.globalAlpha=.18;
    if(o.kind.startsWith('orbit-')){
      const hub=bodies[0],orbit=Math.min(54,(b.gap-115)/2-20);
      ctx.setLineDash([3,6]);ctx.beginPath();ctx.arc(cx,hub.y,orbit,0,Math.PI*2);ctx.strokeStyle='#ffb29899';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
      for(const orb of bodies.slice(1))line(ctx,cx,hub.y,orb.x+camera,orb.y,'#ef899b55',3);
    }else if(o.kind.startsWith('pendulum-')){
      const length=Math.min(145,b.gap-168,(o.width/2-37)/Math.sin(.85)),py=base+direction*29;
      ctx.setLineDash([3,6]);ctx.beginPath();ctx.arc(cx,py,length,floor?-Math.PI/2-.85:Math.PI/2-.85,floor?-Math.PI/2+.85:Math.PI/2+.85);ctx.strokeStyle='#ffb29899';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
      line(ctx,cx,py,bodies[0].x+camera,bodies[0].y,'#75879d88',3);ellipse(ctx,cx,py,7,7,'#9babbc');
    }
    for(const c of bodies){
      const x=c.x+camera,y=c.y;
      ellipse(ctx,x,y,c.r+5,c.r+5,'#ff8d8a15');ellipse(ctx,x,y,c.r,c.r,'#e87587');ellipse(ctx,x,y,c.r-4,c.r-4,'#273147');
      ctx.save();ctx.translate(x,y);if(!reduced.matches)ctx.rotate(run.time*(o.kind.startsWith('wheel-')?1.2:-.8)+o.phase);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;line(ctx,Math.cos(a)*c.r*.45,Math.sin(a)*c.r*.45,Math.cos(a)*c.r*.82,Math.sin(a)*c.r*.82,'#ffbd9d',Math.max(2,c.r*.065));}
      ctx.restore();ellipse(ctx,x,y,c.r*.32,c.r*.32,'#172335');ellipse(ctx,x,y,c.r*.13,c.r*.13,'#ffdda7');
    }
    const extent=o.kind.startsWith('wheel-')?bodies[0].r*2:o.kind.startsWith('orbit-')?Math.min(54,(b.gap-115)/2-20)*2+45:Math.min(145,b.gap-168,(o.width/2-37)/Math.sin(.85))+58;
    ctx.restore();
  }
  function drawStructure(o,camera){
    const x=o.x+camera,rects=E.rectangles(o,run.time),piston=o.kind.startsWith('piston'),crusher=o.kind.startsWith('crusher');
    ctx.save();if(o.destroyed)ctx.globalAlpha=.18;
    if(piston||crusher){
      const floor=o.kind.endsWith('-floor'),bounds=E.localBounds(o),height=Math.min(crusher?(o.rise||170)+35:(o.rise||180),bounds.gap-(crusher?105:110)),near=floor?bounds.bottom-height:bounds.top,far=floor?bounds.bottom:bounds.top+height;
      ctx.setLineDash([4,6]);line(ctx,x-6,near,x-6,far,'#ffb29366',1);line(ctx,x+o.width+6,near,x+o.width+6,far,'#ffb29366',1);ctx.setLineDash([]);
    }
    for(const r of rects){
      const rx=r.x+camera;
      round(ctx,rx,r.y,r.w,r.h,3,'#23344d','#ff8e93');
      // Inset metal and red perimeter agree exactly with the collision rectangles.
      if(r.w>12&&r.h>12)round(ctx,rx+5,r.y+5,r.w-10,r.h-10,2,'#17273b','#4a5268');
      for(let y=r.y+15;y<r.y+r.h-8;y+=25){
        line(ctx,rx+9,y,rx+r.w-9,y,'#3a4e65',3);
        if(r.w>38)line(ctx,rx+14,y-4,rx+Math.min(r.w-14,36),y-4,'#ffc39399',2);
      }
      for(const bx of [rx+5,rx+r.w-5])for(const by of [r.y+5,r.y+r.h-5])ellipse(ctx,bx,by,1.6,1.6,'#ffc7b5');
      if(piston||crusher){for(let k=0;k<2;k++){const sx=rx+r.w*(k+1)/3;line(ctx,sx,r.y+9,sx,r.y+r.h-9,'#657187',5);}}
      if(o.kind.startsWith('comb-')){
        const tip=o.kind.endsWith('-floor')?r.y:r.y+r.h;
        line(ctx,rx+2,tip,rx+r.w-2,tip,'#ffce8c',5);
        for(let j=0;j<3;j++)line(ctx,rx+7+j*8,tip+(o.kind.endsWith('-floor')?8:-8),rx+3+j*8,tip+(o.kind.endsWith('-floor')?16:-16),'#ff8e9366',2);
      }
    }
    if(o.kind==='bridge'){
      const cx=x+o.width/2,cy=rects[0].y+rects[0].h/2;ellipse(ctx,cx,cy,24,24,'#0c1c30');ellipse(ctx,cx,cy,16,16,'#ee7e8580');ellipse(ctx,cx,cy,8,8,'#ffd9a4');
      line(ctx,x+10,rects[0].y+rects[0].h+12,x+34,rects[0].y+rects[0].h+12,'#a39bfa',3);line(ctx,x+o.width-34,rects[0].y+rects[0].h+12,x+o.width-10,rects[0].y+rects[0].h+12,'#a39bfa',3);
    }
    ctx.restore();
  }
  function drawPickup(s,x){
    if(!s.type||s.type==='star'){
      if(s.attracted&&s.path&&!reduced.matches){
        ctx.beginPath();s.path.forEach((p,i)=>i?ctx.lineTo(p.x+playerX()-run.distance,p.y):ctx.moveTo(p.x+playerX()-run.distance,p.y));ctx.lineTo(x,s.y);ctx.strokeStyle='#ffe9a7bb';ctx.lineWidth=3;ctx.stroke();
        ellipse(ctx,x,s.y,22,22,'#fce69c24');
      }
      ellipse(ctx,x,s.y,17,17,'#ffd77812');star(x,s.y,10,'#ffda84');star(x-2,s.y-2,3,'#fff1b8');return;}
    const color={shield:'#7ff1d9',magnet:'#d2a9ff',slow:'#86ceff',overdrive:'#ffbd78',double:'#ffe081',ammo:'#91edb8',pierce:'#80edff',plasma:'#ffac85',scatter:'#ffca7c',burst:'#a8ef9e',rail:'#83dbff',phase:'#a6abff',nova:'#e3a4ff'}[s.type];
    ellipse(ctx,x,s.y,24,24,color+'15');round(ctx,x-16,s.y-16,32,32,10,'#10283c',color);
    ctx.fillStyle=color;ctx.textAlign='center';ctx.font='bold 22px ui-sans-serif, sans-serif';ctx.fillText({shield:'◇',magnet:'⊂',slow:'◷',overdrive:'⌖',double:'×2',ammo:'▥',pierce:'⇥',plasma:'✺',scatter:'⋔',burst:'≋',rail:'↠',phase:'◌',nova:'✹'}[s.type],x,s.y+7);
  }
  function draw(){
    const r=canvas.getBoundingClientRect();ctx.setTransform(view.dpr,0,0,view.dpr,0,0);ctx.clearRect(0,0,r.width,r.height);
    ctx.save();ctx.translate(view.ox,view.oy);ctx.scale(view.scale,view.scale);
    const menu=state==='home',offset=menu?2400+(reduced.matches?0:decorTime*22):run.distance;
    tunnel(offset,menu);
    if(menu){
      // Small orbit motifs sit outside the menu's main reading area.
      ctx.globalAlpha=1;
      star(view.w*.86,230,6,'#8af2d8');star(view.w*.82,407,4,'#b8b0ff');
    }else{
      const px=playerX(),camera=px-run.distance;
      if(run.previousBest>0){const x=run.previousBest/S.metersPerUnit+camera;if(x>-100&&x<view.w+100){ctx.setLineDash([5,7]);line(ctx,x,115,x,485,'#a8a0ff77',1);ctx.setLineDash([]);ctx.fillStyle='#c8c2ff';ctx.font='bold 11px ui-sans-serif, sans-serif';ctx.textAlign='center';ctx.fillText('⚑',Math.max(65,Math.min(view.w-65,x)),E.terrainAt(run.previousBest/S.metersPerUnit).top+35);}}
      for(const o of run.obstacles){
        const x=o.x+camera;if(x>view.w+100||x+o.width<-100)continue;
        if(o.rushId!==undefined&&!o.passed){
          const lane=E.safeGravity(o,1),y=E.terrainAt(o.x)[lane===1?'bottom':'top']+(lane===1?-52:52);
          round(ctx,x-5,y-13,76,24,7,'#2a2140dd','#c4a3f1');ctx.fillStyle='#ecdcff';ctx.font='bold 10px ui-sans-serif, sans-serif';ctx.textAlign='center';ctx.fillText('◆'.repeat(o.rushStep+1)+'◇'.repeat(o.rushTotal-o.rushStep-1),x+33,y+3);
        }
        if(o.kind.startsWith('gap-')||o.destroyed)continue;
        if(E.circles(o,run.time).length){drawRoundHazard(o,camera);continue;}
        if(o.kind!=='floor'&&o.kind!=='ceiling'&&o.kind!=='moving'){drawStructure(o,camera);continue;}
        ctx.save();if(o.destroyed)ctx.globalAlpha=.18;
        if(o.kind==='moving'){
          const cx=x+o.width/2,y=E.moverY(o,run.time);
          ctx.setLineDash([3,7]);line(ctx,cx,200,cx,400,'#ff8d8566',1.5);ctx.setLineDash([]);
          for(const sy of [210,390]){line(ctx,cx-5,sy,cx,sy+(sy===210?-6:6),'#ff8d85',1.5);line(ctx,cx+5,sy,cx,sy+(sy===210?-6:6),'#ff8d85',1.5);}
          ctx.save();ctx.translate(cx,y);if(!reduced.matches)ctx.rotate(run.time*.6);ctx.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,rr=i%2?22:26;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fillStyle='#ff7b82';ctx.fill();ellipse(ctx,0,0,14,14,'#432a41');ellipse(ctx,0,0,7,7,'#ffd0b4');ctx.restore();
        }else{
          const base=E.terrainAt(o.x)[o.kind==='floor'?'bottom':'top'];
          line(ctx,x,E.terrainAt(o.x)[o.kind==='floor'?'bottom':'top'],x+o.width,E.terrainAt(o.x+o.width)[o.kind==='floor'?'bottom':'top'],'#ff6f7e66',5);
          for(const t of E.triangles(o)){
            ctx.beginPath();t.forEach(([tx,ty],i)=>i?ctx.lineTo(tx+camera,ty):ctx.moveTo(tx+camera,ty));ctx.closePath();ctx.fillStyle='#ff7d87';ctx.fill();
            ctx.beginPath();ctx.moveTo(t[1][0]+camera,t[1][1]);ctx.lineTo(t[2][0]+camera,t[2][1]);ctx.lineTo(t[1][0]+camera,(t[0][1]+t[2][1])/2);ctx.closePath();ctx.fillStyle='#d75469';ctx.fill();
          }
        }
        ctx.restore();
      }
      for(const t of run.targets){
        const x=t.x+camera,y=E.targetY(t,run.time);if(x<-35||x>view.w+35)continue;
        ctx.save();ctx.translate(x,y);if(!reduced.matches)ctx.rotate(Math.sin(run.time*2+t.phase)*.08);
        ellipse(ctx,0,0,31,31,'#69ceff13');
        for(const side of [-1,1]){round(ctx,side*23-6,-8,12,16,4,'#263f56','#70dcff');line(ctx,side*28,-12,side*15,-12,'#a8f3ff',2);}
        ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.lineTo(Math.cos(a)*20,Math.sin(a)*20);}ctx.closePath();ctx.fillStyle='#142f49';ctx.fill();ctx.strokeStyle='#7edfff';ctx.lineWidth=2;ctx.stroke();
        ellipse(ctx,0,0,10,10,'#31566f');star(0,0,7,'#ffe294');ctx.restore();
      }
      for(const b of run.bullets){
        const x=b.x+camera;if(x<-25||x>view.w+25)continue;
        const color=b.type==='pierce'?'#80edff':b.type==='plasma'?'#ffac85':b.powered?'#dbbdff':'#ffdb91';ctx.save();ctx.translate(x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));
        if(b.type==='plasma'){ellipse(ctx,0,0,8,8,color+'44');ellipse(ctx,0,0,4,4,color);}line(ctx,b.type==='pierce'?-34:-20,0,0,0,color+'88',b.type==='pierce'?3:2);round(ctx,-6,-1.7,9,3.4,1,color);ellipse(ctx,3,0,1.8,1.8,'#fff9df');ctx.restore();
      }
      for(const s of run.collectibles)if(!s.collected&&s.x+camera>-25&&s.x+camera<view.w+25)drawPickup(s,s.x+camera);
      if(!reduced.matches)for(let i=0;i<trail.length;i++){const t=trail[i];ctx.globalAlpha=(i/trail.length)*.23;ellipse(ctx,t.x,t.y,5+i*.25,5+i*.25,'#6af7f1');}ctx.globalAlpha=1;
      if(state!=='over'){
        const age=run.time-flipAt;
        const terrain=E.terrainAt(run.distance);if(pose.grounded)ellipse(ctx,px,run.gravity===1?terrain.bottom+8:terrain.top-8,24,3,'#03091188');
        if(run.powers.shield){ctx.beginPath();ctx.arc(px,run.y,31,0,Math.PI*2);ctx.strokeStyle='#89f5db';ctx.lineWidth=2;ctx.stroke();ellipse(ctx,px,run.y,30,30,'#79f3db12');}
        if(run.powers.magnet){
          const phase=reduced.matches?0:run.time*2;
          for(let i=0;i<3;i++){const radius=32+((phase+i/3)%1)*30;ctx.beginPath();ctx.arc(px,run.y,radius,0,Math.PI*2);ctx.strokeStyle='#d8b3ff';ctx.globalAlpha=(1-(radius-32)/30)*.45;ctx.lineWidth=1.5;ctx.stroke();}ctx.globalAlpha=1;
        }
        if(run.powers.phase){ctx.save();ctx.beginPath();ctx.arc(px,run.y,37,-Math.PI/2,-Math.PI/2+Math.PI*2*run.powers.phase/S.phaseSeconds);ctx.strokeStyle='#adafff';ctx.lineWidth=3;ctx.stroke();ctx.restore();ctx.globalAlpha=.55;}
        runner(ctx,save.selected,px,run.y,pose,60,run.specialAmmo>0?run.weapon:'machine');ctx.globalAlpha=1;
        if(run.time-shotAt<.032&&!reduced.matches){const y=run.y-run.gravity*13;ellipse(ctx,px+33,y,10,5,'#d6fcffbb');}
        if(age<.2&&!reduced.matches){ctx.globalAlpha=(1-age/.2)*.4;ctx.beginPath();ctx.arc(px,run.y,24+age*70,0,Math.PI*2);ctx.strokeStyle='#a5fff3';ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;}
      }
      if(run.time-novaAt<.6&&!reduced.matches){const progress=(run.time-novaAt)/.6;ctx.beginPath();ctx.arc(novaX+camera,novaY,S.novaRadius*progress,0,Math.PI*2);ctx.strokeStyle='#e3a4ff';ctx.lineWidth=3;ctx.globalAlpha=(1-progress)*.65;ctx.stroke();ctx.globalAlpha=1;}
      for(const p of popups){ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle='#ffe7a2';ctx.font='bold 14px ui-sans-serif, sans-serif';ctx.textAlign='center';ctx.fillText(p.text,p.x+camera,p.y-(1-p.life)*36);}ctx.globalAlpha=1;
      for(const p of particles){ctx.globalAlpha=Math.min(1,p.life*3);
        if(p.shard){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillStyle=p.triangle?'#ff7d87':'#293c53';ctx.strokeStyle=p.color;ctx.lineWidth=1;
          ctx.beginPath();if(p.triangle){ctx.moveTo(-p.w/2,p.h/2);ctx.lineTo(0,-p.h/2);ctx.lineTo(p.w/2,p.h/2);ctx.closePath();}else ctx.rect(-p.w/2,-p.h/2,p.w,p.h);ctx.fill();ctx.stroke();ctx.restore();
        }else ellipse(ctx,p.x,p.y,2.5,2.5,p.color);
      }ctx.globalAlpha=1;
    }
    ctx.restore();
  }
  function frame(now){
    if(disposed)return;
    const dt=last?Math.max(0,(now-last)/1000):0;last=now;
    if(state==='playing'&&dt>.3)pause('The game was interrupted. Resume when you’re ready.');
    if(state==='playing'){
      accumulator+=Math.min(dt,.1);
      while(accumulator>=S.fixedStep&&state==='playing'){
        if(fireKey||firePointer)run.shoot();
        run.step(S.fixedStep);M.updatePose(pose,run,S.fixedStep,reduced.matches);processEvents();accumulator-=S.fixedStep;
        if(!reduced.matches&&state==='playing'){trail.push({x:playerX()-8,y:run.y});for(const t of trail)t.x-=run.speed*S.fixedStep;if(trail.length>14)trail.shift();}
      }
      updateHUD();
    }
    if(state==='home')decorTime+=Math.min(dt,.05);
    if(state==='playing'||state==='over'){
      for(const popup of popups){popup.life-=dt;}popups=popups.filter(p=>p.life>0);
      for(const p of particles){p.life-=dt;p.x+=(p.vx-(p.world&&state==='playing'?run.speed:0))*dt;p.y+=p.vy*dt;if(p.shard){p.angle+=p.spin*dt;p.vy+=160*dt;}}particles=particles.filter(p=>p.life>0);
      if(state==='over'&&$('retry').disabled&&now-crashAt>=650){$('retry').disabled=false;$('retry').focus({preventScroll:true});}
    }
    if(toastUntil&&now>toastUntil){$('toast').textContent='';toastUntil=0;}
    draw();raf=requestAnimationFrame(frame);
  }
  listen(canvas,'pointerdown',e=>{if(e.pointerType!=='touch'&&!e.isPrimary||e.button!==0)return;e.preventDefault();flip();});
  listen(document,'keydown',e=>{
    const button=e.target.closest?.('button,a');
    if(['KeyF','KeyX'].includes(e.code)&&state==='playing'&&!button){e.preventDefault();fireCodes.add(e.code);fireKey=true;if(!e.repeat)fire();}
    if(['Space','ArrowUp'].includes(e.code)){
      if(['playing','ready','paused'].includes(state)&&!button)e.preventDefault();
      if(!e.repeat&&!button&&['playing','ready'].includes(state))flip();
    }
    if((e.code==='Escape'||e.code==='KeyP')&&!e.repeat){if(state==='playing'){e.preventDefault();pause();}else if(state==='paused'){e.preventDefault();resume();}}
  });
  listen(document,'keyup',e=>{if(['KeyF','KeyX'].includes(e.code)){fireCodes.delete(e.code);fireKey=fireCodes.size>0;}});
  listen($('shoot'),'pointerdown',e=>{if(e.button!==0||state!=='playing')return;e.preventDefault();e.stopPropagation();firePointer=true;$('shoot').setPointerCapture(e.pointerId);fire();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen($('shoot'),type,()=>{firePointer=false;});
  listen($('shoot'),'click',e=>{if(e.detail===0)fire();});
  listen($('play'),'click',()=>{audioInit();reset();show('ready');});listen($('launch'),'click',launch);
  listen($('retry'),'click',()=>{if(state==='over'&&performance.now()-crashAt>=650)launch();});
  listen($('resume'),'click',resume);listen($('pause'),'click',()=>pause());
  listen($('brand'),'click',e=>{e.preventDefault();home();});
  document.querySelectorAll('[data-home]').forEach(b=>listen(b,'click',home));
  listen($('sound'),'click',()=>{save.sound=!save.sound;if(soundBank)soundBank.enabled(save.sound);setSound();persist();audioInit();if(state==='playing')canvas.focus({preventScroll:true});});
  listen(document,'visibilitychange',()=>{if(document.hidden)pause('Tab hidden. Resume when you’re ready.');});
  listen(window,'blur',()=>pause('Focus changed. Resume when you’re ready.'));
  listen(window,'resize',resize);
  listen(window,'pagehide',()=>{pause();cancelAnimationFrame(raf);raf=0;if(audio)audio.suspend().catch(()=>{});});
  listen(window,'pageshow',()=>{if(!raf&&!disposed){last=0;raf=requestAnimationFrame(frame);}});
  function dispose(){disposed=true;cancelAnimationFrame(raf);abort.abort();document.querySelectorAll('.avatar-card').forEach(b=>{b.onclick=null;});if(soundBank)soundBank.dispose();if(audio)audio.close().catch(()=>{});}
  // Read-only diagnostics support smoke tests without altering gameplay.
  window.GravityFlip=Object.freeze({snapshot:()=>({state,ammo:run.ammo,specialAmmo:run.specialAmmo,bulletType:run.bulletType,weapon:run.weapon,nextAmmoAt:run.nextAmmoAt,shots:run.shots,kills:run.kills,bullets:run.bullets.map(b=>({...b})),targets:run.targets.map(t=>({...t,renderY:E.targetY(t,run.time)})),rush:run.rush?{...run.rush}:null,theme:E.themeAt(run.distance),openings:E.surfaceOpenings(run.obstacles),pose:{...pose,legs:[M.legPose(pose,-1),M.legPose(pose,1)]},meters:run.meters,distance:run.distance,y:run.y,vy:run.vy,gravity:run.gravity,flips:run.flips,speed:run.speed,terrain:E.terrainAt(run.distance),bounds:E.boundsAt(run.distance),stars:run.stars,bonus:run.bonus,rewardStars:run.rewardStars,chain:run.chain,powers:{...run.powers},sector:run.sector,difficulty:{...run.difficulty},collectibles:run.collectibles.map(s=>({...s,path:s.path?.map(p=>({...p}))})),previousBest:run.previousBest,save:{...save},view:{...view},obstacles:run.obstacles.map(o=>({...o})),reducedMotion:reduced.matches}),dispose});
  resize();setSound();show('home');raf=requestAnimationFrame(frame);
})();
