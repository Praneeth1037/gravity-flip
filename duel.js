(() => {
  'use strict';
  const G=window.GravityDuel,S=G.SETTINGS,M=window.GravityMotion,Rig=window.GravityRig,$=id=>document.getElementById(id);
  const TAU=Math.PI*2,W=S.width,H=S.height,STEP=S.fixedStep;
  const canvas=$('arena'),ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const PLAYER_COLORS=['#ffa441','#59edff'],BULLET_COLORS=['#ffbf6b','#7ff3ff'];
  const PICKUP_LOOK={ammo:['#91edb8','▥','AMMO'],health:['#7df6a0','✚','HEALTH'],energy:['#c3b2ff','ϟ','POWER'],scatter:['#ffca7c','⋔','SCATTER'],burst:['#a8ef9e','≋','BURST'],
    rail:['#83dbff','↠','RAIL'],rocket:['#ff9d7a','➶','ROCKET'],boomerang:['#ffe081','◖','BOOMERANG'],ring:['#ffd27a','ϟ','RING']};
  const KEYMAP={KeyW:[0,'up'],KeyS:[0,'down'],KeyA:[0,'dash'],KeyD:[0,'shield'],KeyF:[0,'fire'],KeyE:[0,'power1'],KeyR:[0,'power2'],
    KeyO:[1,'up'],ArrowUp:[1,'up'],KeyL:[1,'down'],ArrowDown:[1,'down'],Semicolon:[1,'dash'],KeyK:[1,'shield'],KeyJ:[1,'fire'],KeyI:[1,'power1'],KeyU:[1,'power2']};
  const PREF_KEY='gravity-duel-v1';
  let prefs={names:['',''],avatars:['orbit','wisp'],powers:G.DEFAULT_POWERS.map(p=>[...p]),sound:true};
  try{const saved=JSON.parse(localStorage.getItem(PREF_KEY)||'null');if(saved){
    prefs.names=[0,1].map(i=>G.cleanName(saved.names?.[i]));prefs.avatars=[0,1].map(i=>G.AVATAR_IDS.includes(saved.avatars?.[i])?saved.avatars[i]:prefs.avatars[i]);
    prefs.powers=[0,1].map(i=>G.cleanPowers(saved.powers?.[i],G.DEFAULT_POWERS[i]));prefs.sound=saved.sound!==false;}}catch{}
  const savePrefs=()=>{try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}catch{}};

  let state='menu',mode=null,sim=null,snap=null,prevSnap=null,snapAt=0,accumulator=0,last=0,raf=0,resultsTimer=0;
  let view={scale:1,ox:0,oy:0,dpr:1},audio=null,soundBank=null,net=null,demo=null,demoTime=0,clock=0,touchSeen=false;
  let particles=[],popups=[],rings=[],poses=[makePose(),makePose()],ghostPose=makePose(),muzzle=[-1,-1],bannerUntil=0;
  const fireHeld=[new Set(),new Set()];

  // ---------------------------------------------------------------- audio
  function audioInit(){
    if(!prefs.sound)return;
    try{if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();soundBank=new window.GravitySound(audio);}if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}
  }
  function sound(type,options){if(prefs.sound&&soundBank)soundBank.play(type,options);}
  function setSound(){const b=$('sound'),short=state==='playing';b.textContent=prefs.sound?(short?'♪':'♪ Sound on'):(short?'♩':'♩ Sound off');b.setAttribute('aria-label',prefs.sound?'Turn sound off':'Turn sound on');b.setAttribute('aria-pressed',String(prefs.sound));}

  // ---------------------------------------------------------------- screens
  function show(next){
    state=next;$('duel').dataset.state=next;
    for(const id of ['menu','lobby','paused','results'])$(id).hidden=id!==next;
    $('hud').hidden=!['playing','paused'].includes(next);
    $('pause').hidden=!(next==='playing'&&mode==='local');
    $('touch').hidden=!(next==='playing'&&(matchMedia('(pointer: coarse)').matches||touchSeen));
    document.querySelector('.pad[data-player="1"]').hidden=mode==='online';
    if(next!=='playing')releaseAll();
    setSound();resize();
    if(next==='playing')canvas.focus({preventScroll:true});
    if(next==='menu'){$('local').focus({preventScroll:true});banner('');}
    if(next==='paused')$('resume').focus({preventScroll:true});
    last=0;accumulator=0;
  }
  function banner(text,small='',ms=1200){
    const b=$('banner');b.textContent=text;
    if(small){const s=document.createElement('small');s.textContent=small;b.append(s);}
    if(text&&!reduced.matches){b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');}
    bannerUntil=text?performance.now()+ms:0;
  }
  function pilot(i){return {name:$('name-'+i).value,avatar:prefs.avatars[i],powers:prefs.powers[i]};}
  function resetEffects(){particles=[];popups=[];rings=[];poses=[makePose(),makePose()];muzzle=[-1,-1];}
  function startLocal(){audioInit();leaveOnline();mode='local';sim=new G.Duel({players:[pilot(0),pilot(1)]});resetEffects();snap=sim.snapshot();onEvents(sim.drainEvents());show('playing');}
  function toMenu(){clearTimeout(resultsTimer);leaveOnline();mode=null;sim=null;snap=prevSnap=null;show('menu');}
  function pause(){if(state==='playing'&&mode==='local')show('paused');}
  function resume(){if(state==='paused'){audioInit();show('playing');}}
  function showResults(){
    if(!snap||state!=='playing')return;
    const w=snap.matchWinner,p=snap.players;
    $('results-title').textContent=`${p[w].name} wins ${snap.wins[w]}–${snap.wins[1-w]}`;$('results-title').style.color=PLAYER_COLORS[w];
    for(const i of [0,1])$('stat-name-'+i).textContent=p[i].name;
    const st=snap.stats,acc=s=>s.shots?Math.round(s.hits/s.shots*100)+'%':'—';
    const rows=[['Damage dealt',s=>Math.round(s.damage)],['Accuracy',acc],['Knockouts',s=>s.kos],['Powers used',s=>s.powers],['Shots fired',s=>s.shots],['Shield blocks & parries',s=>s.blocks],['Pickups grabbed',s=>s.pickups],['Damage taken',s=>Math.round(s.taken)]];
    const body=$('stats-body');body.replaceChildren();
    for(const [label,fn] of rows){const tr=document.createElement('tr');for(const text of [label,fn(st[0]),fn(st[1])]){const td=document.createElement('td');td.textContent=String(text);tr.append(td);}body.append(tr);}
    $('rematch').disabled=false;show('results');$('rematch').focus({preventScroll:true});
  }

  // ---------------------------------------------------------------- input
  function act(player,action,down){
    if(state!=='playing')return;
    const seat=mode==='online'?net?.seat:player;if(seat===undefined||seat===null)return;
    if(action==='fire'){
      if(mode==='local')sim.hold(seat,down);
      else if(net&&net.fire!==down){net.fire=down;sendInput();}
      return;
    }
    if(!down)return;
    if(mode==='local')sim.press(seat,action);
    else if(net){net.counts[action]++;sendInput();}
  }
  function releaseAll(){
    for(const set of fireHeld)set.clear();
    if(sim&&mode==='local'){sim.hold(0,false);sim.hold(1,false);}
    if(net&&net.fire){net.fire=false;sendInput();}
    document.querySelectorAll('.pad button.held').forEach(b=>b.classList.remove('held'));
  }
  addEventListener('keydown',e=>{
    if(e.target instanceof HTMLInputElement)return;
    if((e.code==='Escape'||e.code==='KeyP')&&!e.repeat){if(state==='playing')pause();else if(state==='paused')resume();return;}
    const map=KEYMAP[e.code];if(!map||state!=='playing')return;
    e.preventDefault();audioInit();
    const [player,action]=map;
    if(action==='fire'){fireHeld[player].add(e.code);act(player,'fire',true);return;}
    if(!e.repeat)act(player,action,true);
  });
  addEventListener('keyup',e=>{
    const map=KEYMAP[e.code];if(!map||map[1]!=='fire')return;
    fireHeld[map[0]].delete(e.code);if(!fireHeld[map[0]].size)act(map[0],'fire',false);
  });
  for(const button of document.querySelectorAll('.pad button')){
    const player=Number(button.closest('.pad').dataset.player),action=button.dataset.act;
    button.addEventListener('pointerdown',e=>{e.preventDefault();touchSeen=true;audioInit();button.classList.add('held');try{button.setPointerCapture(e.pointerId);}catch{}act(player,action,true);});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{if(!button.classList.contains('held'))return;button.classList.remove('held');act(player,action,false);});
    button.addEventListener('contextmenu',e=>e.preventDefault());
  }
  addEventListener('touchstart',()=>{touchSeen=true;},{passive:true,once:true});
  addEventListener('blur',()=>{releaseAll();pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseAll();pause();}});

  // ---------------------------------------------------------------- online
  const onlineAvailable=location.protocol.startsWith('http');
  // Static hosts (for example Vercel) have no room server: detect that and explain instead of failing on Host/Join.
  const OFFLINE_NOTE='Online rooms need the Gravity Duel server, which this site does not run. Same-screen duels work here. To play on two devices, run npm run duel on a computer and both open its address.';
  // Use this site's own room server if it has one (npm run duel); otherwise the hosted one from duel-config.js.
  let SERVER='';
  const healthy=base=>fetch(base+'/api/duel/health',{cache:'no-store',signal:AbortSignal.timeout?.(70000)}).then(r=>r.ok&&!!r.headers.get('content-type')?.includes('json')).catch(()=>false);
  const roomServer=(async()=>{
    if(location.protocol.startsWith('http')&&await healthy(''))return true;
    const remote=String(window.GRAVITY_DUEL_SERVER||'').replace(/\/+$/,'');
    if(!/^https?:\/\//.test(remote))return false;
    $('online-note').textContent='Waking up the online room server… (the first visit can take up to a minute)';
    if(await healthy(remote)){SERVER=remote;$('online-note').textContent='Online room server ready. Host a room or join with a code.';return true;}
    return false;
  })();
  roomServer.then(ok=>{if(!ok){for(const id of ['host','join','join-code'])$(id).disabled=true;onlineError(OFFLINE_NOTE);}});
  async function api(route,body){
    const response=await fetch(SERVER+'/api/duel/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'The duel server did not respond.');
    return data;
  }
  function onlineError(message){const n=$('online-note');n.textContent=message;n.classList.add('error');}
  function sendInput(){
    if(!net)return;net.lastSend=performance.now();
    fetch(SERVER+'/api/duel/input',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
      body:JSON.stringify({code:net.code,token:net.token,fire:net.fire,...net.counts})}).catch(()=>{});
  }
  function connect(session){
    leaveOnline(false);
    net={...session,counts:Object.fromEntries(G.ACTIONS.map(a=>[a,0])),fire:false,lastSend:0,es:null};
    mode='online';resetEffects();snap=prevSnap=null;
    try{sessionStorage.setItem('gravity-duel-session',JSON.stringify(session));}catch{}
    const link=new URL('duel.html',location.href);link.searchParams.set('room',session.code);
    $('room-code').textContent=session.code;$('share-link').value=link.href;$('lobby-status').textContent='Connecting…';
    history.replaceState(null,'','?room='+session.code);
    show('lobby');
    const es=new EventSource(`${SERVER}/api/duel/stream?code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`);
    net.es=es;
    es.addEventListener('lobby',e=>lobby(JSON.parse(e.data)));
    es.addEventListener('welcome',e=>lobby(JSON.parse(e.data)));
    es.addEventListener('state',e=>{
      const message=JSON.parse(e.data);
      prevSnap=snap&&snap.round===message.snap.round?snap:null;snap=message.snap;snapAt=performance.now();
      if(state==='lobby'||(state==='results'&&snap.phase!=='matchover'))show('playing');
      $('net-status').hidden=true;onEvents(message.events);
    });
    es.onerror=()=>{if(state==='playing'){$('net-status').textContent='Connection lost · reconnecting…';$('net-status').hidden=false;}else $('lobby-status').textContent='Reconnecting to the room…';};
  }
  function lobby(info){
    if(!net)return;
    const other=info.seats[1-net.seat];
    if(state==='lobby')$('lobby-status').textContent=!other?'Waiting for your friend to join…':!other.connected?`${other.name} is connecting…`:'Both pilots ready. Launching!';
    if(state==='playing'||state==='results'){
      const missing=!other||!other.connected;
      $('net-status').textContent=missing?(other?`${other.name} disconnected · waiting for them to return…`:'Your friend left the room.'):'';$('net-status').hidden=!missing;
    }
  }
  function leaveOnline(notify=true){
    if(!net)return;
    const {code,token,es}=net;es?.close();net=null;$('net-status').hidden=true;
    try{sessionStorage.removeItem('gravity-duel-session');}catch{}
    if(notify)fetch(SERVER+'/api/duel/leave',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({code,token})}).catch(()=>{});
    if(location.search)history.replaceState(null,'',location.pathname);
  }
  async function host(){
    if(!await roomServer){onlineError(OFFLINE_NOTE);return;}
    audioInit();$('host').disabled=true;
    try{connect(await api('create',pilot(0)));}catch(error){onlineError(error.message);}
    finally{$('host').disabled=false;}
  }
  async function join(){
    const code=$('join-code').value.trim().toUpperCase();
    if(!await roomServer){onlineError(OFFLINE_NOTE);return;}
    if(!/^[A-Z]{4}$/.test(code)){onlineError('Enter the 4-letter room code from your friend.');$('join-code').focus();return;}
    audioInit();$('join').disabled=true;
    try{connect(await api('join',{code,...pilot(1)}));}catch(error){onlineError(error.message);}
    finally{$('join').disabled=false;}
  }
  // Interpolate between the last two server snapshots so 30 Hz updates render smoothly.
  function blended(){
    if(mode!=='online'||!prevSnap||!snap)return snap;
    const span=Math.max(.016,snap.t-prevSnap.t),a=Math.min(1,(performance.now()-snapAt)/1000/span),mix=(x,y)=>x+(y-x)*a;
    const bullets=new Map(prevSnap.bullets.map(b=>[b.id,b])),comets=new Map(prevSnap.comets.map(c=>[c.id,c]));
    return {...snap,camX:mix(prevSnap.camX,snap.camX),
      players:snap.players.map((p,i)=>{const q=prevSnap.players[i];return {...p,x:mix(q.x,p.x),y:mix(q.y,p.y),offset:mix(q.offset,p.offset),inv:mix(q.inv,p.inv),blade:mix(q.blade,p.blade)};}),
      bullets:snap.bullets.map(b=>{const q=bullets.get(b.id);return q?{...b,x:mix(q.x,b.x),y:mix(q.y,b.y)}:b;}),
      comets:snap.comets.map(c=>{const q=comets.get(c.id);return q?{...c,x:mix(q.x,c.x),y:mix(q.y,c.y)}:c;})};
  }

  // ---------------------------------------------------------------- events
  function worldPos(i){const p=snap?.players[i];return p?{x:p.x,y:p.y-(p.inv>=0?46:-46)}:{x:0,y:0};}
  function popup(x,y,text,color='#ffe7a2',size=15){popups.push({x,y,text,color,size,life:1});if(popups.length>40)popups.shift();}
  function spray(x,y,color,count=8,speed=140){
    if(reduced.matches)return;
    for(let i=0;i<count;i++){const a=i*2.39+Math.random()*.4,v=speed*(.5+Math.random()*.6);particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.5,max:.5,color,size:2.5});}
    if(particles.length>300)particles.splice(0,particles.length-300);
  }
  function shards(e){
    if(reduced.matches)return;
    const color={crate:'#c49a62',rock:'#a99bc9',gate:'#ff8d8a',comet:'#ffb35c'}[e.kind]||'#ff7d87';
    for(let i=0;i<14;i++){const a=i*TAU/14;particles.push({x:e.x+(Math.random()-.5)*e.w*.6,y:e.y+(Math.random()-.5)*e.h*.6,vx:Math.cos(a)*180,vy:Math.sin(a)*180-60,life:.7,max:.7,color,size:6,shard:true,spin:(i%2?1:-1)*7,angle:a,gravity:500});}
  }
  function hitCard(i){const card=$('card-'+i);card.classList.remove('hit');void card.offsetWidth;card.classList.add('hit');}
  const POWER_SHOUT={well:'GRAVITY WELL!',echo:'TIME ECHO',comet:'COMET INCOMING',blades:'ORBIT BLADES',hex:'GRAVITY HEX'};
  function onEvents(events){
    for(const e of events){
      const name=i=>snap?.players[i]?.name||`Player ${i+1}`,color=i=>PLAYER_COLORS[i];
      switch(e.type){
        case 'round-start':poses=[makePose(),makePose()];particles=[];rings=[];banner(`ROUND ${e.round}`,(e.arena||'').toUpperCase(),1400);break;
        case 'countdown':banner(String(e.count),snap?.arena?.toUpperCase()||'',800);sound('countdown');break;
        case 'fight':banner('DUEL!','',700);sound('fight');break;
        case 'overtime':banner('OVERTIME','HULLS FAILING · 4 HP PER SECOND',1800);sound('burst');break;
        case 'shoot':poses[e.p].recoil=e.weapon==='rail'||e.weapon==='rocket'?1.6:1;muzzle[e.p]=clock;sound('shoot',{weapon:e.weapon==='blaster'||e.weapon==='boomerang'?'machine':e.weapon});break;
        case 'echo-shot':spray(e.x,e.y,'#c9b8ff',3,60);break;
        case 'hurt':{
          sound('hit');spray(e.x,e.y,e.by!==null&&e.by!==undefined?BULLET_COLORS[e.by]:'#ff8d8a',9);hitCard(e.p);
          const label={void:'FELL',behind:'LEFT BEHIND',laser:'ZAPPED',spikes:'SPIKED',crate:'CRASH',rock:'ASTEROID',gate:'GATE',comet:'COMET',hex:'HEXED',blades:'SLICED'}[e.cause];
          // Rapid hits on the same pilot merge into one growing number instead of a pile of popups.
          const recent=!label&&popups.find(q=>q.key===e.p&&q.life>.55);
          if(recent){recent.sum+=e.amount;recent.text='-'+Math.round(recent.sum);recent.life=1;recent.size=Math.min(26,17+recent.sum/6);}
          else popups.push({x:e.x,y:e.y-38,text:(label?label+' ':'')+'-'+Math.round(e.amount),color:'#ff9ba3',size:label?14:17,life:1,key:label?null:e.p,sum:e.amount});
          break;
        }
        case 'block':sound('shield');popup(e.x,e.y-40,'BLOCKED',color(e.p),14);break;
        case 'reflect':sound('shield');spray(e.x,e.y,'#ffffff',10,200);popup(e.x,e.y-30,'PARRY!',color(e.p),17);break;
        case 'shield':{sound('shield');const p=snap.players[e.p];rings.push({x:p.x,y:p.y,r:20,grow:160,life:.35,max:.35,color:color(e.p)});break;}
        case 'dash':case 'boost':{sound('dash');const p=snap?.players[e.p];if(p&&!reduced.matches)for(let i=0;i<8;i++)particles.push({x:p.x-20,y:p.y+(i-4)*5,vx:-420-i*30,vy:0,life:.25,max:.25,color:e.type==='boost'?'#7df6a0':color(e.p),size:2,streak:true});if(e.type==='boost'){const q=worldPos(e.p);popup(q.x,q.y,'BOOST!','#7df6a0',14);}break;}
        case 'no-power':{const p=worldPos(e.p);popup(p.x,p.y,`NEED ${e.cost} POWER`,'#c3b2ff',13);sound('dry');break;}
        case 'power':{
          const p=worldPos(e.p);popup(p.x,p.y-14,POWER_SHOUT[e.power]||'POWER',color(e.p),16);sound(e.power==='hex'?'flip':'power',{gravity:-1});
          break;
        }
        case 'well-open':sound('burst');rings.push({x:e.x,y:e.y,r:170,grow:-380,life:.4,max:.4,color:'#b98cff'});break;
        case 'swallow':spray(e.x,e.y,'#b98cff',4,40);break;
        case 'hexed':{const p=worldPos(e.p);popup(p.x,p.y-10,'⇅ CONTROLS FLIPPED','#e3a4ff',14);sound('flip',{gravity:1});break;}
        case 'pickup':{
          const look=PICKUP_LOOK[e.item],text=e.item==='health'?`+${e.amount} HP`:e.item==='ammo'?`+${e.amount} AMMO`:e.item==='energy'||e.item==='ring'?`+${e.amount} POWER`:`${look[2]} ×${e.amount}`;
          sound(e.item==='health'?'heal':'power');spray(e.x,e.y,look[0],10);popup(e.x,e.y-30,text,look[0],15);break;
        }
        case 'refill':{const p=worldPos(e.p);popup(p.x,p.y,`+${e.amount} AMMO · ${e.meters} m`,'#91edb8',12);sound('star',{chain:2});break;}
        case 'dry':{const p=worldPos(e.p);popup(p.x,p.y,'OUT OF AMMO','#ff9ba3',13);sound('dry');break;}
        case 'weapon-empty':{const p=worldPos(e.p);popup(p.x,p.y-16,'BACK TO BLASTER','#ffd68b',12);break;}
        case 'explosion':sound('burst');rings.push({x:e.x,y:e.y,r:10,grow:e.radius*3,life:.4,max:.4,color:'#ffac85'});spray(e.x,e.y,'#ffac85',18,260);break;
        case 'destroy':sound('burst');shards(e);break;
        case 'comet-fall':spray(e.x,e.y,'#ffb35c',10,120);break;
        case 'hazard-hit':spray(e.x,e.y,'#ffd2b0',4,90);break;
        case 'spark':spray(e.x,e.y,'#ffe7b0',3,70);break;
        case 'lane':case 'drop':case 'bounce':sound('flip',{gravity:e.to>e.from?-1:1});if(e.type==='bounce'){const p=worldPos(e.p);popup(p.x,p.y,'BOUNCED','#ffd68b',12);}break;
        case 'falling':{const p=worldPos(e.p);popup(p.x,p.y,'⚠ FALLING','#ffd68b',13);break;}
        case 'ko':{const p=snap?.players[e.p];sound('crash');if(p){spray(p.x,p.y,color(e.p),30,320);rings.push({x:p.x,y:p.y,r:10,grow:300,life:.6,max:.6,color:color(e.p)});}break;}
        case 'round-over':sound('reward');banner(e.winner===null?'DOUBLE KO':`${name(e.winner)} TAKES THE ROUND`,e.winner===null?'NOBODY SCORES · REPLAY THE ROUND':e.match?'MATCH POINT WON':`${e.wins[0]} – ${e.wins[1]}`,2600);break;
        case 'match-over':clearTimeout(resultsTimer);resultsTimer=setTimeout(showResults,900);break;
        case 'match-start':clearTimeout(resultsTimer);break;
      }
    }
  }

  // ---------------------------------------------------------------- poses
  function makePose(){return Object.assign(M.createPose(),{lastY:null});}
  function updatePose(pose,p,terrain,dt){
    const grounded=!p.shifting&&!p.falling;
    pose.landing=reduced.matches?0:!pose.grounded&&grounded?1:pose.landing*Math.exp(-18*dt);
    pose.grounded=grounded;
    const vy=pose.lastY===null||dt<=0?0:(p.y-pose.lastY)/dt;pose.lastY=p.y;
    Object.assign(pose,{inversion:p.inv,facing:1,anchorOffset:0,slope:0,phase:reduced.matches?0:p.x/100*TAU});
    pose.groundBlend+=(Number(grounded)-pose.groundBlend)*(1-Math.exp(-25*dt));
    pose.bob=reduced.matches||!grounded?0:-Math.abs(Math.sin(pose.phase*2))*.8;
    // Feet follow the curve: the body tilts to the local slope of the deck it runs on.
    const lean=grounded&&terrain?Math.atan((G.surfaceY(terrain,p.lane,p.x+8)-G.surfaceY(terrain,p.lane,p.x-8))/16):reduced.matches?0:Math.max(-.3,Math.min(.3,vy/2400))*Math.sign(p.inv||1);
    pose.angle+=(lean-pose.angle)*(1-Math.exp(-22*dt));
    pose.recoil=reduced.matches?0:pose.recoil*Math.exp(-24*dt);
  }

  // ---------------------------------------------------------------- menu demo (two bots)
  function botThink(d,i){
    const p=d.players[i],x=d.worldX(p);
    if(p.shift>=1&&!p.queue.length&&!p.falling){
      const danger=d.hazards.some(h=>!h.destroyed&&h.shapes&&h.type!=='boost'&&h.x+h.w>x-10&&h.x-x<190&&(h.lane===p.lane||h.lanes?.includes(p.lane)))||d.gaps.some(g=>g.surface===p.lane&&g.x+g.w>x&&g.x-x<130);
      if(danger||d.random()<.004)d.press(i,p.lane===2?'down':p.lane===0?'up':(d.random()<.5?'up':'down'));
    }
    d.hold(i,(p.ammo>4||p.special>0)&&d.random()<.6);
    if(p.power>70&&d.bullets.some(b=>b.owner!==i&&Math.hypot(b.x-x,b.y-p.y)<140))d.press(i,'shield');
    if(p.power>85&&d.random()<.01)d.press(i,d.random()<.5?'power1':'power2');
  }
  function stepDemo(dt){
    if(!demo||demo.phase==='matchover')demo=new G.Duel({players:[{name:'Orbit',avatar:'orbit',powers:['well','blades']},{name:'Wisp',avatar:'wisp',powers:['comet','hex']}],seed:7+Math.floor(demoTime)});
    demoTime+=dt;let steps=Math.min(12,Math.round(dt/STEP));
    while(steps-->0){botThink(demo,0);botThink(demo,1);demo.step(STEP);}
    demo.drainEvents();
  }

  // ---------------------------------------------------------------- rendering
  function resize(){
    const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2.5);
    canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
    // During play the arena fits between the HUD and the touch pads so no deck is ever hidden.
    const playing=state==='playing'||state==='paused',touch=$('touch');
    const top=playing&&!$('hud').hidden?$('hud').getBoundingClientRect().bottom-r.top+6:0;
    const pads=[...touch.querySelectorAll('.pad:not([hidden])')].map(p=>p.getBoundingClientRect().top);
    const bottom=playing&&!touch.hidden&&pads.length?r.bottom-Math.min(...pads)+4:0;
    const space=Math.max(120,r.height-top-bottom),scale=Math.min(r.width/W,space/H);
    view={scale,ox:(r.width-W*scale)/2,oy:top+(space-H*scale)/2,dpr,w:r.width,h:r.height};
  }
  function rr(x,y,w,h,r,fill,stroke,lw=1.5){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
  function circle(x,y,r,fill){ctx.beginPath();ctx.arc(x,y,Math.max(0,r),0,TAU);ctx.fillStyle=fill;ctx.fill();}
  function line(x1,y1,x2,y2,color,width=2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  const STARS=Array.from({length:110},(_,i)=>({x:(i*173.3)%W,y:20+(i*97.7)%560,r:i%9===0?1.6:.8,a:.18+(i%5)*.12,depth:.03+(i%3)*.03}));
  const TOWERS=Array.from({length:14},(_,i)=>({x:i*190,w:60+(i*37)%70,h:120+(i*71)%190,lights:(i*13)%5}));
  function background(cam,arena){
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#060f1f');sky.addColorStop(.55,arena.sky);sky.addColorStop(1,'#060d19');
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    const drift=reduced.matches?0:cam;
    for(const s of STARS){const x=((s.x-drift*s.depth)%W+W)%W;ctx.globalAlpha=s.a;circle(x,s.y,s.r,'#bfe6ff');}ctx.globalAlpha=1;
    const px=W*.72-((drift*.02)%260);
    circle(px,250,92,arena.accent+'12');ctx.beginPath();ctx.ellipse(px,250,160,30,-.3,0,TAU);ctx.strokeStyle='#ffa44122';ctx.lineWidth=2;ctx.stroke();
    const span=TOWERS.length*190,shift=(drift*.12)%span;
    ctx.globalAlpha=.45;
    for(const t of TOWERS){
      let x=t.x-shift;if(x<-200)x+=span;if(x>W+40)continue;
      rr(x,H-60-t.h,t.w,t.h+60,4,'#10213a','#1e3656');
      for(let k=0;k<t.lights;k++)rr(x+10+k*9%(t.w-20),H-40-t.h+20+k*22,5,8,1,'#ffd68b55');
    }
    ctx.globalAlpha=1;
  }
  function spans(gaps,surface,from,to){
    const out=[];let cursor=from;
    for(const g of gaps.filter(g=>g.surface===surface&&g.x+g.w>from&&g.x<to).sort((a,b)=>a.x-b.x)){if(g.x>cursor)out.push([cursor,g.x]);cursor=Math.max(cursor,g.x+g.w);}
    if(cursor<to)out.push([cursor,to]);return out;
  }
  function samples(a,b){const xs=[a];for(let x=Math.ceil(a/8)*8;x<b;x+=8)if(x>a)xs.push(x);xs.push(b);return xs;}
  function decks(s,cam){
    const t=s.terrain,from=cam-60,to=cam+W+60,at=x=>G.terrainAt(t,x);
    const list=[
      {surface:0,edge:'#7df6df',fill:'#15304a',top:x=>at(x).floor,bottom:()=>H+10},
      {surface:2,edge:'#b8b4ff',fill:'#1b2a4d',top:()=>-10,bottom:x=>at(x).ceil},
      {surface:1,edge:'#ffd27a',fill:'#2a2f4f',top:x=>at(x).mid,bottom:x=>at(x).mid+S.midThickness}
    ];
    for(const d of list){
      for(const [a,b] of spans(s.gaps,d.surface,from,to)){
        const xs=samples(a,b);
        ctx.beginPath();xs.forEach((x,i)=>i?ctx.lineTo(x-cam,d.top(x)):ctx.moveTo(x-cam,d.top(x)));
        for(let i=xs.length-1;i>=0;i--)ctx.lineTo(xs[i]-cam,d.bottom(xs[i]));
        ctx.closePath();ctx.fillStyle=d.fill;ctx.fill();ctx.strokeStyle='#3d5574';ctx.lineWidth=1;ctx.stroke();
        // Panel studs ride the curve.
        for(let m=Math.ceil(a/80)*80;m<b-20;m+=80){
          const y=d.surface===0?d.top(m)+22:d.surface===2?d.bottom(m)-22:d.top(m)+9;
          if(d.surface===1)line(m-cam+8,y,m-cam+40,y,'#ffd27a33',3);else rr(m-cam+10,y-4,36,8,2,'#0b1828','#3f5a78');
        }
        const edge=d.surface===2?d.bottom:d.top;
        ctx.beginPath();xs.forEach((x,i)=>i?ctx.lineTo(x-cam,edge(x)):ctx.moveTo(x-cam,edge(x)));
        ctx.globalAlpha=.18;ctx.strokeStyle=d.edge;ctx.lineWidth=10;ctx.stroke();ctx.globalAlpha=1;ctx.lineWidth=3;ctx.stroke();
        if(d.surface===1){
          ctx.beginPath();xs.forEach((x,i)=>i?ctx.lineTo(x-cam,d.bottom(x)):ctx.moveTo(x-cam,d.bottom(x)));ctx.strokeStyle=d.edge+'77';ctx.lineWidth=2;ctx.stroke();
          for(let m=Math.ceil(a/260)*260;m<b-40;m+=260){const y=d.bottom(m);rr(m-cam-12,y+3,24,8,3,'#142a3a','#435b73');line(m-cam-6,y+16,m-cam+6,y+16,'#ffd27a88',3);}
        }
        for(const x of [a,b])if(x>from+1&&x<to-1){
          const y=edge(x),dir=d.surface===2?-1:1;line(x-cam,y,x-cam,y+dir*20,'#ffd68b',3);circle(x-cam,y-dir*6,3,'#ffe3a0');
        }
      }
    }
    for(const g of s.gaps){
      const x=g.x-cam;if(x>W||x+g.w<0)continue;
      const c=at(g.x+g.w/2);ctx.font='bold 20px ui-sans-serif, sans-serif';ctx.textAlign='center';
      if(g.surface===0){const grad=ctx.createLinearGradient(0,c.floor,0,H);grad.addColorStop(0,'#02060d00');grad.addColorStop(1,'#000');ctx.fillStyle=grad;ctx.fillRect(x,c.floor-20,g.w,H);ctx.fillStyle='#ffd68b';ctx.fillText('⚠',x+g.w/2,c.floor-30);}
      else if(g.surface===2){const grad=ctx.createLinearGradient(0,c.ceil,0,0);grad.addColorStop(0,'#02060d00');grad.addColorStop(1,'#000');ctx.fillStyle=grad;ctx.fillRect(x,0,g.w,c.ceil+20);ctx.fillStyle='#ffd68b';ctx.fillText('⚠',x+g.w/2,c.ceil+44);}
      else{ctx.setLineDash([6,8]);ctx.beginPath();samples(g.x,g.x+g.w).forEach((sx,i)=>{const y=at(sx).mid+9;i?ctx.lineTo(sx-cam,y):ctx.moveTo(sx-cam,y);});ctx.strokeStyle='#ffd27a33';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);}
    }
  }
  const hash=(a,b)=>{const v=Math.sin(a*12.9898+b*78.233)*43758.5453;return v-Math.floor(v);};
  function drawHazard(h,t,cam,time){
    if(h.type==='rock'){
      const x=h.x-cam,rot=(h.spin||0)+(reduced.matches?0:time*.4);
      ctx.save();ctx.translate(x,h.y);ctx.rotate(rot);
      ctx.beginPath();for(let k=0;k<10;k++){const a=k*TAU/10,rad=h.r*(.8+.2*hash(h.id,k));k?ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):ctx.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);}ctx.closePath();
      ctx.fillStyle=h.hp<40?'#5a4a6a':'#4a4560';ctx.fill();ctx.strokeStyle='#a99bc9';ctx.lineWidth=2;ctx.stroke();
      for(let k=0;k<3;k++)circle(Math.cos(k*2.1)*h.r*.4,Math.sin(k*2.1)*h.r*.4,h.r*.14,'#2f2b40');
      ctx.restore();return;
    }
    if(h.type==='gate'){
      const dx=Math.cos(h.angle)*h.len/2,dy=Math.sin(h.angle)*h.len/2,x=h.x-cam;
      ctx.setLineDash([3,7]);ctx.beginPath();ctx.arc(x,h.y,h.len/2,0,TAU);ctx.strokeStyle='#ff8d8a33';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
      ctx.globalAlpha=.25;line(x-dx,h.y-dy,x+dx,h.y+dy,'#ff5d6c',14);ctx.globalAlpha=1;
      line(x-dx,h.y-dy,x+dx,h.y+dy,'#ff8d8a',7);line(x-dx,h.y-dy,x+dx,h.y+dy,'#ffd2c4',2);
      circle(x,h.y,10,'#2a3248');circle(x,h.y,5,'#ffd68b');return;
    }
    const shapes=G.hazardShapes(t,h);
    if(h.type==='spikes'){
      for(const s of shapes){
        const x=s.x-cam,base=s.base,tipY=s.dir===1?base+40:base-40;
        ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x+s.w/2,tipY);ctx.lineTo(x+s.w,base);ctx.closePath();ctx.fillStyle=h.hp<18?'#d65a68':'#ff7d87';ctx.fill();
        ctx.beginPath();ctx.moveTo(x+s.w/2,tipY);ctx.lineTo(x+s.w,base);ctx.lineTo(x+s.w/2,base);ctx.closePath();ctx.fillStyle='#d75469';ctx.fill();
      }
    }else if(h.type==='crate'){
      const r=shapes[0],x=r.x-cam;
      rr(x,r.y,r.w,r.h,5,'#4a3a2a','#ffbd78',2);rr(x+5,r.y+5,r.w-10,r.h-10,3,'#5d4632','#8a6a49');
      line(x+7,r.y+7,x+r.w-7,r.y+r.h-7,'#8a6a49',4);line(x+r.w-7,r.y+7,x+7,r.y+r.h-7,'#8a6a49',4);
      ctx.fillStyle='#ffd68b';ctx.font='bold 12px ui-sans-serif, sans-serif';ctx.textAlign='center';ctx.fillText('?',x+r.w/2,r.y+r.h/2+4);
    }else if(h.type==='laser'){
      const r=shapes[0],cx=r.x-cam+r.w/2;
      rr(cx-12,r.y-4,24,12,4,'#2a3248','#ff8d8a');rr(cx-12,r.y+r.h-8,24,12,4,'#2a3248','#ff8d8a');
      if(h.state==='on'){
        ctx.globalAlpha=.25;rr(cx-14,r.y,28,r.h,10,'#ff5d6c');ctx.globalAlpha=.9;rr(cx-5,r.y,10,r.h,4,'#ff7d87');ctx.globalAlpha=1;rr(cx-1.5,r.y,3,r.h,1,'#fff1f1');
      }else if(h.state==='warn'){ctx.globalAlpha=reduced.matches?.7:.4+.4*Math.sin(time*40);line(cx,r.y,cx,r.y+r.h,'#ff9ba3',2);ctx.globalAlpha=1;}
      else{ctx.setLineDash([4,9]);line(cx,r.y,cx,r.y+r.h,'#ff8d8a44',1.5);ctx.setLineDash([]);}
    }else if(h.type==='boost'){
      const dir=h.lane===2?1:-1;
      for(let k=0;k<4;k++){const wx=h.x+14+k*26+(reduced.matches?0:(time*80)%26);if(wx>h.x+h.w-6)continue;const y=G.surfaceY(t,h.lane,wx),cx=wx-cam;ctx.beginPath();ctx.moveTo(cx-6,y+dir*16);ctx.lineTo(cx+4,y+dir*10);ctx.lineTo(cx-6,y+dir*4);ctx.strokeStyle='#7df6a0';ctx.lineWidth=3;ctx.stroke();}
    }
  }
  function drawPickup(s,cam,time){
    const [color,glyph]=PICKUP_LOOK[s.type],x=s.x-cam;
    if(s.type==='ring'){
      const spin=reduced.matches?1:Math.abs(Math.cos(time*2.2+s.id));
      ctx.save();ctx.translate(x,s.y);ctx.globalAlpha=.25;circle(0,0,30,color);ctx.globalAlpha=1;
      ctx.beginPath();ctx.ellipse(0,0,8+18*spin,26,0,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.stroke();
      ctx.fillStyle=color;ctx.font='bold 13px ui-sans-serif, sans-serif';ctx.textAlign='center';ctx.fillText('+20',0,5);ctx.restore();return;
    }
    const y=s.y+(reduced.matches?0:Math.sin(time*3+s.id)*4);
    circle(x,y,24,color+'18');rr(x-16,y-16,32,32,10,'#10283c',color,2);
    ctx.fillStyle=color;ctx.textAlign='center';ctx.font='bold 19px ui-sans-serif, sans-serif';ctx.fillText(glyph,x,y+7);
  }
  function drawBullet(b,cam,time){
    const x=b.x-cam,color=b.reflected?'#ffffff':BULLET_COLORS[b.owner],a=Math.atan2(b.vy,b.vx-(snap?.speed||0));
    ctx.save();ctx.translate(x,b.y);if(b.echo)ctx.globalAlpha=.6;
    if(b.kind==='well'){ctx.globalAlpha=.35;circle(0,0,16,'#b98cff');ctx.globalAlpha=1;circle(0,0,9,'#1a0f2e');ctx.beginPath();ctx.arc(0,0,11,time*8,time*8+4);ctx.strokeStyle='#d8b3ff';ctx.lineWidth=2;ctx.stroke();ctx.restore();return;}
    if(b.kind==='hex'){ctx.rotate(time*9);ctx.globalAlpha=.3;circle(0,0,14,'#e3a4ff');ctx.globalAlpha=1;ctx.fillStyle='#f3d6ff';ctx.font='bold 18px ui-sans-serif, sans-serif';ctx.textAlign='center';ctx.fillText('✶',0,6);ctx.restore();return;}
    if(b.kind==='boomerang'){ctx.rotate(time*18);ctx.beginPath();ctx.arc(0,0,10,.3,Math.PI-.3);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.stroke();ctx.restore();return;}
    ctx.rotate(a);
    if(b.kind==='rail'){line(-70,0,0,0,color+'55',6);line(-70,0,6,0,'#eaffff',2);}
    else if(b.kind==='rocket'){if(!reduced.matches)circle(-14,0,5+Math.random()*3,'#ffb35c99');rr(-12,-4,18,8,4,'#4a3442',color,2);circle(6,0,3,'#ffd7b0');}
    else if(b.kind==='scatter'){circle(0,0,3.6,color);}
    else{line(-18,0,0,0,color+'88',2.5);rr(-6,-2,10,4,2,color);circle(3,0,1.8,'#fff9df');}
    ctx.restore();
  }
  function drawWell(w,cam,time){
    const x=w.x-cam,fade=Math.min(1,w.life*2);
    ctx.save();ctx.globalAlpha=fade;
    const g=ctx.createRadialGradient(x,w.y,4,x,w.y,w.r);g.addColorStop(0,'#000000ee');g.addColorStop(.25,'#3a1d6688');g.addColorStop(1,'#3a1d6600');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,w.y,w.r,0,TAU);ctx.fill();
    for(let k=0;k<4;k++){const a=(reduced.matches?0:time*3)+k*TAU/4;ctx.beginPath();ctx.arc(x,w.y,30+k*26,a,a+1.6);ctx.strokeStyle='#d8b3ff99';ctx.lineWidth=2.5;ctx.stroke();}
    ctx.setLineDash([4,8]);ctx.beginPath();ctx.arc(x,w.y,w.r,0,TAU);ctx.strokeStyle='#b98cff55';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
    circle(x,w.y,12,'#05020b');ctx.beginPath();ctx.arc(x,w.y,13,0,TAU);ctx.strokeStyle=PLAYER_COLORS[w.owner];ctx.lineWidth=2;ctx.stroke();
    ctx.restore();
  }
  function drawComet(c,cam,time){
    const x=c.x-cam;
    if(c.warn>0){
      ctx.globalAlpha=reduced.matches?.8:.45+.45*Math.sin(time*30);
      ctx.setLineDash([5,6]);ctx.beginPath();ctx.arc(x,c.y,26,0,TAU);ctx.strokeStyle='#ffb35c';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#ffd68b';ctx.font='bold 16px ui-sans-serif, sans-serif';ctx.textAlign='center';ctx.fillText('☄',x,c.y+6);ctx.globalAlpha=1;return;
    }
    if(!reduced.matches)for(let k=1;k<6;k++){ctx.globalAlpha=.35-k*.05;circle(x+k*11,c.y+Math.sin(time*20+k)*2,22-k*3,'#ff8d4a');}
    ctx.globalAlpha=1;circle(x,c.y,22,'#ff9d5c');circle(x-4,c.y-4,13,'#ffd7a0');
    ctx.save();ctx.translate(x,c.y);ctx.rotate(reduced.matches?0:-time*9);for(let k=0;k<3;k++)line(Math.cos(k*2.1)*8,Math.sin(k*2.1)*8,Math.cos(k*2.1)*17,Math.sin(k*2.1)*17,'#b4552b',3);ctx.restore();
  }
  function drawPlayer(p,pose,cam,time){
    if(!p.alive)return;
    const x=p.x-cam,up=p.inv>=0?1:-1,col=PLAYER_COLORS[p.id],rigWeapon=p.weapon==='blaster'||p.weapon==='boomerang'?'machine':p.weapon;
    if(p.offset<150){const g=ctx.createLinearGradient(0,0,160,0);g.addColorStop(0,'#ff4d5e55');g.addColorStop(1,'#ff4d5e00');ctx.fillStyle=g;ctx.fillRect(0,0,160,H);}
    if(p.ghost){
      // Time Echo ghost: where you were 0.6 s ago, firing what you fired then.
      Object.assign(ghostPose,{inversion:p.ghost.inv,phase:pose.phase-1,groundBlend:pose.groundBlend,angle:pose.angle});
      ctx.save();ctx.globalAlpha=.3;Rig.draw(ctx,p.avatar,p.ghost.x-cam,p.ghost.y,ghostPose,58,rigWeapon,{aimBack:p.ghost.aimBack});ctx.restore();
      ctx.globalAlpha=.4;ctx.setLineDash([3,6]);line(p.ghost.x-cam,p.ghost.y,x,p.y,'#c9b8ff',1.5);ctx.setLineDash([]);ctx.globalAlpha=1;
    }
    const blink=p.invuln>0&&!reduced.matches&&Math.floor(time*16)%2===0;
    ctx.save();if(blink)ctx.globalAlpha=.35;
    Rig.draw(ctx,p.avatar,x,p.y,pose,58,rigWeapon,{aimBack:p.aimBack});
    ctx.restore();
    if(p.flash>0){ctx.globalAlpha=Math.min(1,p.flash*3)*.5;circle(x,p.y-up*8,30,'#ff4d5e');ctx.globalAlpha=1;}
    if(clock-muzzle[p.id]<.05&&!reduced.matches){const dir=p.aimBack?-1:1;circle(x+dir*34,p.y-9*p.inv,8,'#fff3c0cc');}
    if(p.blades>0){
      for(let k=0;k<3;k++){
        const a=p.blade+k*TAU/3,bx=x+Math.cos(a)*48,by=p.y-9*p.inv+Math.sin(a)*48;
        ctx.save();ctx.translate(bx,by);ctx.rotate(a+Math.PI/2);ctx.beginPath();ctx.moveTo(0,-14);ctx.quadraticCurveTo(9,0,0,14);ctx.quadraticCurveTo(3,0,0,-14);ctx.fillStyle='#e6f6ff';ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
      }
      ctx.globalAlpha=.25;ctx.beginPath();ctx.arc(x,p.y-9*p.inv,48,0,TAU);ctx.strokeStyle=col;ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;
    }
    if(p.hex>0){
      ctx.save();ctx.translate(x,p.y-up*6);ctx.rotate(reduced.matches?0:time*3);
      for(let k=0;k<6;k++){const a=k*TAU/6;circle(Math.cos(a)*34,Math.sin(a)*34,2.5,'#e3a4ff');}ctx.restore();
    }
    if(p.shield>0){
      const pulse=reduced.matches?0:Math.sin(time*18)*2;
      ctx.globalAlpha=.16;circle(x,p.y-up*6,36+pulse,col);ctx.globalAlpha=1;
      ctx.beginPath();ctx.arc(x,p.y-up*6,36+pulse,0,TAU);ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.stroke();
      ctx.beginPath();ctx.arc(x,p.y-up*6,42,-Math.PI/2,-Math.PI/2+TAU*p.shield/S.shieldSeconds);ctx.strokeStyle='#ffffffaa';ctx.lineWidth=2;ctx.stroke();
    }
    const ty=p.y-up*58;
    rr(x-36,ty-9,72,18,6,'#07101ecc',col,1.5);
    ctx.fillStyle=col;ctx.font='bold 10px ui-sans-serif, sans-serif';ctx.textAlign='center';ctx.fillText(`P${p.id+1} · ${p.name}`.slice(0,14),x,ty-1);
    rr(x-30,ty+3,60,3,1.5,'#2b1b24');rr(x-30,ty+3,60*p.hp/S.maxHp,3,1.5,p.hp<35?'#ff7d87':'#7df6a0');
    ctx.font='bold 12px ui-sans-serif, sans-serif';
    if(p.hex>0){ctx.fillStyle='#e3a4ff';ctx.fillText('⇅ CONTROLS FLIPPED',x,ty+(up>0?-16:26));}
    else if(p.falling){ctx.fillStyle='#ffd68b';ctx.fillText(p.lane===0?'▲ climb out!':'▼ drop back!',x,ty+(up>0?-16:26));}
  }
  function draw(s){
    ctx.setTransform(view.dpr,0,0,view.dpr,0,0);ctx.fillStyle='#050b16';ctx.fillRect(0,0,view.w,view.h);
    ctx.save();ctx.translate(view.ox,view.oy);ctx.scale(view.scale,view.scale);ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
    const cam=s.camX,arena=G.ARENAS[s.terrain.arena];
    background(cam,arena);decks(s,cam);
    for(const h of s.hazards)if(h.x-cam<W+80&&h.x+(h.w||0)-cam>-80)drawHazard(h,s.terrain,cam,clock);
    for(const w of s.wells)drawWell(w,cam,clock);
    for(const p of s.pickups)drawPickup(p,cam,clock);
    for(const c of s.comets)drawComet(c,cam,clock);
    for(const b of s.bullets)drawBullet(b,cam,clock);
    s.players.forEach((p,i)=>drawPlayer(p,poses[i],cam,clock));
    for(const r of rings){ctx.globalAlpha=Math.max(0,r.life/r.max)*.8;ctx.beginPath();ctx.arc(r.x-cam,r.y,Math.max(1,r.r),0,TAU);ctx.strokeStyle=r.color;ctx.lineWidth=3;ctx.stroke();}ctx.globalAlpha=1;
    for(const p of particles){
      ctx.globalAlpha=Math.min(1,p.life/p.max*1.5);
      if(p.shard){ctx.save();ctx.translate(p.x-cam,p.y);ctx.rotate(p.angle);rr(-p.size/2,-p.size/2,p.size,p.size,1,p.color);ctx.restore();}
      else if(p.streak)line(p.x-cam,p.y,p.x-cam+26,p.y,p.color,p.size);
      else circle(p.x-cam,p.y,p.size,p.color);
    }ctx.globalAlpha=1;
    ctx.textAlign='center';
    for(const p of popups){ctx.globalAlpha=Math.min(1,p.life*2);ctx.font=`900 ${p.size}px ui-sans-serif, sans-serif`;ctx.lineWidth=4;ctx.strokeStyle='#07101e';const y=p.y-(1-p.life)*34;ctx.strokeText(p.text,p.x-cam,y);ctx.fillStyle=p.color;ctx.fillText(p.text,p.x-cam,y);}ctx.globalAlpha=1;
    if(state==='menu'||state==='lobby'){ctx.fillStyle='#050c18b0';ctx.fillRect(0,0,W,H);}
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD
  const hudCache={};
  function setText(el,text){if(el.textContent!==text)el.textContent=text;}
  function hud(s){
    s.players.forEach((p,i)=>{
      const card=$('card-'+i),special=p.weapon!=='blaster'&&p.special>0;
      setText(card.querySelector('.name'),p.name);
      setText(card.querySelector('.wins'),'●'.repeat(s.wins[i])+'○'.repeat(Math.max(0,s.roundsToWin-s.wins[i])));
      for(const slot of card.querySelectorAll('.slot')){
        const k=Number(slot.dataset.slot),id=p.powers[k],power=G.POWERS[id],ready=p.power>=power.cost&&p.powerCd[k]<=0;
        setText(slot.querySelector('i'),power.icon);setText(slot.querySelector('b'),String(power.cost));
        slot.title=`${power.label} · ${power.cost} power · ${power.text}`;slot.classList.toggle('ready',ready);
      }
      setText(card.querySelector('.status'),p.hex>0?'⇅ HEXED':p.blades>0?'✣ BLADES':p.echo>0?'◐ ECHO':'');
      const hp=card.querySelector('.bar.hp'),power=card.querySelector('.bar.power');
      const key=`${p.hp}|${p.power}|${p.weapon}|${p.special}|${p.ammo}|${p.nextAmmoAt-p.meters}`;
      if(hudCache[i]===key)return;hudCache[i]=key;
      hp.querySelector('i').style.width=p.hp/S.maxHp*100+'%';setText(hp.querySelector('span'),String(p.hp));hp.classList.toggle('low',p.hp<35);
      power.querySelector('i').style.width=p.power/S.maxPower*100+'%';power.classList.toggle('ready',p.power>=S.shieldCost);
      setText(card.querySelector('.weapon'),(special?G.WEAPONS[p.weapon].label:'Blaster').toUpperCase());
      const ammo=card.querySelector('.ammo'),count=special?p.special:p.ammo;
      setText(ammo,special?`${count} · +${p.ammo} reserve`:`${count} rounds`);ammo.classList.toggle('empty',!count);
      setText(card.querySelector('.refill'),`+${S.ammoRefill} in ${Math.max(0,p.nextAmmoAt-p.meters)} m`);
    });
    // Touch pads show each pilot's chosen power icons.
    document.querySelectorAll('.pad').forEach(pad=>{
      const seat=mode==='online'?net?.seat??0:Number(pad.dataset.player),p=s.players[seat];
      pad.querySelectorAll('.pw').forEach(b=>setText(b,G.POWERS[p.powers[b.dataset.act==='power1'?0:1]].icon));
    });
    setText($('round-label'),`ROUND ${s.round} · FIRST TO ${s.roundsToWin}`);setText($('arena-name'),s.arena.toUpperCase());
    const c=$('clock');c.classList.toggle('overtime',s.overtime);
    setText(c,s.overtime?'OVERTIME':`${Math.floor(s.timeLeft/60)}:${String(s.timeLeft%60).padStart(2,'0')}`);
  }

  // ---------------------------------------------------------------- loop
  function frame(now){
    const dt=last?Math.min(.1,(now-last)/1000):0;last=now;clock+=dt;
    if(state==='playing'&&mode==='local'&&sim){
      accumulator+=dt;
      while(accumulator>=STEP){sim.step(STEP);accumulator-=STEP;}
      snap=sim.snapshot();onEvents(sim.drainEvents());
    }
    if(mode==='online'&&net&&state==='playing'&&now-net.lastSend>300)sendInput();
    let s;
    if((state==='playing'||state==='paused'||state==='results')&&snap)s=blended();
    else{stepDemo(dt);s=demo.snapshot();}
    if(state!=='paused'){
      s.players.forEach((p,i)=>updatePose(poses[i],p,s.terrain,dt));
      for(const p of particles){p.life-=dt;p.x+=p.vx*dt+(s.speed||0)*dt;p.y+=p.vy*dt;if(p.gravity)p.vy+=p.gravity*dt;if(p.shard)p.angle+=p.spin*dt;}
      particles=particles.filter(p=>p.life>0);
      for(const p of popups){p.life-=dt*.9;p.x+=(s.speed||0)*dt;}popups=popups.filter(p=>p.life>0);
      for(const r of rings){r.life-=dt;r.r+=r.grow*dt;}rings=rings.filter(r=>r.life>0);
    }
    draw(s);if(snap&&(state==='playing'||state==='paused'))hud(s);
    if(bannerUntil&&now>bannerUntil)banner('');
    raf=requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- setup screen
  function drawPortrait(i){
    const c=$('portrait-'+i),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);
    Rig.draw(g,prefs.avatars[i],120,150,M.createPose(),170,'machine');
  }
  function renderLoadout(i,focusId){
    const host=document.querySelector(`.loadout-pick[data-player="${i}"]`);host.replaceChildren();
    const keys=i?['I','U']:['E','R'];
    for(const id of G.POWER_IDS){
      const power=G.POWERS[id],slot=prefs.powers[i].indexOf(id),b=document.createElement('button');
      b.type='button';b.className='power-chip'+(slot>=0?' on':'');b.setAttribute('aria-pressed',String(slot>=0));b.dataset.power=id;
      b.title=`${power.label} (${power.cost} power): ${power.text}`;
      for(const [tag,text] of [['i',power.icon],['span',power.label],['em',slot>=0?keys[slot]:String(power.cost)]]){const el=document.createElement(tag);el.textContent=text;b.append(el);}
      b.addEventListener('click',()=>{
        const list=prefs.powers[i];
        if(list.includes(id)){if(list.length>1)list.splice(list.indexOf(id),1);}else{if(list.length>=2)list.shift();list.push(id);}
        prefs.powers[i]=G.cleanPowers(list,G.POWER_IDS.filter(x=>x!==id));
        savePrefs();renderLoadout(i,id);$('power-text-'+i).textContent=`${power.icon} ${power.label}: ${power.text}`;
      });
      b.addEventListener('mouseenter',()=>{$('power-text-'+i).textContent=`${power.icon} ${power.label} · ${power.cost}: ${power.text}`;});
      host.append(b);
    }
    if(focusId)host.querySelector(`[data-power="${focusId}"]`)?.focus();
    else $('power-text-'+i).textContent='Selected: '+prefs.powers[i].map((id,k)=>`${keys[k]} ${G.POWERS[id].icon} ${G.POWERS[id].label}`).join('  ·  ');
  }
  for(const i of [0,1]){
    const input=$('name-'+i);input.value=prefs.names[i];
    input.addEventListener('input',()=>{prefs.names[i]=G.cleanName(input.value);savePrefs();});
    drawPortrait(i);renderLoadout(i);
  }
  document.querySelectorAll('[data-avatar]').forEach(b=>b.addEventListener('click',()=>{
    const i=Number(b.dataset.avatar),ids=G.AVATAR_IDS;prefs.avatars[i]=ids[(ids.indexOf(prefs.avatars[i])+1)%ids.length];savePrefs();drawPortrait(i);
  }));
  $('local').addEventListener('click',startLocal);
  $('host').addEventListener('click',host);$('join').addEventListener('click',join);
  $('join-code').addEventListener('keydown',e=>{if(e.key==='Enter')join();});
  $('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('share-link').value);$('copy').textContent='Copied!';}catch{$('share-link').select();}setTimeout(()=>{$('copy').textContent='Copy link';},1500);});
  $('resume').addEventListener('click',resume);$('pause').addEventListener('click',pause);
  $('rematch').addEventListener('click',async()=>{
    audioInit();
    if(mode==='local'){sim.restartMatch();resetEffects();snap=sim.snapshot();onEvents(sim.drainEvents());show('playing');return;}
    if(!net)return;$('rematch').disabled=true;
    try{await api('rematch',{code:net.code,token:net.token});}catch(error){$('rematch').disabled=false;banner(error.message,'',2000);}
  });
  document.querySelectorAll('[data-menu]').forEach(b=>b.addEventListener('click',toMenu));
  $('sound').addEventListener('click',()=>{prefs.sound=!prefs.sound;savePrefs();setSound();if(soundBank)soundBank.enabled(prefs.sound);audioInit();});
  addEventListener('resize',resize);
  const params=new URLSearchParams(location.search),room=(params.get('room')||'').toUpperCase().slice(0,4);
  let resumed=false;
  if(room){
    $('join-code').value=room;
    try{const saved=JSON.parse(sessionStorage.getItem('gravity-duel-session')||'null');if(saved&&saved.code===room){resumed=true;connect(saved);}}catch{}
    if(!resumed){
      $('online-note').textContent=`You were invited to room ${room}. Set up your pilot (P2) and powers, then press Join.`;
      // Coming from the home screen's "Join a friend" box: join straight away with your saved P2 setup.
      if(params.get('join')==='1'&&/^[A-Z]{4}$/.test(room)){resumed=true;show('menu');join();}
    }
  }
  window.GravityDuelGame=Object.freeze({snapshot:()=>({state,mode,seat:net?.seat??null,snap:snap&&JSON.parse(JSON.stringify(snap))}),
    dispose:()=>{cancelAnimationFrame(raf);leaveOnline();soundBank?.dispose();audio?.close().catch(()=>{});}});
  resize();setSound();if(!resumed)show('menu');raf=requestAnimationFrame(frame);
})();
