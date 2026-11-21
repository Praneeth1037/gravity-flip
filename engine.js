/* Shared deterministic simulation. No DOM, rendering, or wall-clock dependencies. */
(function(root) {
  'use strict';
  const SETTINGS = Object.freeze({
    height:600, ceiling:100, floor:500, radius:17, artworkRadius:25,
    gravity:3400, flipImpulse:600, maxVerticalSpeed:1600,
    baseSpeed:340, maxSpeed:520, speedRampMeters:2000, themeBlendUnits:700,
    fixedStep:1/120, reactionSeconds:0.42, runway:900,
    nearMissClearance:10, nearMissBonus:5, metersPerUnit:0.1,
    movingAfterSeconds:12, minimumWidth:600, maximumWidth:1600, obstacleHistory:800, maxTunnelHeight:490,
    difficultyRampMeters:1400, difficultyStepMeters:220, earlyExtraGap:80, gapJitter:90,
    magnetSeconds:8, magnetRadius:240, overdriveSeconds:8, doubleSeconds:10,
    startingAmmo:48, maxAmmo:96, ammoRefillMeters:150, ammoRefill:32, ammoCrate:24, specialAmmo:18, phaseSeconds:5, novaRadius:360,
    shotCooldown:.075, overdriveCooldown:.05, bulletSpeed:1400, slowSeconds:6, slowFactor:0.72,
    chainSeconds:3, chainTarget:5, chainBonus:15, milestoneMeters:250, milestoneStars:3,
    maxRicochets:2, ricochetKeep:.82, bankShotBonus:10, shoveImpulse:.9,
    rideBoost:1.12, rideBonus:{loop:15,spiral:40,twist:20}
  });
  const AVATARS = [
    {id:'orbit',name:'Orbit',color:'#ffa441',cost:0,description:'A little robot. A big adventure.'},
    {id:'wisp',name:'Wisp',color:'#81ffe0',cost:5,description:'A friendly ghost with a fearless streak.'},
    {id:'pebble',name:'Pebble',color:'#bf9aff',cost:15,description:'Small horns. Cosmic courage.'},
    {id:'astro',name:'Astro',color:'#eef6ff',cost:30,description:'One small flip for an explorer.'}
  ];
  const crossTime = () => {
    const distance=SETTINGS.maxTunnelHeight-2*SETTINGS.radius;
    const t=(SETTINGS.maxVerticalSpeed-SETTINGS.flipImpulse)/SETTINGS.gravity;
    const d=SETTINGS.flipImpulse*t+SETTINGS.gravity*t*t/2;
    return distance<=d ? (Math.sqrt(SETTINGS.flipImpulse**2+2*SETTINGS.gravity*distance)-SETTINGS.flipImpulse)/SETTINGS.gravity : t+(distance-d)/SETTINGS.maxVerticalSpeed;
  };
  const minimumGap=()=>Math.ceil(SETTINGS.maxSpeed*(crossTime()+SETTINGS.reactionSeconds)+2*SETTINGS.radius+24);
  function speedAt(distance){
    const progress=Math.max(0,Math.min(1,distance*SETTINGS.metersPerUnit/SETTINGS.speedRampMeters));
    return SETTINGS.baseSpeed+(SETTINGS.maxSpeed-SETTINGS.baseSpeed)*progress;
  }
  function readSave(raw) {
    const clean={version:1,best:0,totalStars:0,selected:'orbit',sound:true};
    try {
      const data=typeof raw==='string'?JSON.parse(raw):raw;
      if(!data || typeof data!=='object')return clean;
      for(const k of ['best','totalStars']) if(Number.isFinite(data[k])&&data[k]>=0)clean[k]=Math.min(k==='best'?1e9:1e7,Math.floor(data[k]));
      if(typeof data.sound==='boolean')clean.sound=data.sound;
      if(AVATARS.some(a=>a.id===data.selected&&a.cost<=clean.totalStars))clean.selected=data.selected;
    }catch{}
    return clean;
  }
  // Independently authored world-space rails. These coordinates drive both rendering and landings.
  const TERRAIN_SPAN=1200;
  const TERRAIN = [
    {name:'Launch terraces',top:[[0,100],[350,100],[570,165],[810,165],[1020,70],[1200,100]],bottom:[[0,500],[280,500],[460,425],[710,425],[970,540],[1200,500]]},
    {name:'Split-level gallery',top:[[0,100],[180,160],[430,160],[670,65],[920,65],[1200,100]],bottom:[[0,500],[210,500],[440,550],[640,550],[880,410],[1040,410],[1200,500]]},
    {name:'Compression chamber',top:[[0,100],[210,100],[430,205],[680,205],[900,80],[1200,100]],bottom:[[0,500],[260,405],[530,445],[780,550],[1000,550],[1200,500]]},
    {name:'Sawtooth causeway',top:[[0,100],[170,60],[350,60],[570,155],[850,155],[1060,80],[1200,100]],bottom:[[0,500],[210,410],[390,410],[600,520],[830,430],[1000,430],[1200,500]]},
    {name:'High vault',top:[[0,100],[190,180],[380,180],[600,60],[910,60],[1200,100]],bottom:[[0,500],[240,540],[480,540],[720,390],[930,390],[1200,500]]},
    {name:'Cantilever docks',top:[[0,100],[150,100],[300,165],[460,165],[660,70],[850,70],[1030,145],[1200,100]],bottom:[[0,500],[160,440],[330,440],[470,500],[660,500],[840,400],[1000,400],[1200,500]]},
    {name:'Cathedral concourse',top:[[0,100],[210,185],[360,185],[520,95],[660,60],[830,95],[1000,175],[1200,100]],bottom:[[0,500],[190,550],[400,550],[600,445],[780,445],[960,520],[1200,500]]},
    {name:'Stepped transit hall',top:[[0,100],[200,60],[400,60],[580,130],[730,130],[930,205],[1050,160],[1200,100]],bottom:[[0,500],[180,420],[340,420],[530,480],[730,480],[910,550],[1060,550],[1200,500]]}

  ];
  function interpolate(nodes,x){
    for(let i=1;i<nodes.length;i++)if(x<=nodes[i][0]){const a=nodes[i-1],b=nodes[i];const t=(x-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*(.5-.5*Math.cos(Math.PI*t));}
    return nodes[nodes.length-1][1];
  }
  // Circular caps use true circle geometry in the middle and tangent-matched end blends.
  function circularCap(x,center,width,height){
    const d=Math.abs(x-center);if(d>=width)return 0;
    const radius=(width*width+height*height)/(2*height),join=width-55;
    const value=q=>Math.sqrt(radius*radius-q*q)-(radius-height);
    if(d<=join)return value(d);
    const t=(d-join)/55,v=value(join),slope=-join/Math.sqrt(radius*radius-join*join);
    return (2*t*t*t-3*t*t+1)*v+(t*t*t-2*t*t+t)*55*slope;
  }
  TERRAIN.splice(2,0,
    {name:'Lunar bowls',top:[[0,100],[1200,100]],bottom:[[0,500],[1200,500]],arcs:{top:[[340,260,95],[930,200,-35]],bottom:[[800,280,-100],[250,200,45]]}},
    {name:'Orbital domes',top:[[0,100],[1200,100]],bottom:[[0,500],[1200,500]],arcs:{top:[[780,290,100]],bottom:[[350,260,-105],[900,240,45]]}},
    {name:'Wave garden',top:[[0,100],[1200,100]],bottom:[[0,500],[1200,500]],arcs:{top:[[300,240,80],[890,260,95]],bottom:[[590,280,-95],[1040,150,35]]}}
  );
  function terrainAt(x){
    if(x<0)return {top:100,bottom:500,name:TERRAIN[0].name};
    const index=Math.floor(x/TERRAIN_SPAN)%TERRAIN.length,local=x%TERRAIN_SPAN,t=TERRAIN[index];
    const value=side=>interpolate(t[side],local)+(t.arcs?.[side]||[]).reduce((v,[center,width,height])=>v+Math.sign(height)*circularCap(local,center,width,Math.abs(height)),0);
    return {top:value('top'),bottom:value('bottom'),name:t.name};
  }
  function boundsAt(x){
    const samples=[terrainAt(x-SETTINGS.radius),terrainAt(x),terrainAt(x+SETTINGS.radius)];
    return {top:Math.max(...samples.map(t=>t.top))+SETTINGS.radius,bottom:Math.min(...samples.map(t=>t.bottom))-SETTINGS.radius};
  }
  function terrainVertices(from,to,side){
    const out=[[from,terrainAt(from)[side]]];
    for(let n=Math.max(0,Math.floor(from/TERRAIN_SPAN));n<=Math.floor(to/TERRAIN_SPAN);n++)for(const [x,y] of TERRAIN[n%TERRAIN.length][side]){const wx=n*TERRAIN_SPAN+x;if(wx>from&&wx<to)out.push([wx,y]);}
    // Sample curved edges on a world-anchored grid so scrolling never changes their shape.
    for(let x=Math.ceil(from/4)*4;x<to;x+=4)if(x>from)out.push([x,terrainAt(x)[side]]);
    out.push([to,terrainAt(to)[side]]);return out.sort((a,b)=>a[0]-b[0]);
  }
  // Missing deck spans are actual holes. Each challenge retains a continuous opposite landing lane.
  // Small breaks isolate hazard islands; larger chasms are standalone, explicitly signposted challenges.
  function surfaceOpenings(obstacles){
    const out=[];
    for(const o of obstacles){
      if(!o.terrain||o.id<2)continue;
      const lane=safeGravity(o,0);if(!lane)continue;
      const side=lane===-1?'bottom':'top';
      if(o.kind.startsWith('gap-'))out.push({from:o.x,to:o.x+o.width,side,id:o.id,major:true});
      else{
        out.push({from:o.x-130,to:o.x-22,side,id:o.id});
        out.push({from:o.x+o.width+22,to:o.x+o.width+120,side,id:o.id});
      }
    }
    return out;
  }
  function hasSurface(x,side,openings){return !openings.some(g=>g.side===side&&x>g.from&&x<g.to);}
  function platformSpans(from,to,side,openings){
    const gaps=openings.filter(g=>g.side===side&&g.to>from&&g.from<to).sort((a,b)=>a.from-b.from),out=[];
    let cursor=from;
    for(const g of gaps){if(g.from>cursor)out.push([cursor,Math.min(to,g.from)]);cursor=Math.max(cursor,g.to);}
    if(cursor<to)out.push([cursor,to]);return out;
  }
  function localBounds(o){
    if(!o.terrain)return {top:SETTINGS.ceiling,bottom:SETTINGS.floor,gap:400};
    const samples=Array.from({length:9},(_,i)=>terrainAt(o.x+i*o.width/8));
    const top=Math.max(...samples.map(t=>t.top)),bottom=Math.min(...samples.map(t=>t.bottom));
    return {top,bottom,gap:bottom-top};
  }
  function segmentDistance(px,py,ax,ay,bx,by) {
    const t=Math.max(0,Math.min(1,((px-ax)*(bx-ax)+(py-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));
    return Math.hypot(px-ax-t*(bx-ax),py-ay-t*(by-ay));
  }
  function triangleDistance(x,y,points) {
    const signs=points.map((p,i)=>{const q=points[(i+1)%3];return (x-q[0])*(p[1]-q[1])-(p[0]-q[0])*(y-q[1]);});
    if(signs.every(s=>s>=0)||signs.every(s=>s<=0))return 0;
    return Math.min(...points.map((p,i)=>segmentDistance(x,y,...p,...points[(i+1)%3])));
  }
  function triangles(o) {
    const floor=o.kind==='floor';
    const base=x=>o.terrain?terrainAt(x)[floor?'bottom':'top']:floor?SETTINGS.floor:SETTINGS.ceiling;
    return Array.from({length:3},(_,i)=>{const a=o.x+i*o.width/3,b=o.x+(i+1)*o.width/3,m=(a+b)/2;return [[a,base(a)],[m,base(m)+(floor?-o.height:o.height)],[b,base(b)]];});
  }
  function moverY(o,time){const b=localBounds(o);return (b.top+b.bottom)/2+Math.sin(time*(o.motionRate||1.65)+o.phase)*Math.min(65,(b.gap-150)/2);}
  const SECTORS = [
    {name:'Skyport terraces',at:0,color:'#6de8e1',sky:'#14283e'},
    {name:'Suspended foundry',at:1600,color:'#ffbd78',sky:'#292039'},
    {name:'Fractured skybridges',at:4000,color:'#afa6ff',sky:'#211e48'},
    {name:'Orbital reactor',at:7200,color:'#7bf3be',sky:'#103b36'}
  ];
  const sectorAt=distance=>SECTORS.reduce((n,s,i)=>distance>=s.at?i:n,0);
  function mixColor(a,b,t){
    return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
  }
  function themeAt(distance){
    const to=sectorAt(distance),from=Math.max(0,to-1),linear=to?Math.max(0,Math.min(1,(distance-SECTORS[to].at)/SETTINGS.themeBlendUnits)):1;
    const mix=linear*linear*(3-2*linear),a=SECTORS[from],b=SECTORS[to];
    const deck=['#223b52','#3e354b','#30364f','#213f49'],thickness=[32,44,26,36];
    return {from,to,mix,sky:mixColor(a.sky,b.sky,mix),color:mixColor(a.color,b.color,mix),deck:mixColor(deck[from],deck[to],mix),
      thickness:thickness[from]*(1-mix)+thickness[to]*mix,moonRadius:(from===3?105:68)*(1-mix)+(to===3?105:68)*mix,
      layers:from===to?[{index:to,alpha:1}]:[{index:from,alpha:1-mix},{index:to,alpha:mix}]};
  }
  // Every choice is a designed obstacle with a proven safe lane; the director randomizes their order.
  const OBSTACLE_POOL = [
    {kind:'floor',tier:0,weight:3},{kind:'ceiling',tier:0,weight:3},
    {kind:'gap-floor',tier:0,weight:2.4},{kind:'gap-ceiling',tier:0,weight:2.4},
    {kind:'floor-tower',tier:1,weight:2},{kind:'ceiling-tower',tier:1,weight:2},
    {kind:'wheel-floor',tier:1,weight:2},{kind:'wheel-ceiling',tier:1,weight:2},
    {kind:'orbit-floor',tier:2,weight:2.4},{kind:'orbit-ceiling',tier:2,weight:2.4},
    {kind:'pendulum-floor',tier:2,weight:2.4},{kind:'pendulum-ceiling',tier:2,weight:2.4},
    {kind:'comb-floor',tier:1,weight:2.2},{kind:'comb-ceiling',tier:1,weight:2.2},
    {kind:'crusher-floor',tier:2,weight:2},{kind:'crusher-ceiling',tier:2,weight:2},
    {kind:'bridge',tier:2,weight:1.2},{kind:'arch',tier:2,weight:1.2},
    {kind:'moving',tier:2,weight:1.2},
    {kind:'piston-floor',tier:3,weight:2},{kind:'piston-ceiling',tier:3,weight:2},
    // Rideable track: loop-the-loops and corkscrew spirals on either deck, and twisting semi-loops that swap decks.
    {kind:'loop-floor',tier:1,weight:1.1},{kind:'loop-ceiling',tier:1,weight:1.1},{kind:'twist',tier:1,weight:1.3},
    {kind:'spiral-floor',tier:2,weight:.8},{kind:'spiral-ceiling',tier:2,weight:.8}
  ];
  const RIDES=new Set(['loop-floor','loop-ceiling','spiral-floor','spiral-ceiling','twist']);
  const isRide=o=>RIDES.has(o.kind);
  const rideFamily=kind=>kind==='twist'?'twist':kind.startsWith('spiral-')?'spiral':'loop';
  const TAU=Math.PI*2;
  // Size a ride to the tunnel it sits in: a loop must clear a runner on the opposite deck.
  function rideGeometry(kind,x){
    if(kind==='twist')return {width:380,loopRadius:0};
    const spiral=kind.startsWith('spiral-'),b=localBounds({terrain:true,x,width:spiral?900:220});
    const R=spiral?Math.max(58,Math.min(85,(b.gap-130)/2*.7)):Math.max(70,Math.min(125,(b.gap-130)/2)),c=R*(spiral?.5:.24),A=TAU*(spiral?3:1);
    let maxX=0;for(let i=0;i<=240;i++){const a=A*i/240;maxX=Math.max(maxX,c*a+R*Math.sin(a));}
    return {width:Math.ceil(maxX)+2,loopRadius:Math.round(R*10)/10};
  }
  // The world-space path a runner's centre follows on a ride, entered from one deck ('bottom' or 'top').
  // Each sample carries the tangent angle and the body inversion (1 upright on the floor, -1 hanging from the ceiling).
  function ridePath(o,side){
    const key=side==='bottom'?'_pathBottom':'_pathTop';
    if(o[key])return o[key];
    const floor=side==='bottom',sign=floor?1:-1,points=[];
    if(o.kind==='twist'){
      // Semi-loop with a corkscrew roll: climb (or drop) to the far deck while rolling over to stand on it.
      const x0=o.x,x1=o.x+o.width,y0=boundsAt(x0)[side],y1=boundsAt(x1)[floor?'top':'bottom'],N=140;
      for(let i=0;i<=N;i++){
        const t=i/N,e=t*t*t*(t*(t*6-15)+10),roll=Math.max(0,Math.min(1,(t-.3)/.4)),r=roll*roll*(3-2*roll);
        points.push({x:x0+(x1-x0)*t,y:y0+(y1-y0)*e,inv:sign*Math.cos(Math.PI*r),a:Math.PI*r});
      }
    }else{
      const spiral=o.kind.startsWith('spiral-'),R=o.loopRadius,c=R*(spiral?.5:.24),A=TAU*(spiral?3:1),N=spiral?420:170;
      // The coil's hub glides along the deck, so every turn touches down exactly on the runner line, like a slinky.
      for(let i=0;i<=N;i++){
        const a=A*i/N,hub=o.x+c*a;
        points.push({x:hub+R*Math.sin(a),y:boundsAt(hub)[side]-sign*R*(1-Math.cos(a)),inv:sign,a});
      }
    }
    let length=0;
    for(let i=0;i<points.length;i++){
      const p=points[Math.max(0,i-1)],q=points[Math.min(points.length-1,i+1)];
      points[i].angle=Math.atan2(q.y-p.y,q.x-p.x);
      if(i)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
      points[i].s=length;
    }
    return Object.defineProperty(o,key,{value:{points,length},enumerable:false,configurable:true})[key];
  }
  function difficultyAt(distance){
    const meters=distance*SETTINGS.metersPerUnit;
    return {level:Math.min(8,1+Math.floor(meters/SETTINGS.difficultyStepMeters)),intensity:Math.min(1,Math.max(0,(meters-80)/SETTINGS.difficultyRampMeters))};
  }
  function safeGravity(o,current=1){
    if(RIDES.has(o.kind))return current;
    return o.kind==='floor'||o.kind.endsWith('-floor')||o.kind==='floor-tower'?-1:
      o.kind==='ceiling'||o.kind.endsWith('-ceiling')||o.kind==='ceiling-tower'?1:current;
  }
  function rectangles(o,time){
    const {x,width:w,kind}=o,b=localBounds(o),mid=(b.top+b.bottom)/2;
    if(kind.startsWith('comb-'))return [.58,1,.74, .9].map((f,i)=>{
      const h=Math.min(b.gap-100,(o.rise||160)*f+32),cw=w/7;
      return {x:x+i*w*2/7,y:kind==='comb-floor'?b.bottom-h:b.top,w:cw,h};
    });
    if(kind.startsWith('crusher-'))return [0,1].map(i=>{
      const h=Math.min(b.gap-105,(o.rise||170)+35)*(.72+.28*Math.sin(time*(o.motionRate||1.5)+o.phase+i*Math.PI));
      return {x:x+i*w*.6,y:kind==='crusher-floor'?b.bottom-h:b.top,w:w*.4,h};
    });
    if(kind==='bridge')return [{x,y:mid-30,w,h:60}];
    if(kind==='arch')return [{x,y:mid-45,w,h:26},{x,y:mid-19,w:26,h:64},{x:x+w-26,y:mid-19,w:26,h:64}];
    if(kind.startsWith('piston-')){
      const h=Math.min(o.rise||180,b.gap-110)*(.69+.31*Math.sin(time*(o.motionRate||1.4)+o.phase));
      return [{x,y:kind==='piston-floor'?b.bottom-h:b.top,w,h}];
    }
    if(kind.endsWith('-tower'))return [.58,1,.75].map((f,i)=>{const h=f*Math.min(o.rise||180,b.gap-100);return {x:x+i*w/3,y:kind==='floor-tower'?b.bottom-h:b.top,w:w/3,h};});
    return [];
  }
  // Pendulums never swing past this angle, so the opposite lane and the obstacle's announced span stay safe however hard they are pushed.
  const SWING_LIMIT=.85;
  function surfaceNormal(x,side){
    const s=(terrainAt(x+4)[side]-terrainAt(x-4)[side])/8,n=Math.hypot(s,1);
    return side==='top'?{x:-s/n,y:1/n}:{x:s/n,y:-1/n};
  }
  function circles(o,time){
    if(!['wheel-','orbit-','pendulum-'].some(prefix=>o.kind.startsWith(prefix)))return [];
    const b=localBounds(o),floor=o.kind.endsWith('-floor'),direction=floor?-1:1,base=floor?b.bottom:b.top,cx=o.x+o.width/2;
    if(o.kind.startsWith('wheel-')){const r=Math.min(70+(o.intensity||0)*16,(b.gap-105)/2);return [{x:cx,y:base+direction*r,r}];}
    if(o.kind.startsWith('orbit-')){
      const r=20,orbit=Math.min(54,(b.gap-115)/2-r),cy=base+direction*(orbit+r+5),a=time*(o.motionRate||1.5)+o.phase;
      return [{x:cx,y:cy,r:23},...[0,1,2].map(i=>({x:cx+Math.cos(a+i*Math.PI*2/3)*orbit,y:cy+Math.sin(a+i*Math.PI*2/3)*orbit,r}))];
    }
    if(o.kind.startsWith('pendulum-')){
      // A live run integrates real pendulum physics into o.swing; previews and tests fall back to the ideal swing.
      const r=29,length=Math.min(145,b.gap-110-2*r,(o.width/2-r-8)/Math.sin(SWING_LIMIT)),angle=o.swing?o.swing.a:Math.sin(time*(o.motionRate||1.5)+o.phase)*SWING_LIMIT;
      return [{x:cx+Math.sin(angle)*length,y:base+direction*(r+Math.cos(angle)*length),r}];
    }
    return [];
  }
  function clearance(o,x,y,time) {
    if(o.destroyed||o.kind.startsWith('gap-'))return Infinity;
    const round=circles(o,time);if(round.length)return Math.min(...round.map(c=>Math.hypot(x-c.x,y-c.y)-c.r))-SETTINGS.radius;
    if(o.kind==='moving')return Math.hypot(x-o.x-o.width/2,y-moverY(o,time))-o.radius-SETTINGS.radius;
    if(o.kind==='floor'||o.kind==='ceiling')return Math.min(...triangles(o).map(t=>triangleDistance(x,y,t)))-SETTINGS.radius;
    return Math.min(...rectangles(o,time).map(r=>Math.hypot(Math.max(r.x-x,0,x-r.x-r.w),Math.max(r.y-y,0,y-r.y-r.h))))-SETTINGS.radius;
  }
  function debrisFor(o,time){
    const parts=[];
    if(o.kind==='floor'||o.kind==='ceiling'){
      for(const t of triangles(o)){const x=(t[0][0]+t[1][0]+t[2][0])/3,y=(t[0][1]+t[1][1]+t[2][1])/3;for(const dy of [-12,10])parts.push({x,y:y+dy,w:18,h:20,triangle:true});}
    }else if(o.kind==='moving'||circles(o,time).length){
      const bodies=o.kind==='moving'?[{x:o.x+o.width/2,y:moverY(o,time),r:o.radius}]:circles(o,time);
      for(const c of bodies)for(let i=0;i<5;i++){const a=i*Math.PI*2/5;parts.push({x:c.x+Math.cos(a)*c.r*.6,y:c.y+Math.sin(a)*c.r*.6,w:14,h:16});}
    }else for(const r of rectangles(o,time)){
      const rows=Math.min(5,Math.max(1,Math.ceil(r.h/36)));
      for(let i=0;i<rows;i++)parts.push({x:r.x+r.w/2,y:r.y+(i+.5)*r.h/rows,w:Math.min(26,r.w*.65),h:Math.min(22,r.h/rows)});
    }
    return parts.slice(0,24);
  }
  const destructible=o=>!o.kind.startsWith('gap-')&&!RIDES.has(o.kind);
  const targetY=(target,time)=>target.y+Math.sin(time*1.8+target.phase)*12;
  class Run {
    constructor(best=0,seed=Math.floor(Math.random()*4294967296)){
      this.distance=0;this.time=0;this.speed=SETTINGS.baseSpeed;this.y=SETTINGS.floor-SETTINGS.radius;this.vy=0;this.gravity=1;
      this.alive=true;this.stars=0;this.bonus=0;this.previousBest=best;this.obstacles=[];this.collectibles=[];this.events=[];this.flips=0;
      this.ammo=SETTINGS.startingAmmo;this.specialAmmo=0;this.bulletType='standard';this.weapon='machine';this.burstIndex=0;this.nextAmmoAt=SETTINGS.ammoRefillMeters;
      this.powers={phase:0,shield:0,magnet:0,slow:0,overdrive:0,double:0};this.bullets=[];this.targets=[];this.shotTimer=0;this.shots=0;this.kills=0;this.bankShots=0;this.ride=null;this.rides=0;this.killChain=0;this.killUntil=0;this.rewardStars=0;this.chain=0;this.chainUntil=0;this.bestChain=0;this.nextMilestone=SETTINGS.milestoneMeters;this.sector=0;
      this.seed=seed>>>0||1;this.nextX=SETTINGS.runway;this.sequence=0;this.lastKind=null;this.lastLane=0;this.sinceMover=0;this.sinceRide=0;this.rush=null;this.rushQueue=[];this.nextRushIndex=4;this.difficulty=difficultyAt(0);this.queue=['floor','ceiling','gap-floor','gap-ceiling'];this.fill();
    }
    random(){this.seed^=this.seed<<13;this.seed^=this.seed>>>17;this.seed^=this.seed<<5;return (this.seed>>>0)/4294967296;}
    chooseKind(tier,intensity){
      // Set-piece cadence: a loop, spiral or twist turns up every few obstacles once the run is under way.
      if(tier>=1&&this.sinceRide>=3){const rides=OBSTACLE_POOL.filter(o=>RIDES.has(o.kind)&&o.tier<=tier&&o.kind!==this.lastKind);return rides[Math.floor(this.random()*rides.length)].kind;}
      if(tier>=2&&this.time>=SETTINGS.movingAfterSeconds&&this.sinceMover>=16)return 'moving';
      const choices=OBSTACLE_POOL.filter(o=>o.tier<=tier&&(o.kind!=='moving'||this.time>=SETTINGS.movingAfterSeconds)).map(o=>{
        const lane=safeGravity(o,0),mechanical=o.kind==='moving'||(o.kind.startsWith('piston')||o.kind.startsWith('crusher')||o.kind.startsWith('orbit')||o.kind.startsWith('pendulum'));
        let weight=o.weight*(mechanical?1+intensity*2:1);
        if(lane&&this.lastLane)weight*=lane!==this.lastLane?1+intensity*4:.8-intensity*.5;
        if(o.kind===this.lastKind)weight*=.12;
        return {...o,weight};
      });
      let pick=this.random()*choices.reduce((sum,o)=>sum+o.weight,0);
      for(const o of choices){pick-=o.weight;if(pick<=0)return o.kind;}
      return choices[choices.length-1].kind;
    }
    flip(){if(!this.alive||this.ride)return;this.gravity*=-1;this.vy=this.gravity*Math.max(SETTINGS.flipImpulse,Math.abs(this.vy));this.flips++;this.events.push({type:'flip'});}
    shoot(){
      if(!this.alive||this.shotTimer>1e-8||this.ammo+this.specialAmmo===0)return false;
      const powered=this.powers.overdrive>0,special=this.specialAmmo>0,weapon=special?this.weapon:'machine',type=special?this.bulletType:'standard';
      if(special)this.specialAmmo--;else this.ammo--;
      let interval=SETTINGS.shotCooldown;
      if(weapon==='scatter')interval=.32;
      else if(weapon==='rail')interval=.42;
      else if(weapon==='burst'){this.burstIndex=(this.burstIndex+1)%3;interval=this.burstIndex===0?.32:.055;}
      this.shotTimer=powered?(weapon==='machine'?SETTINGS.overdriveCooldown:interval*2/3):interval;this.shots++;
      const x=this.px+22,y=this.y-this.gravity*13;
      const target=this.targets.filter(t=>!t.destroyed&&t.x>x&&t.x-x<520&&Math.abs(targetY(t,this.time)-y)<170).sort((a,b)=>a.x-b.x)[0];
      const angle=target?Math.atan2(targetY(target,this.time)-y,target.x-x):0;
      const spreads=weapon==='scatter'?[-.24,-.12,0,.12,.24]:powered?[-.12,0,.12]:[0];
      const speed=weapon==='rail'?2000:SETTINGS.bulletSpeed;
      for(const spread of spreads)this.bullets.push({x,y,vx:Math.cos(angle+spread)*speed+this.speed,vy:Math.sin(angle+spread)*speed,life:.85,powered,type,weapon,remaining:type==='pierce'?3:1,hitIds:[],bounces:0});
      this.events.push({type:'shoot',x,y,powered,weapon});return true;
    }
    bounty(x,y,stars,points){
      const multiplier=this.powers.double>0?2:1;
      this.rewardStars+=stars*multiplier;this.bonus+=points*multiplier;
      this.kills++;this.killChain=this.time<=this.killUntil?this.killChain+1:1;this.killUntil=this.time+4;
      this.events.push({type:'burst',x,y,stars:stars*multiplier,points:points*multiplier});
      if(this.killChain%3===0){this.rewardStars+=5*multiplier;this.events.push({type:'bounty-chain',stars:5*multiplier});}
    }
    addAmmo(amount){const added=Math.min(amount,SETTINGS.maxAmmo-this.ammo);this.ammo+=added;return added;}
    damageObstacle(o,damage,x,y,bullet=null){
      if(o.destroyed||!destructible(o))return;
      o.hp=(o.hp??(['floor','ceiling'].includes(o.kind)?2:3))-damage;
      this.events.push({type:'hit',x,y});
      if(o.hp<=0){this.events.push({type:'destroy',parts:debrisFor(o,this.time)});o.destroyed=true;o.awarded=true;this.bounty(x,y,1,10);if(bullet)this.bankShot(bullet,x,y);}
    }
    // A kill made with a round that has already bounced off a deck is a bank shot.
    bankShot(bullet,x,y){
      if(!bullet.bounces)return;
      const bonus=SETTINGS.bankShotBonus*(this.powers.double>0?2:1);
      this.bonus+=bonus;this.bankShots++;this.events.push({type:'bank-shot',x,y,bonus,bounces:bullet.bounces});
    }
    // Bullets carry momentum: a round hitting a pendulum's ball changes its swing along the arc.
    shove(o,bullet){
      if(!o.swing||o.destroyed)return;
      const floor=o.kind.endsWith('-floor'),dir=floor?-1:1,a=o.swing.a,speed=Math.hypot(bullet.vx,bullet.vy)||1;
      const along=(bullet.vx*Math.cos(a)-dir*bullet.vy*Math.sin(a))/speed;
      o.swing.w+=along*SETTINGS.shoveImpulse*(bullet.type==='pierce'?2:1);
      this.events.push({type:'shove',x:bullet.x,y:bullet.y});
    }
    // Real pendulum dynamics: a'' = -k^2 sin(a), with a gentle drive back to the designed swing energy
    // after a shove, and a hard stop at the safety limit that bounces the ball back.
    stepSwings(dt){
      for(const o of this.obstacles){
        if(!o.kind.startsWith('pendulum-')||o.destroyed||o.x>this.distance+SETTINGS.maximumWidth+200)continue;
        const rate=o.motionRate||1.5;
        if(!o.swing){const p=this.time*rate+o.phase;o.swing={a:Math.sin(p)*SWING_LIMIT,w:Math.cos(p)*SWING_LIMIT*rate};}
        const s=o.swing,k=rate*1.047,target=k*k*(1-Math.cos(SWING_LIMIT)),energy=.5*s.w*s.w+k*k*(1-Math.cos(s.a));
        s.w+=(-k*k*Math.sin(s.a)-.8*(energy-target)/target*s.w)*dt;
        s.w=Math.max(-k*2,Math.min(k*2,s.w));s.a+=s.w*dt;
        if(Math.abs(s.a)>SWING_LIMIT){s.a=Math.sign(s.a)*SWING_LIMIT;if(Math.sign(s.w)===Math.sign(s.a))s.w*=-.55;}
      }
    }
    impact(bullet){
      if(bullet.type==='plasma'){
        this.events.push({type:'explosion',x:bullet.x,y:bullet.y,radius:100});
        for(const o of this.obstacles)if(!o.destroyed&&clearance(o,bullet.x,bullet.y,this.time)<=100-SETTINGS.radius)this.damageObstacle(o,3,bullet.x,bullet.y);
        for(const t of this.targets)if(!t.destroyed&&Math.hypot(t.x-bullet.x,targetY(t,this.time)-bullet.y)<=120){t.destroyed=true;this.bounty(t.x,targetY(t,this.time),3,25);}
      }
      bullet.remaining--;if(bullet.remaining<=0)bullet.life=0;
    }
    stepWeapons(dt){
      for(const bullet of this.bullets){
        const pieces=Math.max(1,Math.ceil(Math.hypot(bullet.vx,bullet.vy)*dt/4));
        for(let i=0;i<pieces&&bullet.life>0;i++){
          bullet.x+=bullet.vx*dt/pieces;bullet.y+=bullet.vy*dt/pieces;
          const t=this.targets.find(t=>!t.destroyed&&Math.hypot(t.x-bullet.x,targetY(t,this.time)-bullet.y)<24);
          if(t){t.destroyed=true;this.bounty(t.x,targetY(t,this.time),3,25);this.bankShot(bullet,t.x,targetY(t,this.time));this.impact(bullet);if(bullet.life<=0)break;}
          for(const o of this.obstacles){
            if(o.destroyed||bullet.hitIds.includes(o.id)||bullet.x<o.x-8||bullet.x>o.x+o.width+8)continue;
            if(clearance(o,bullet.x,bullet.y,this.time)<=4-SETTINGS.radius){
              bullet.hitIds.push(o.id);this.shove(o,bullet);
              this.damageObstacle(o,bullet.type==='standard'?1:3,bullet.x,bullet.y,bullet);
              this.impact(bullet);break;
            }
          }
          if(bullet.life<=0)break;
          const bounds=terrainAt(bullet.x),openings=surfaceOpenings(this.obstacles);
          const side=bullet.y<bounds.top&&hasSurface(bullet.x,'top',openings)?'top':bullet.y>bounds.bottom&&hasSurface(bullet.x,'bottom',openings)?'bottom':null;
          if(side){
            // Ricochet: ordinary rounds bounce off the curved decks (mirror about the surface normal, losing some energy).
            // Rail slugs bury themselves and plasma bursts on contact.
            if(bullet.type==='standard'&&bullet.bounces<SETTINGS.maxRicochets){
              const n=surfaceNormal(bullet.x,side),dot=bullet.vx*n.x+bullet.vy*n.y;
              if(dot<0){bullet.vx=(bullet.vx-2*dot*n.x)*SETTINGS.ricochetKeep;bullet.vy=(bullet.vy-2*dot*n.y)*SETTINGS.ricochetKeep;}
              bullet.y=side==='top'?bounds.top+1:bounds.bottom-1;bullet.bounces++;bullet.life=Math.max(bullet.life,.35);
              this.events.push({type:'ricochet',x:bullet.x,y:bullet.y});
            }else{if(bullet.type==='plasma')this.impact(bullet);bullet.life=0;}
          }
        }
        bullet.life-=dt;
      }
      this.bullets=this.bullets.filter(b=>b.life>0);
      this.targets=this.targets.filter(t=>!t.destroyed&&t.x>this.distance-200);
    }
    fill(){
      while(this.nextX < this.distance+2000){
        const tier=sectorAt(this.nextX),intensity=difficultyAt(this.nextX).intensity,index=this.sequence++;
        if(!this.queue.length&&!this.rushQueue.length&&index>=this.nextRushIndex&&tier>=1){
          const total=intensity>.55?4:3,firstSide=this.lastLane===-1?'ceiling':'floor';
          const styles=tier===1?['wheel','comb','gap','tower']:tier===2?['orbit','crusher','pendulum','gap']:['pendulum','orbit','piston','crusher','gap'];
          const offset=Math.floor(this.random()*styles.length);
          for(let j=0;j<total;j++){
            const side=j%2?(firstSide==='floor'?'ceiling':'floor'):firstSide,style=styles[(offset+j)%styles.length];
            this.rushQueue.push({kind:style==='tower'?side+'-tower':style+'-'+side,id:index,step:j,total});
          }
          this.nextRushIndex=index+total+5+Math.floor(this.random()*3);
        }
        const challenge=this.rushQueue.shift();
        const kind=this.queue.length?this.queue.shift():challenge?challenge.kind:this.chooseKind(tier,intensity),intro=index<2;
        const spike=kind==='floor'||kind==='ceiling';
        const ride=RIDES.has(kind)?rideGeometry(kind,this.nextX):null;
        const width=ride?ride.width:kind.startsWith('wheel-')?190:kind.startsWith('orbit-')?190:kind.startsWith('pendulum-')?Math.round(270+intensity*50):kind.startsWith('comb-')?Math.round(170+this.random()*30+intensity*40):kind.startsWith('crusher-')?Math.round(130+this.random()*25+intensity*35):kind.startsWith('gap-')?Math.round(210+this.random()*70+intensity*90):intro?90:kind==='moving'?52:Math.round((spike?76:kind.startsWith('piston')?68:kind.endsWith('tower')?100:128)+this.random()*(spike?30:45)+intensity*(spike?34:32));
        const height=spike?(intro?64:Math.round(58+this.random()*20+intensity*34)):0;
        const o={id:index,kind,x:this.nextX,width,height,radius:26,terrain:true,
          phase:intro?0:this.random()*Math.PI*2,motionRate:1.1+intensity*1.25+this.random()*.3,
          rise:Math.round(115+this.random()*30+intensity*55),intensity,minClearance:Infinity,awarded:false};
        if(ride)o.loopRadius=ride.loopRadius;
        if(challenge)Object.assign(o,{rushId:challenge.id,rushStep:challenge.step,rushTotal:challenge.total});
        this.obstacles.push(o);this.sinceMover=kind==='moving'?0:this.sinceMover+1;this.sinceRide=RIDES.has(kind)?0:this.sinceRide+1;this.lastKind=kind;const required=safeGravity(o,0);if(required)this.lastLane=required;
        const lane=safeGravity(o,index%2?1:-1);
        const safeY=x=>boundsAt(x)[lane===1?'bottom':'top'];
        if(ride){
          // Stars trace the ride itself, so only a pilot who takes it collects them.
          for(const side of kind==='twist'?['bottom','top']:[kind.endsWith('-floor')?'bottom':'top']){
            const {points}=ridePath(o,side),count=kind.startsWith('spiral-')?9:kind==='twist'?4:6;
            for(let j=0;j<count;j++){const p=points[Math.round((j+1)*(points.length-1)/(count+1))];this.collectibles.push({id:`ride-${index}-${side}-${j}`,type:'star',x:p.x,y:p.y,collected:false});}
          }
        }else if(spike){
          const surface=terrainAt(o.x-40);
          const y=kind==='floor'?surface.bottom-height-SETTINGS.radius-18:surface.top+height+SETTINGS.radius+18;
          this.collectibles.push({id:'star-'+index,type:'star',x:o.x-40,y,collected:false});
        }else{
          // Star trails expose the safe upper/lower route through architectural hazards.
          for(let j=0;j<3;j++){const x=o.x+15+j*(width-30)/2;this.collectibles.push({id:`star-${index}-${j}`,type:'star',x,y:safeY(x),collected:false});}
        }
        if(index>=2&&index%4===2){
          const type=['shield','magnet','slow','overdrive','double'][Math.floor(index/4)%5];
          this.collectibles.push({id:'power-'+index,type,x:o.x-160,y:safeY(o.x-160),collected:false});
        }
        if(index>=7&&index%8===7){const x=o.x-100,type=['scatter','burst','rail'][Math.floor(index/8)%3];this.collectibles.push({id:'gun-'+index,type,x,y:safeY(x),collected:false});}
        if(index>=8&&index%8===0){const x=o.x-50,type=Math.floor(index/8)%2?'phase':'nova';this.collectibles.push({id:'extra-power-'+index,type,x,y:safeY(x),collected:false});}
        if(index%4===1){const x=o.x-140;this.collectibles.push({id:'ammo-'+index,type:'ammo',x,y:safeY(x),collected:false});}
        if(index>=4&&index%6===4){const x=o.x-100,type=Math.floor(index/6)%2?'plasma':'pierce';this.collectibles.push({id:'rounds-'+index,type,x,y:safeY(x),collected:false});}
        if(index>=2&&index%2===0){const x=o.x-245,b=boundsAt(x);this.targets.push({id:'drone-'+index,x,y:lane===1?b.bottom-60:b.top+60,phase:index*1.7,destroyed:false});}
        // Randomize cadence, but never consume the crossing/reaction safety budget.
        const extra=intro?60:SETTINGS.earlyExtraGap*(1-intensity)+this.random()*(25+SETTINGS.gapJitter*(1-intensity));
        o.nextGap=minimumGap()+Math.round(challenge&&challenge.step<challenge.total-1?extra*.25:extra);this.nextX+=width+o.nextGap;
      }
    }
    collect(s){
      if(s.collected)return;
      s.collected=true;
      if(s.type==='ammo'){const amount=this.addAmmo(SETTINGS.ammoCrate);this.events.push({type:'ammo',amount,x:s.x,y:s.y});return;}
      if(['scatter','burst','rail'].includes(s.type)){this.weapon=s.type;this.bulletType=s.type==='rail'?'pierce':'standard';this.specialAmmo=s.type==='burst'?30:12;this.burstIndex=0;this.shotTimer=0;this.events.push({type:'weapon',weapon:s.type,x:s.x,y:s.y});return;}
      if(s.type==='nova'){this.events.push({type:'nova',x:this.distance,y:this.y});for(const o of this.obstacles)if(clearance(o,this.distance,this.y,this.time)<SETTINGS.novaRadius-SETTINGS.radius)this.damageObstacle(o,3,this.distance,this.y);for(const t of this.targets)if(!t.destroyed&&Math.hypot(t.x-this.distance,targetY(t,this.time)-this.y)<SETTINGS.novaRadius){t.destroyed=true;this.bounty(t.x,targetY(t,this.time),3,25);}return;}
      if(['pierce','plasma'].includes(s.type)){this.weapon='machine';this.burstIndex=0;this.bulletType=s.type;this.specialAmmo=SETTINGS.specialAmmo;this.events.push({type:'power',power:s.type,x:s.x,y:s.y});return;}
      if(s.type&&s.type!=='star'){
        if(s.type==='overdrive')this.addAmmo(SETTINGS.ammoCrate);
        this.powers[s.type]=s.type==='shield'?1:({phase:SETTINGS.phaseSeconds,magnet:SETTINGS.magnetSeconds,slow:SETTINGS.slowSeconds,overdrive:SETTINGS.overdriveSeconds,double:SETTINGS.doubleSeconds}[s.type]||0);
        this.events.push({type:'power',power:s.type,x:s.x,y:s.y});return;
      }
      this.stars++;if(this.powers.double>0)this.rewardStars++;this.chain=this.time<=this.chainUntil?this.chain+1:1;this.chainUntil=this.time+SETTINGS.chainSeconds;
      this.bestChain=Math.max(this.bestChain,this.chain);this.events.push({type:'star',x:s.x,y:s.y});
      if(this.chain%SETTINGS.chainTarget===0){this.bonus+=SETTINGS.chainBonus;this.events.push({type:'chain',count:this.chain,bonus:SETTINGS.chainBonus});}
    }
    step(dt){
      if(!this.alive)return;
      this.time+=dt;
      if(this.rush?.done&&this.time>this.rush.until)this.rush=null;
      const approach=this.obstacles.find(o=>o.rushStep===0&&!o.passed&&o.x-this.distance<420&&o.x+o.width>=this.distance);
      if(approach&&this.rush?.id!==approach.rushId){this.rush={id:approach.rushId,total:approach.rushTotal,cleared:0,clean:true,done:false};this.events.push({type:'rush-start',total:approach.rushTotal});}
      this.shotTimer=Math.max(0,this.shotTimer-dt);
      for(const key of ['phase','magnet','slow','overdrive','double'])this.powers[key]=Math.max(0,this.powers[key]-dt);
      if(this.time>this.chainUntil)this.chain=0;
      this.speed=speedAt(this.distance)*(this.powers.slow>0?SETTINGS.slowFactor:1);
      if(this.ride)this.stepRide(dt);
      else{
      const openings=surfaceOpenings(this.obstacles),side=this.gravity===1?'bottom':'top';
      const oldBounds=boundsAt(this.distance),oldY=this.y,oldDistance=this.distance;
      const grounded=hasSurface(this.distance,side,openings)&&this.vy===0&&Math.abs(this.y-oldBounds[side])<.01;
      this.distance+=this.speed*dt;
      this.vy=Math.max(-SETTINGS.maxVerticalSpeed,Math.min(SETTINGS.maxVerticalSpeed,this.vy+this.gravity*SETTINGS.gravity*dt));
      const bounds=boundsAt(this.distance);
      this.y+=this.vy*dt;
      if(hasSurface(this.distance,side,openings)){
        const crossed=this.gravity===1?oldY<=Math.max(oldBounds.bottom,bounds.bottom)+.01&&this.y>=bounds.bottom:
          oldY>=Math.min(oldBounds.top,bounds.top)-.01&&this.y<=bounds.top;
        if(grounded||crossed){this.y=bounds[side];this.vy=0;}
      }
      // A missed deck is a fall, never an invisible landing or a teleport onto the next island.
      if(this.y>SETTINGS.height+70||this.y<-70){this.alive=false;this.events.push({type:'crash',reason:'void'});return;}
      this.boardRide(oldDistance,side);
      }
      // A captured star travels toward the moving avatar before it is credited.
      for(const s of this.collectibles)if(!s.collected){
        const isStar=!s.type||s.type==='star',d=Math.hypot(s.x-this.px,s.y-this.y);
        if(isStar&&this.powers.magnet>0&&d<SETTINGS.magnetRadius)s.attracted=true;
        if(s.attracted){
          s.pullTime=(s.pullTime||0)+dt;s.path=s.path||[];s.path.push({x:s.x,y:s.y});if(s.path.length>24)s.path.shift();
          const speed=Math.min(1700,this.speed+230+s.pullTime*2100),travel=Math.min(d,speed*dt);
          if(d>0){s.x+=(this.px-s.x)/d*travel;s.y+=(this.y-s.y)/d*travel;}
        }
        if(Math.hypot(s.x-this.px,s.y-this.y)<SETTINGS.radius+10)this.collect(s);
      }
      this.stepSwings(dt);
      this.stepWeapons(dt);
      for(const o of this.obstacles){
        if(this.distance+SETTINGS.radius>=o.x-30 && this.distance-SETTINGS.radius<=o.x+o.width+30){
          const d=clearance(o,this.distance,this.y,this.time);o.minClearance=Math.min(o.minClearance,d);
          if(d<=0){
            if(this.powers.phase){o.awarded=true;if(this.rush&&this.rush.id===o.rushId)this.rush.clean=false;}
            else if(this.powers.shield){if(this.rush&&this.rush.id===o.rushId)this.rush.clean=false;this.powers.shield=0;o.destroyed=true;o.awarded=true;this.events.push({type:'shield-break'});}
            else{this.alive=false;this.events.push({type:'crash'});return;}
          }
        }
        if(!o.passed&&this.distance-SETTINGS.radius>o.x+o.width){
          o.passed=true;
          if(o.rushId!==undefined&&this.rush?.id===o.rushId&&!this.rush.done){
            this.rush.cleared++;
            if(this.rush.cleared===this.rush.total){
              const stars=this.rush.clean?this.rush.total*2:0,bonus=this.rush.clean?this.rush.total*25:0;
              this.rewardStars+=stars;this.bonus+=bonus;this.rush.done=true;this.rush.until=this.time+2;
              this.events.push({type:'rush-complete',clean:this.rush.clean,stars,bonus});
            }
          }
        }
        if(!o.awarded&&this.distance-SETTINGS.radius>o.x+o.width){
          o.awarded=true;
          if(o.minClearance>0 && o.minClearance<=SETTINGS.nearMissClearance){this.bonus+=SETTINGS.nearMissBonus;this.events.push({type:'near',bonus:SETTINGS.nearMissBonus});}
        }
      }
      const difficulty=difficultyAt(this.distance);
      if(difficulty.level!==this.difficulty.level)this.events.push({type:'difficulty',level:difficulty.level});
      this.difficulty=difficulty;
      const sector=sectorAt(this.distance);
      if(sector!==this.sector){this.sector=sector;this.events.push({type:'sector',name:SECTORS[sector].name});}
      while(this.meters>=this.nextAmmoAt){const amount=this.addAmmo(SETTINGS.ammoRefill);this.events.push({type:'ammo',amount,meters:this.nextAmmoAt});this.nextAmmoAt+=SETTINGS.ammoRefillMeters;}
      while(this.meters>=this.nextMilestone){
        this.rewardStars+=SETTINGS.milestoneStars;this.events.push({type:'milestone',meters:this.nextMilestone,stars:SETTINGS.milestoneStars});this.nextMilestone+=SETTINGS.milestoneMeters;
      }
      // Keep the gap source beyond the widest camera rear edge, including its trailing cut.
      this.obstacles=this.obstacles.filter(o=>o.x+o.width>this.distance-SETTINGS.obstacleHistory);
      this.collectibles=this.collectibles.filter(s=>!s.collected&&(s.attracted||s.x>this.distance-150));
      this.fill();
    }
    // Where the runner's body actually is: on a ride it swings around the steadily advancing camera.
    get px(){return this.ride?this.ride.x:this.distance;}
    // A pilot running along a deck onto a ride's entry is carried by it. Airborne pilots pass by.
    boardRide(oldDistance,side){
      for(const o of this.obstacles){
        if(!RIDES.has(o.kind)||o.boarded||oldDistance>o.x||this.distance<o.x)continue;
        o.boarded=true;
        const fits=o.kind==='twist'||(o.kind.endsWith('-floor')?side==='bottom':side==='top');
        if(!fits||this.vy!==0||Math.abs(this.y-boundsAt(this.distance)[side])>1)continue;
        const path=ridePath(o,side),first=path.points[0];
        this.ride={id:o.id,kind:o.kind,family:rideFamily(o.kind),side,s:0,index:0,path,x0:first.x,x1:path.points[path.points.length-1].x,x:first.x,angle:first.angle,inversion:first.inv,turn:0};
        this.distance=first.x;this.y=first.y;this.events.push({type:'ride-start',kind:o.kind,family:this.ride.family});
        return;
      }
    }
    stepRide(dt){
      const r=this.ride,pts=r.path.points;
      r.s=Math.min(r.path.length,r.s+this.speed*SETTINGS.rideBoost*dt);
      while(r.index<pts.length-2&&pts[r.index+1].s<r.s)r.index++;
      const p=pts[r.index],q=pts[r.index+1],f=q.s>p.s?Math.max(0,Math.min(1,(r.s-p.s)/(q.s-p.s))):0;
      r.x=p.x+(q.x-p.x)*f;this.y=p.y+(q.y-p.y)*f;r.inversion=p.inv+(q.inv-p.inv)*f;
      let da=q.angle-p.angle;da=Math.atan2(Math.sin(da),Math.cos(da));r.angle=p.angle+da*f;r.turn=p.a+(q.a-p.a)*f;
      // The camera advances steadily across the ride's footprint while the body loops around it.
      this.distance=r.x0+(r.x1-r.x0)*r.s/r.path.length;this.vy=0;
      if(r.s<r.path.length)return;
      const exit=r.kind==='twist'?(r.side==='bottom'?'top':'bottom'):r.side;
      if(r.kind==='twist')this.gravity*=-1;
      this.distance=r.x1;this.y=boundsAt(r.x1)[exit];this.vy=0;
      const bonus=SETTINGS.rideBonus[r.family]*(this.powers.double>0?2:1);this.bonus+=bonus;this.rides++;
      this.events.push({type:'ride-complete',kind:r.kind,family:r.family,bonus,x:r.x1,y:this.y});
      this.ride=null;
    }
    get meters(){return Math.floor(this.distance*SETTINGS.metersPerUnit);}
    get score(){return this.meters+this.bonus;}
    drainEvents(){return this.events.splice(0);}
  }
  const api={RIDES,isRide,ridePath,rideGeometry,SWING_LIMIT,surfaceNormal,debrisFor,destructible,targetY,circles,circularCap,themeAt,mixColor,surfaceOpenings,hasSurface,platformSpans,TERRAIN,TERRAIN_SPAN,terrainAt,boundsAt,terrainVertices,localBounds,speedAt,difficultyAt,OBSTACLE_POOL,SETTINGS,AVATARS,SECTORS,sectorAt,safeGravity,rectangles,Run,readSave,crossTime,minimumGap,triangles,moverY,clearance,triangleDistance};
  if(typeof module!=='undefined')module.exports=api;else root.GravityEngine=api;
})(typeof window!=='undefined'?window:globalThis);
