/* Gravity Duel: two-player versus simulation on curved decks. Deterministic, DOM-free, shared by the browser and the online server. */
(function(root){
  'use strict';
  const TAU=Math.PI*2;
  const SETTINGS=Object.freeze({
    width:1200,height:600,radius:18,metersPerUnit:.1,fixedStep:1/120,midThickness:18,
    laneChange:.22,baseSpeed:300,maxSpeed:440,speedRampSeconds:80,runway:1900,
    roundSeconds:90,overtimeDrain:4,countdown:3,roundOver:3.2,roundsToWin:2,
    maxHp:100,maxPower:100,startPower:50,powerPerSecond:4,shieldCost:35,shieldSeconds:1.6,dashCost:20,dashCooldown:.7,dashImpulse:950,
    powerCooldown:1.2,homeOffsets:[350,450],minOffset:40,maxOffset:1040,boostImpulse:760,hazardKnock:620,slopePush:700,
    // Every round fired from a deck falls back toward that deck: floor shots arc down, ceiling shots arc up.
    bulletGravity:760,
    startAmmo:30,maxAmmo:60,firstRefillMeters:250,ammoEveryMeters:120,ammoRefill:8,refillPower:10,crateAmmo:15,healthPack:25,energyCell:30,ringPower:20,
    hazardInvuln:.9,respawnInvuln:1.5,voidDamage:20,behindDamage:15,rockDamage:10
  });
  const R=SETTINGS.radius,MID_T=SETTINGS.midThickness;
  // Each surface: [base, amp1, wave1, amp2, wave2, bowl, bowlWave]. Phases are seeded per round.
  const ARENAS=Object.freeze([
    {name:'Tidal Arcs',sky:'#16294a',accent:'#59edff',floor:[515,24,330,10,140,0,1],ceil:[96,18,300,8,150,0,1],mid:[306,40,430,10,170,0,1]},
    {name:'Crater Bowls',sky:'#2a1f3d',accent:'#ffbd78',floor:[505,10,500,6,160,46,260],ceil:[100,8,470,6,170,-34,240],mid:[306,22,520,8,190,30,300]},
    {name:'Helix Spine',sky:'#103b36',accent:'#7bf3be',floor:[512,18,260,8,120,0,1],ceil:[98,18,260,8,120,0,1],mid:[306,52,260,12,110,0,1],helix:true}
  ]);
  const WEAPONS=Object.freeze({
    blaster:{label:'Blaster',damage:5,cooldown:.17,speed:1050,life:1.3,spread:[0],gravity:true},
    scatter:{label:'Scatter',damage:6,cooldown:.6,speed:950,life:.45,spread:[-.22,-.11,0,.11,.22],ammo:8,gravity:true},
    burst:{label:'Burst',damage:7,cooldown:.38,speed:1250,life:1.2,spread:[0],burst:3,burstGap:.065,ammo:24,gravity:true},
    rail:{label:'Rail',damage:26,cooldown:.9,speed:2700,life:.55,spread:[0],pierce:true,ammo:5},
    rocket:{label:'Rocket',damage:22,cooldown:1.05,speed:640,life:2.4,spread:[0],homing:2.4,splash:80,splashDamage:14,ammo:3},
    boomerang:{label:'Boomerang',damage:12,cooldown:.7,speed:1100,life:2,spread:[0],boomerang:true,ammo:6}
  });
  const POWERS=Object.freeze({
    well:{label:'Gravity Well',icon:'◉',cost:40,text:'Lob a singularity that drags your rival in, swallows their bullets and crushes obstacles.'},
    echo:{label:'Time Echo',icon:'◐',cost:25,text:'For 4 s a ghost of you repeats every shot 0.6 s later, from where you were.'},
    comet:{label:'Comet Roll',icon:'☄',cost:35,text:'Drop a comet on your rival’s deck. It rolls along the curves, faster downhill, smashing everything.'},
    blades:{label:'Orbit Blades',icon:'✣',cost:35,text:'Three blades circle you for 5 s, cutting bullets, obstacles and anyone who gets close.'},
    hex:{label:'Gravity Hex',icon:'✶',cost:40,text:'A curving bolt that flings your rival to the far deck and flips their up/down for 4 s.'}
  });
  const POWER_IDS=Object.freeze(Object.keys(POWERS));
  const DEFAULT_POWERS=Object.freeze([['well','blades'],['comet','echo']]);
  const HAZARD_DAMAGE=Object.freeze({spikes:16,crate:12,laser:14});
  const PICKUPS=Object.freeze(['ammo','health','energy','scatter','burst','rail','rocket','boomerang','ring']);
  const AVATAR_IDS=Object.freeze(['orbit','wisp','pebble','astro']);
  const ACTIONS=Object.freeze(['up','down','dash','shield','power1','power2']);
  const DESTRUCTIBLE=new Set(['spikes','crate','rock','gate']);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=t=>t*t*(3-2*t);
  const cleanName=name=>typeof name==='string'?name.replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,12):'';
  function cleanPowers(list,fallback){
    const picked=Array.isArray(list)?[...new Set(list.filter(id=>POWER_IDS.includes(id)))].slice(0,2):[];
    for(const id of fallback)if(picked.length<2&&!picked.includes(id))picked.push(id);
    return picked;
  }
  function circleRect(x,y,r,rect){return Math.hypot(Math.max(rect.x-x,0,x-rect.x-rect.w),Math.max(rect.y-y,0,y-rect.y-rect.h))<r;}
  function segmentDistance(px,py,ax,ay,bx,by){
    const t=clamp(((px-ax)*(bx-ax)+(py-ay)*(by-ay))/(((bx-ax)**2+(by-ay)**2)||1),0,1);
    return Math.hypot(px-ax-t*(bx-ax),py-ay-t*(by-ay));
  }
  // ---- curved terrain ------------------------------------------------------
  function surfaceValue(spec,phase,x){
    const [base,a1,w1,a2,w2,bowl,w3]=spec;
    return base+a1*Math.sin(x/w1+phase[0])+a2*Math.sin(x/w2+phase[1])+(bowl?bowl*(Math.abs(Math.sin(x/w3+phase[2]))-.637):0);
  }
  function terrainAt(t,x){
    const a=ARENAS[t.arena],floor=surfaceValue(a.floor,t.phases.floor,x),ceil=surfaceValue(a.ceil,t.phases.ceil,x);
    // The bridge is clamped so every deck keeps enough room for a pilot above and below it.
    return {ceil,mid:clamp(surfaceValue(a.mid,t.phases.mid,x),ceil+150,floor-133),floor};
  }
  function surfaceY(t,lane,x){const s=terrainAt(t,x);return lane===0?s.floor:lane===1?s.mid:s.ceil;}
  function laneY(t,lane,x){const s=terrainAt(t,x);return lane===0?s.floor-R:lane===1?s.mid-R:s.ceil+R;}
  function slopeAt(t,lane,x){return (surfaceY(t,lane,x+8)-surfaceY(t,lane,x-8))/16;}
  // Open air between decks, excluding the space pilots occupy while running.
  function zoneSpan(t,zone,x){const s=terrainAt(t,x);return zone===0?{top:s.mid+MID_T+4,bottom:s.floor-40}:{top:s.ceil+40,bottom:s.mid-40};}
  function makeTerrain(arena,random){
    const p=()=>[random()*TAU,random()*TAU,random()*TAU],floor=p(),ceil=p();
    return {arena,phases:{floor,ceil,mid:ARENAS[arena].helix?floor.map(v=>v+Math.PI):p()}};
  }
  // Collision shapes for deck hazards. They follow the curve tooth by tooth.
  function hazardShapes(t,h){
    if(h.type==='spikes'){
      const n=Math.max(2,Math.round(h.w/22)),tw=h.w/n;
      return Array.from({length:n},(_,k)=>{const x=h.x+k*tw,base=surfaceY(t,h.lane,x+tw/2);return h.lane===2?{x,y:base,w:tw,h:40,base,dir:1}:{x,y:base-40,w:tw,h:40,base,dir:-1};});
    }
    if(h.type==='crate'){const base=surfaceY(t,h.lane,h.x+h.w/2);return [h.lane===2?{x:h.x,y:base,w:h.w,h:50}:{x:h.x,y:base-50,w:h.w,h:50}];}
    if(h.type==='laser'){const s=terrainAt(t,h.x+h.w/2);return [h.lanes[0]===0?{x:h.x,y:s.mid-80,w:h.w,h:s.floor-s.mid+80}:{x:h.x,y:s.ceil,w:h.w,h:s.mid-s.ceil}];}
    if(h.type==='boost'){const base=surfaceY(t,h.lane,h.x+h.w/2);return [{x:h.x,y:base-6,w:h.w,h:12}];}
    return [];
  }
  function gateEnds(h,time){const a=h.phase+h.rate*time,dx=Math.cos(a)*h.len/2,dy=Math.sin(a)*h.len/2;return [h.x-dx,h.y-dy,h.x+dx,h.y+dy];}
  function hazardTouches(h,x,y,r,time){
    if(h.type==='rock')return Math.hypot(x-h.x,y-h.y)<h.r+r;
    if(h.type==='gate'){const [ax,ay,bx,by]=gateEnds(h,time);return segmentDistance(x,y,ax,ay,bx,by)<6+r;}
    return h.shapes.some(s=>circleRect(x,y,r,s));
  }
  // Ballistic aim: the launch angle that lands a shot of speed v on (dx,dy) under vertical gravity g (screen-down positive).
  function ballisticAngle(dx,dy,v,g,fallbackDir){
    const dir=Math.abs(dx)<30?fallbackDir:Math.sign(dx),X=Math.max(30,Math.abs(dx));
    if(!g)return Math.atan2(dy,dir*X);
    const s=Math.sign(g),G=Math.abs(g),Y=-dy*s,v2=v*v,disc=v2*v2-G*(G*X*X+2*Y*v2);
    const theta=disc<0?Math.PI/4:Math.atan((v2-Math.sqrt(disc))/(G*X));
    return Math.atan2(-s*Math.sin(theta),dir*Math.cos(theta));
  }
  const blankStats=()=>({shots:0,hits:0,damage:0,taken:0,pickups:0,blocks:0,kos:0,powers:0});

  class Duel{
    constructor(options={}){
      this.seed=(options.seed??Math.floor(Math.random()*4294967296))>>>0||1;
      this.roundsToWin=clamp(Math.floor(options.roundsToWin||SETTINGS.roundsToWin),1,5);
      this.roster=[0,1].map(i=>this.rosterEntry(i,options.players?.[i]));
      this.events=[];this.nextId=1;this.time=0;this.firstArena=Math.floor(this.random()*ARENAS.length);
      this.restartMatch();
    }
    rosterEntry(i,data={}){return {name:cleanName(data?.name)||`Player ${i+1}`,avatar:AVATAR_IDS.includes(data?.avatar)?data.avatar:(i?'wisp':'orbit'),powers:cleanPowers(data?.powers,DEFAULT_POWERS[i])};}
    setRoster(i,data){this.roster[i]=this.rosterEntry(i,data);Object.assign(this.players[i],{...this.roster[i],powers:[...this.roster[i].powers]});}
    random(){this.seed^=this.seed<<13;this.seed^=this.seed>>>17;this.seed^=this.seed<<5;return (this.seed>>>0)/4294967296;}
    restartMatch(){
      this.round=0;this.wins=[0,0];this.stats=[blankStats(),blankStats()];this.matchWinner=null;
      this.startRound();this.events.push({type:'match-start'});
    }
    startRound(){
      this.round++;this.roundTime=0;this.camX=0;this.speed=SETTINGS.baseSpeed;this.phase='countdown';this.phaseTimer=SETTINGS.countdown;
      this.lastCount=Math.ceil(SETTINGS.countdown)+1;this.overtime=false;this.winner=null;
      // Every round is a different arena with freshly seeded curves.
      this.terrain=makeTerrain((this.firstArena+this.round-1)%ARENAS.length,()=>this.random());
      this.gaps=[];this.hazards=[];this.pickups=[];this.bullets=[];this.wells=[];this.comets=[];
      this.nextX=SETTINGS.runway;this.beat=0;this.lastPattern=null;
      this.players=[0,1].map(i=>this.makePlayer(i));
      this.fill();this.events.push({type:'round-start',round:this.round,arena:ARENAS[this.terrain.arena].name});
    }
    makePlayer(i){
      const lane=i?2:0,offset=SETTINGS.homeOffsets[i],y=laneY(this.terrain,lane,offset);
      return {id:i,...this.roster[i],powers:[...this.roster[i].powers],lane,fromLane:lane,fromY:y,shift:1,shiftDur:SETTINGS.laneChange,forced:false,y,vy:0,falling:false,
        offset,vx:0,hp:SETTINGS.maxHp,power:SETTINGS.startPower,ammo:SETTINGS.startAmmo,weapon:'blaster',special:0,burstIndex:0,
        cooldown:0,shield:0,dashCd:0,invuln:0,hazardCd:0,flash:0,dryCd:0,powerCd:[0,0],echo:0,trail:[],echoShots:[],blades:0,bladeAngle:0,bladeHitCd:0,hex:0,wellTick:0,
        fire:false,queue:[],nextAmmoAt:SETTINGS.firstRefillMeters,aimBack:false,alive:true};
    }
    // ---- input -------------------------------------------------------------
    press(i,action){const p=this.players[i];if(p&&ACTIONS.includes(action)&&p.queue.length<4)p.queue.push(action);}
    hold(i,fire){if(this.players[i])this.players[i].fire=!!fire;}
    // ---- world queries -----------------------------------------------------
    worldX(p){return this.camX+p.offset;}
    surfaceAt(lane,x){return !this.gaps.some(g=>g.surface===lane&&x>g.x+8&&x<g.x+g.w-8);}
    laserState(h){const c=((this.roundTime+h.phase)%h.period)/h.period;return c<h.on?'on':c>.82?'warn':'off';}
    inversion(p){
      const of=lane=>lane===2?-1:1;
      if(p.falling)return of(p.lane);
      return p.shift>=1?of(p.lane):of(p.fromLane)+(of(p.lane)-of(p.fromLane))*smooth(p.shift);
    }
    gravityOf(p){return this.inversion(p)>=0?1:-1;}
    // ---- simulation --------------------------------------------------------
    step(dt=SETTINGS.fixedStep){
      this.time+=dt;
      if(this.phase==='matchover')return;
      if(this.phase==='roundover'){
        this.phaseTimer-=dt;
        if(this.phaseTimer<=0){
          if(this.matchWinner!==null){this.phase='matchover';this.events.push({type:'match-over',winner:this.matchWinner});}
          else this.startRound();
        }
        return;
      }
      if(this.phase==='countdown'){
        this.phaseTimer-=dt;const count=Math.ceil(this.phaseTimer);
        if(count<this.lastCount&&count>0){this.lastCount=count;this.events.push({type:'countdown',count});}
        if(this.phaseTimer<=0){this.phase='fight';this.events.push({type:'fight'});}
      }else this.roundTime+=dt;
      const fighting=this.phase==='fight';
      this.speed=SETTINGS.baseSpeed+(SETTINGS.maxSpeed-SETTINGS.baseSpeed)*Math.min(1,this.roundTime/SETTINGS.speedRampSeconds);
      this.camX+=this.speed*dt;
      for(const p of this.players)this.stepPlayer(p,dt,fighting);
      if(fighting){for(const p of this.players)this.stepPowers(p,dt);this.stepWells(dt);this.stepComets(dt);}
      this.stepBullets(dt);
      if(fighting){
        this.stepContacts();
        if(!this.overtime&&this.roundTime>=SETTINGS.roundSeconds){this.overtime=true;this.events.push({type:'overtime'});}
        if(this.overtime)for(const p of this.players)if(p.alive){p.hp=Math.max(0,p.hp-SETTINGS.overtimeDrain*dt);if(p.hp<=0)p.alive=false;}
        const down=this.players.filter(p=>!p.alive);
        if(down.length)this.endRound(down.length===2?null:1-down[0].id);
      }
      const behind=this.camX-250;
      this.gaps=this.gaps.filter(g=>g.x+g.w>behind);this.hazards=this.hazards.filter(h=>h.x+(h.w||h.r||40)>behind);
      this.pickups=this.pickups.filter(s=>!s.taken&&s.x>behind);
      this.fill();
    }
    stepPlayer(p,dt,fighting){
      for(const key of ['cooldown','dashCd','invuln','hazardCd','shield','flash','dryCd','echo','blades','bladeHitCd','hex'])p[key]=Math.max(0,p[key]-dt);
      p.powerCd=p.powerCd.map(v=>Math.max(0,v-dt));
      if(!p.alive)return;
      if(fighting)p.power=Math.min(SETTINGS.maxPower,p.power+SETTINGS.powerPerSecond*dt);
      const pending=[];
      for(const action of p.queue){
        if(action==='up'||action==='down'){
          // A Gravity Hex flips which way is up.
          const dir=(action==='up'?1:-1)*(p.hex>0?-1:1);
          // Late rescue: a pilot who has only just slipped into an opening can still climb out.
          if(p.falling&&dir===(p.lane===0?1:-1)&&Math.abs(p.y-laneY(this.terrain,p.lane,this.worldX(p)))<60){p.falling=false;p.vy=0;if(this.changeLane(p,dir))continue;p.falling=true;}
          if(p.shift<1||p.falling){if(!pending.length)pending.push(action);continue;}
          this.changeLane(p,dir);
        }else if(!fighting)continue;
        else if(action==='dash')this.dash(p);
        else if(action==='shield')this.raiseShield(p);
        else if(action==='power1'||action==='power2')this.usePower(p,action==='power1'?0:1);
      }
      p.queue=pending;
      // Horizontal first, so the vertical snap below uses this step's final position on the curve.
      p.vx*=Math.exp(-4.5*dt);
      p.offset+=p.vx*dt+(SETTINGS.homeOffsets[p.id]-p.offset)*.22*dt;
      if(p.offset>SETTINGS.maxOffset){p.offset=SETTINGS.maxOffset;p.vx=Math.min(0,p.vx);}
      if(p.offset<SETTINGS.minOffset){
        if(fighting){this.hurt(p,SETTINGS.behindDamage,null,'behind',true);this.events.push({type:'behind',p:p.id});p.offset=380;p.vx=0;p.invuln=SETTINGS.respawnInvuln;}
        else p.offset=SETTINGS.minOffset;
      }
      const x=this.worldX(p),target=laneY(this.terrain,p.lane,x);
      if(p.falling){
        p.vy+=(p.lane===2?-1:1)*2600*dt;p.y+=p.vy*dt;
        if(p.y>SETTINGS.height+60||p.y<-60){this.hurt(p,SETTINGS.voidDamage,null,'void',true);this.events.push({type:'void',p:p.id});this.respawn(p);}
      }else if(p.shift<1){
        p.shift=Math.min(1,p.shift+dt/p.shiftDur);p.y=p.fromY+(target-p.fromY)*smooth(p.shift);
        if(p.shift>=1)p.forced=false;
      }else{
        p.y=target;
        if(!this.surfaceAt(p.lane,x)){
          // The bridge drops you to the floor; floor and ceiling openings are open void.
          if(p.lane===1&&this.surfaceAt(0,x))this.moveTo(p,0,.26,'drop',true);
          else{p.falling=true;p.vy=0;p.queue=[];this.events.push({type:'falling',p:p.id});}
        }else{
          // Gravity on curves: running downhill (toward your own deck's pull) speeds you up.
          const slope=clamp(slopeAt(this.terrain,p.lane,x),-1,1);
          p.vx+=(p.lane===2?-slope:slope)*SETTINGS.slopePush*dt;
        }
      }
      const meters=Math.floor(this.worldX(p)*SETTINGS.metersPerUnit);
      while(meters>=p.nextAmmoAt){
        if(fighting){const amount=this.addAmmo(p,SETTINGS.ammoRefill);p.power=Math.min(SETTINGS.maxPower,p.power+SETTINGS.refillPower);this.events.push({type:'refill',p:p.id,amount,meters:p.nextAmmoAt});}
        p.nextAmmoAt+=SETTINGS.ammoEveryMeters;
      }
      const opponent=this.players[1-p.id];
      p.aimBack=this.worldX(opponent)<this.worldX(p)-12;
      p.trail.push({t:this.time,offset:p.offset,y:p.y,inv:this.inversion(p),aimBack:p.aimBack});
      while(p.trail.length&&p.trail[0].t<this.time-.62)p.trail.shift();
      if(fighting&&p.fire&&p.cooldown<=0&&!p.falling)this.shoot(p);
    }
    moveTo(p,lane,duration,type='lane',forced=false){
      const from=p.lane;p.fromLane=from;p.fromY=p.y;p.lane=lane;p.shift=0;p.shiftDur=duration;p.forced=forced;
      this.events.push({type,p:p.id,from,to:lane});
    }
    changeLane(p,dir){
      const x=this.worldX(p);let target=p.lane+dir;
      // Openings in the deck above or below let you pass straight through to the next deck.
      while(target>=0&&target<=2&&!this.surfaceAt(target,x))target+=dir;
      if(target<0||target>2){this.events.push({type:'bump',p:p.id});return false;}
      this.moveTo(p,target,SETTINGS.laneChange*Math.sqrt(Math.abs(target-p.lane)));return true;
    }
    respawn(p){
      const x=this.worldX(p),lane=this.surfaceAt(1,x)?1:this.surfaceAt(0,x)?0:2,y=laneY(this.terrain,lane,x);
      Object.assign(p,{lane,fromLane:lane,y,fromY:y,shift:1,forced:false,falling:false,vy:0,vx:0,queue:[],invuln:SETTINGS.respawnInvuln,offset:Math.max(p.offset,320)});
    }
    dash(p){
      if(p.dashCd>0)return false;
      if(p.power<SETTINGS.dashCost){this.events.push({type:'no-power',p:p.id,action:'dash',cost:SETTINGS.dashCost});return false;}
      p.power-=SETTINGS.dashCost;p.dashCd=SETTINGS.dashCooldown;p.vx+=SETTINGS.dashImpulse;this.events.push({type:'dash',p:p.id});return true;
    }
    raiseShield(p){
      if(p.shield>0)return false;
      if(p.power<SETTINGS.shieldCost){this.events.push({type:'no-power',p:p.id,action:'shield',cost:SETTINGS.shieldCost});return false;}
      p.power-=SETTINGS.shieldCost;p.shield=SETTINGS.shieldSeconds;this.events.push({type:'shield',p:p.id});return true;
    }
    addAmmo(p,amount){const added=Math.min(amount,SETTINGS.maxAmmo-p.ammo);p.ammo+=added;return added;}
    gunPoint(p){const x=this.worldX(p),dir=p.aimBack?-1:1;return {x:x+dir*12,y:p.y-9*this.inversion(p),dir};}
    aimAt(from,o,speed,g,dir){return ballisticAngle(this.worldX(o)-from.x,o.y-from.y,speed,g,dir);}
    spawnShot(p,kind,from,angle,extra={}){
      const w=WEAPONS[kind],inv=extra.inv??this.inversion(p),g=w.gravity?SETTINGS.bulletGravity*(inv>=0?1:-1):0;
      for(const spread of w.spread){
        const a=angle+spread;
        const b={id:this.nextId++,owner:p.id,kind,x:from.x,y:from.y,vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,g,life:w.life,damage:w.damage,
          pierce:!!w.pierce,homing:w.homing||0,splash:w.splash||0,splashDamage:w.splashDamage||0,hits:[],echo:!!extra.echo};
        if(w.boomerang)Object.assign(b,{boomerang:true,turned:false});
        this.bullets.push(b);
      }
    }
    shoot(p){
      const special=p.weapon!=='blaster'&&p.special>0,kind=special?p.weapon:'blaster',w=WEAPONS[kind];
      if(!special&&p.ammo<=0){if(p.dryCd<=0){p.dryCd=.45;this.events.push({type:'dry',p:p.id});}return false;}
      if(special)p.special--;else p.ammo--;
      const o=this.players[1-p.id],from=this.gunPoint(p),g=w.gravity?SETTINGS.bulletGravity*this.gravityOf(p):0;
      // Auto-aim solves the arc for your own gravity; decks, cover and asteroids still get in the way.
      const angle=o.alive?this.aimAt(from,o,w.speed,g,from.dir):(from.dir>0?0:Math.PI);
      let cooldown=w.cooldown;
      if(w.burst){p.burstIndex=(p.burstIndex+1)%w.burst;cooldown=p.burstIndex===0?w.cooldown:w.burstGap;}
      p.cooldown=cooldown;this.stats[p.id].shots++;
      this.spawnShot(p,kind,from,angle);
      if(p.echo>0)p.echoShots.push({at:this.time+.6,kind,angle,offset:from.x-this.camX,y:from.y,inv:this.inversion(p)});
      this.events.push({type:'shoot',p:p.id,weapon:kind,x:from.x,y:from.y,back:from.dir<0});
      if(special&&p.special===0){p.weapon='blaster';p.burstIndex=0;this.events.push({type:'weapon-empty',p:p.id,weapon:kind});}
      return true;
    }
    // ---- powers --------------------------------------------------------------
    usePower(p,slot){
      const id=p.powers[slot],power=POWERS[id];
      if(!power||p.powerCd[slot]>0)return false;
      if(p.power<power.cost){this.events.push({type:'no-power',p:p.id,action:id,cost:power.cost});return false;}
      const o=this.players[1-p.id];
      p.power-=power.cost;p.powerCd[slot]=SETTINGS.powerCooldown;this.stats[p.id].powers++;
      const from=this.gunPoint(p);
      if(id==='well'){
        const g=SETTINGS.bulletGravity*.8*this.gravityOf(p);
        this.bullets.push({id:this.nextId++,owner:p.id,kind:'well',x:from.x,y:from.y,...this.velocity(this.aimAt(from,o,720,g,from.dir),720),g,life:1.3,damage:0,hits:[],orb:true});
      }else if(id==='echo'){p.echo=4;}
      else if(id==='comet'){
        // Spawns on the rival's deck ahead of them, with a warning, then rolls back at them.
        this.comets.push({id:this.nextId++,owner:p.id,lane:o.lane,x:this.worldX(o)+520,vx:-470,warn:.65,hp:30,life:4.5});
      }else if(id==='blades'){p.blades=5;p.bladeAngle=0;}
      else if(id==='hex'){
        this.bullets.push({id:this.nextId++,owner:p.id,kind:'hex',x:from.x,y:from.y,...this.velocity(from.dir>0?-.5:Math.PI+.5,650),g:0,life:2.6,damage:6,homing:3.4,hits:[],phase:true});
      }
      this.events.push({type:'power',p:p.id,power:id,x:from.x,y:from.y});
      return true;
    }
    velocity(angle,speed){return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed};}
    stepPowers(p,dt){
      if(!p.alive)return;
      // Time Echo: replay queued shots from the recorded position of 0.6 s ago.
      while(p.echoShots.length&&p.echoShots[0].at<=this.time){
        const e=p.echoShots.shift(),from={x:this.camX+e.offset,y:e.y};
        this.spawnShot(p,e.kind,from,e.angle,{echo:true,inv:e.inv});
        this.events.push({type:'echo-shot',p:p.id,x:from.x,y:from.y,weapon:e.kind});
      }
      if(p.blades>0){
        p.bladeAngle+=5.5*dt;
        const x=this.worldX(p),o=this.players[1-p.id];
        for(const blade of this.bladePoints(p)){
          for(const b of this.bullets)if(b.owner!==p.id&&b.life>0&&Math.hypot(b.x-blade.x,b.y-blade.y)<16){b.life=0;this.events.push({type:'spark',x:b.x,y:b.y});}
          for(const h of this.hazards)if(DESTRUCTIBLE.has(h.type)&&!h.destroyed&&hazardTouches(h,blade.x,blade.y,10,this.roundTime))this.damageHazard(h,70*dt,p.id,true);
          for(const c of this.comets)if(c.owner!==p.id&&Math.hypot(c.x-blade.x,this.cometY(c)-blade.y)<34)this.damageComet(c,70*dt);
          if(o.alive&&p.bladeHitCd<=0&&Math.hypot(this.worldX(o)-blade.x,o.y-blade.y)<R+12){
            p.bladeHitCd=.5;if(this.hurt(o,10,p.id,'blades'))o.vx+=Math.sign(this.worldX(o)-x||1)*380;
          }
        }
      }
    }
    bladePoints(p){const x=this.worldX(p);return [0,1,2].map(k=>{const a=p.bladeAngle+k*TAU/3;return {x:x+Math.cos(a)*48,y:p.y-9*this.inversion(p)+Math.sin(a)*48,a};});}
    openWell(b){
      if(b.opened)return;
      b.opened=true;b.life=0;
      this.wells.push({id:this.nextId++,owner:b.owner,offset:clamp(b.x-this.camX,40,SETTINGS.width-40),y:clamp(b.y,60,SETTINGS.height-60),life:3,r:170});
      this.events.push({type:'well-open',p:b.owner,x:b.x,y:b.y});
    }
    stepWells(dt){
      for(const w of this.wells){
        w.life-=dt;const wx=this.camX+w.offset,o=this.players[1-w.owner];
        // Enemy rounds bend into the singularity and vanish at its core.
        for(const b of this.bullets){
          if(b.owner===w.owner||b.life<=0)continue;
          const dx=wx-b.x,dy=w.y-b.y,d=Math.hypot(dx,dy);
          if(d<w.r){b.vx+=dx/d*2600*dt;b.vy+=dy/d*2600*dt;if(d<22){b.life=0;this.events.push({type:'swallow',x:b.x,y:b.y});}}
        }
        for(const h of this.hazards)if(DESTRUCTIBLE.has(h.type)&&!h.destroyed){
          const c=this.hazardCenter(h);
          if(Math.hypot(c.x-wx,c.y-w.y)<w.r)this.damageHazard(h,40*dt,w.owner,true);
        }
        for(const c of this.comets)if(c.owner!==w.owner&&Math.hypot(c.x-wx,this.cometY(c)-w.y)<w.r)this.damageComet(c,40*dt);
        if(o.alive){
          const ox=this.worldX(o),d=Math.hypot(ox-wx,o.y-w.y);
          if(d<w.r){
            o.vx+=Math.sign(wx-ox)*1500*dt;o.wellTick+=dt;
            if(o.wellTick>=.33){o.wellTick=0;this.hurt(o,2,w.owner,'well');}
          }
        }
      }
      this.wells=this.wells.filter(w=>w.life>0);
    }
    cometY(c){return c.lane===2?surfaceY(this.terrain,2,c.x)+24:surfaceY(this.terrain,c.lane,c.x)-24;}
    damageComet(c,amount){c.hp-=amount;if(c.hp<=0&&c.life>0){c.life=0;this.events.push({type:'destroy',kind:'comet',x:c.x,y:this.cometY(c),w:40,h:40});}}
    stepComets(dt){
      for(const c of this.comets){
        if(c.life<=0)continue;
        if(c.warn>0){c.warn-=dt;c.x+=this.speed*dt;continue;}
        c.life-=dt;
        // Rolls along the curved deck: downhill (in that deck's gravity) accelerates it.
        const slope=clamp(slopeAt(this.terrain,c.lane,c.x),-1,1);
        c.vx+=(c.lane===2?-slope:slope)*900*dt;
        c.x+=(c.vx+this.speed)*dt;
        if(!this.surfaceAt(c.lane,c.x)){c.life=0;this.events.push({type:'comet-fall',x:c.x,y:this.cometY(c)});continue;}
        const y=this.cometY(c);
        for(const h of this.hazards)if(!h.destroyed&&(h.type==='spikes'||h.type==='crate')&&h.lane===c.lane&&hazardTouches(h,c.x,y,22,this.roundTime))this.destroyHazard(h,c.owner);
        const o=this.players[1-c.owner];
        if(o.alive&&!o.falling&&Math.hypot(this.worldX(o)-c.x,o.y-y)<R+22){
          if(this.hurt(o,22,c.owner,'comet'))o.vx+=Math.sign(c.vx)*600;
          c.life=0;this.events.push({type:'explosion',x:c.x,y,radius:60});
        }
        if(c.x<this.camX-120)c.life=0;
      }
      this.comets=this.comets.filter(c=>c.life>0);
    }
    hexHit(o,by){
      if(!this.hurt(o,6,by,'hex'))return;
      o.hex=4;
      const x=this.worldX(o),far=o.lane===0?2:o.lane===2?0:(this.surfaceAt(0,x)?0:2);
      if(!o.falling&&this.surfaceAt(far,x))this.moveTo(o,far,.34,'hexed',true);
      else this.events.push({type:'hexed',p:o.id,from:o.lane,to:o.lane});
    }
    // ---- damage ------------------------------------------------------------
    hurt(p,amount,by,cause,force=false){
      if(!p.alive)return false;
      if(!force&&p.shield>0){this.events.push({type:'block',p:p.id,cause,x:this.worldX(p),y:p.y});this.stats[p.id].blocks++;return false;}
      if(!force&&p.invuln>0)return false;
      p.hp=Math.max(0,p.hp-amount);p.flash=.25;this.stats[p.id].taken+=amount;
      if(by!==null&&by!==p.id){this.stats[by].damage+=amount;if(cause==='shot')this.stats[by].hits++;}
      this.events.push({type:'hurt',p:p.id,amount,by,cause,x:this.worldX(p),y:p.y});
      if(p.hp<=0){p.alive=false;if(by!==null&&by!==p.id)this.stats[by].kos++;this.events.push({type:'ko',p:p.id,by});}
      return true;
    }
    damageHazard(h,amount,by,quiet=false){
      if(h.destroyed||!DESTRUCTIBLE.has(h.type))return;
      h.hp-=amount;
      if(!quiet){const c=this.hazardCenter(h);this.events.push({type:'hazard-hit',x:c.x,y:c.y});}
      if(h.hp<=0)this.destroyHazard(h,by);
    }
    hazardCenter(h){if(h.type==='rock'||h.type==='gate')return {x:h.x,y:h.y};const s=h.shapes[Math.floor(h.shapes.length/2)];return {x:s.x+s.w/2,y:s.y+s.h/2};}
    destroyHazard(h,by=null){
      if(h.destroyed)return;
      h.destroyed=true;const c=this.hazardCenter(h),size=h.type==='rock'?h.r*2:h.type==='gate'?h.len:h.w;
      this.events.push({type:'destroy',kind:h.type,x:c.x,y:c.y,w:size,h:h.type==='rock'?size:40,by});
      // Crates and asteroids are supply caches: breaking one open can drop something useful.
      if((h.type==='crate'||h.type==='rock')&&this.random()<.5){
        const type=['ammo','health','energy','ammo'][Math.floor(this.random()*4)];
        const lane=h.type==='crate'?h.lane:h.zone===0?0:1;
        this.pickups.push({id:this.nextId++,type,lane,x:c.x,y:laneY(this.terrain,lane,c.x),dropped:true});
      }
    }
    detonate(b,directId=null){
      if(!b.splash)return;
      this.events.push({type:'explosion',x:b.x,y:b.y,radius:b.splash});
      for(const p of this.players)if(p.alive&&p.id!==b.owner&&p.id!==directId&&Math.hypot(this.worldX(p)-b.x,p.y-b.y)<b.splash+R)this.hurt(p,b.splashDamage,b.owner,'splash');
      for(const h of this.hazards)if(!h.destroyed&&DESTRUCTIBLE.has(h.type)&&hazardTouches(h,b.x,b.y,b.splash,this.roundTime))this.damageHazard(h,30,b.owner);
    }
    hitPlayer(b,t){
      b.hits.push('p'+t.id);
      if(b.kind==='well'){this.openWell(b);return;}
      if(t.shield>0){
        // Shields parry: the round turns around and flies back at its shooter.
        const shooter=this.players[b.owner],speed=Math.hypot(b.vx,b.vy),a=Math.atan2(shooter.y-b.y,this.worldX(shooter)-b.x);
        b.vx=Math.cos(a)*speed;b.vy=Math.sin(a)*speed;b.g=0;b.boomerang=false;b.owner=t.id;b.hits=['p'+t.id];b.life=Math.max(b.life,.9);b.reflected=true;
        this.stats[t.id].blocks++;this.events.push({type:'reflect',p:t.id,x:b.x,y:b.y});return;
      }
      if(t.invuln>0)return;
      if(b.kind==='hex'){this.hexHit(t,b.owner);b.life=0;return;}
      this.hurt(t,b.damage,b.owner,'shot');
      t.vx+=Math.sign(b.vx||1)*Math.min(420,40+b.damage*12);
      this.detonate(b,t.id);
      if(!b.pierce&&!b.boomerang)b.life=0;
    }
    stepBullets(dt){
      for(const b of this.bullets){
        const target=this.players[1-b.owner];
        if(b.homing&&target.alive){
          const speed=Math.hypot(b.vx,b.vy),current=Math.atan2(b.vy,b.vx);
          let turn=Math.atan2(target.y-b.y,this.worldX(target)-b.x)-current;turn=Math.atan2(Math.sin(turn),Math.cos(turn));
          const a=current+clamp(turn,-b.homing*dt,b.homing*dt);b.vx=Math.cos(a)*speed;b.vy=Math.sin(a)*speed;
        }
        if(b.boomerang){
          // Boomerangs curve out and are pulled back to the thrower, cutting on both legs.
          const owner=this.players[b.owner],dx=this.worldX(owner)-b.x,dy=owner.y-b.y,d=Math.hypot(dx,dy)||1;
          const before=Math.sign(b.vx);b.vx+=dx/d*1400*dt;b.vy+=dy/d*1400*dt;
          if(!b.turned&&Math.sign(b.vx)!==before){b.turned=true;b.hits=b.hits.filter(h=>typeof h!=='string');}
          if(b.turned&&d<26)b.life=0;
        }
        b.vy+=b.g*dt;
        // Velocities are relative to the scrolling camera, so forward and backward shots behave the same on screen.
        const wx=b.vx+this.speed,pieces=Math.max(1,Math.ceil(Math.hypot(wx,b.vy)*dt/6));
        for(let i=0;i<pieces&&b.life>0;i++){
          const prevY=b.y;b.x+=wx*dt/pieces;b.y+=b.vy*dt/pieces;
          for(const t of this.players){
            if(t.id===b.owner||!t.alive||b.hits.includes('p'+t.id))continue;
            if(Math.hypot(this.worldX(t)-b.x,t.y-b.y)<R+(b.orb?40:5)){this.hitPlayer(b,t);if(b.life<=0)break;}
          }
          if(b.life<=0||b.phase)continue;
          for(const h of this.hazards){
            if(h.destroyed||!DESTRUCTIBLE.has(h.type)||b.hits.includes(h.id))continue;
            if(hazardTouches(h,b.x,b.y,3,this.roundTime)){
              b.hits.push(h.id);
              if(b.orb){this.openWell(b);break;}
              this.damageHazard(h,b.damage,b.owner);
              if(!b.pierce){this.detonate(b);b.life=0;break;}
            }
          }
          if(b.life<=0)break;
          for(const c of this.comets)if(c.owner!==b.owner&&c.warn<=0&&!b.orb&&Math.hypot(c.x-b.x,this.cometY(c)-b.y)<24){this.damageComet(c,b.damage);if(!b.pierce){b.life=0;break;}}
          if(b.life<=0)break;
          const s=terrainAt(this.terrain,b.x);
          const crossesMid=(prevY<s.mid&&b.y>=s.mid)||(prevY>s.mid+MID_T&&b.y<=s.mid+MID_T)||(b.y>=s.mid&&b.y<=s.mid+MID_T);
          const solid=(!b.pierce&&crossesMid&&this.surfaceAt(1,b.x))||(b.y>=s.floor&&this.surfaceAt(0,b.x))||(b.y<=s.ceil&&this.surfaceAt(2,b.x));
          if(solid){
            if(b.orb){this.openWell(b);break;}
            this.events.push({type:'spark',x:b.x,y:clamp(b.y,s.ceil,s.floor)});this.detonate(b);b.life=0;
          }
        }
        b.life-=dt;
        if(b.life<=0&&b.orb)this.openWell(b);
        if(b.y<-80||b.y>SETTINGS.height+80||b.x<this.camX-100||b.x>this.camX+SETTINGS.width+100)b.life=0;
      }
      this.bullets=this.bullets.filter(b=>b.life>0);
    }
    stepContacts(){
      for(const p of this.players){
        if(!p.alive||p.falling)continue;
        const x=this.worldX(p);
        for(const h of this.hazards){
          if(h.destroyed)continue;
          const reach=h.type==='rock'?h.r:h.type==='gate'?h.len/2:0;
          if(x<h.x-reach-40||x>h.x+(h.w||0)+reach+40)continue;
          if(h.type==='boost'){
            if(p.shift>=1&&p.lane===h.lane&&x>h.x&&x<h.x+h.w&&!h.used.includes(p.id)){h.used.push(p.id);p.vx+=SETTINGS.boostImpulse;p.power=Math.min(SETTINGS.maxPower,p.power+8);this.events.push({type:'boost',p:p.id});}
            continue;
          }
          if(h.type==='laser'&&this.laserState(h)!=='on')continue;
          if(p.hazardCd>0||p.invuln>0||!hazardTouches(h,x,p.y,R-2,this.roundTime))continue;
          if(h.type==='rock'||h.type==='gate'){
            // Floating debris punishes a badly timed deck change: you bounce back where you came from.
            this.hurt(p,SETTINGS.rockDamage,null,h.type);p.hazardCd=SETTINGS.hazardInvuln;
            if(p.shift<1&&!p.forced&&this.surfaceAt(p.fromLane,x))this.moveTo(p,p.fromLane,.2,'bounce');
            else if(h.type==='rock')this.destroyHazard(h);
            continue;
          }
          if(this.hurt(p,HAZARD_DAMAGE[h.type],null,h.type)){p.hazardCd=SETTINGS.hazardInvuln;p.vx-=SETTINGS.hazardKnock;}
          else p.hazardCd=.3;
          if(h.type==='crate')this.destroyHazard(h);
        }
        for(const s of this.pickups)if(!s.taken&&Math.hypot(s.x-x,s.y-p.y)<R+(s.type==='ring'?14:18))this.collect(p,s);
      }
    }
    collect(p,s){
      s.taken=true;this.stats[p.id].pickups++;let amount=0;
      if(s.type==='ammo')amount=this.addAmmo(p,SETTINGS.crateAmmo);
      else if(s.type==='health'){amount=Math.min(SETTINGS.healthPack,SETTINGS.maxHp-p.hp);p.hp+=amount;}
      else if(s.type==='energy'||s.type==='ring'){amount=Math.min(s.type==='ring'?SETTINGS.ringPower:SETTINGS.energyCell,SETTINGS.maxPower-p.power);p.power+=amount;}
      else if(WEAPONS[s.type]){p.weapon=s.type;p.special=WEAPONS[s.type].ammo;p.burstIndex=0;p.cooldown=0;amount=p.special;}
      this.events.push({type:'pickup',p:p.id,item:s.type,amount,x:s.x,y:s.y});
    }
    endRound(winner){
      this.phase='roundover';this.phaseTimer=SETTINGS.roundOver;this.winner=winner;this.bullets=[];this.wells=[];this.comets=[];
      for(const p of this.players){p.fire=false;p.echoShots=[];}
      if(winner!==null){this.wins[winner]++;if(this.wins[winner]>=this.roundsToWin)this.matchWinner=winner;}
      this.events.push({type:'round-over',winner,wins:[...this.wins],match:this.matchWinner!==null});
    }
    // ---- level director ----------------------------------------------------
    fill(){while(this.nextX<this.camX+SETTINGS.width+1400)this.generateBeat();}
    pickPickup(intensity){
      const low=this.players?.some(p=>p.hp<45);
      const table=[['ammo',3],['energy',2.2],['health',low?3:1.1],['scatter',.6],['burst',.6],['rail',.45+intensity*.4],['rocket',.3+intensity*.5],['boomerang',.6]];
      let pick=this.random()*table.reduce((s,[,w])=>s+w,0);
      for(const [type,w] of table){pick-=w;if(pick<=0)return type;}
      return 'ammo';
    }
    // A floating object placed in open air between two decks, sized so it never touches a running pilot.
    zoneObject(type,zone,x,extra={}){
      const span=zoneSpan(this.terrain,zone,x),room=span.bottom-span.top;
      if(room<40)return null;
      const y=(span.top+span.bottom)/2;
      if(type==='rock'){const r=Math.min(34,room/2-3);if(r<14)return null;return {id:this.nextId++,type,zone,x,y,r,hp:40,w:0,...extra};}
      if(type==='gate'){const len=Math.min(150,room-8);return {id:this.nextId++,type,zone,x,y,len,hp:60,w:0,rate:(this.random()<.5?-1:1)*(1.4+this.random()),phase:this.random()*TAU,...extra};}
      return {id:this.nextId++,type:'ring',zone,x,y,...extra};
    }
    // Every beat owns its own stretch of track, so a beat can never block all three decks at once.
    generateBeat(){
      const x=this.nextX,index=this.beat++,intensity=clamp((x-SETTINGS.runway)/26000,0,1),r=()=>this.random();
      const lane=()=>Math.floor(r()*3),id=()=>this.nextId++,t=this.terrain;
      const table=[['spikes',2.6],['crates',2],['midgap',2.4],['floorgap',1.2],['ceilgap',1.2],['boost',.8],['rocks',2.2],['gate',1.1+intensity],['rings',1],
        ['spikes2',.6+2*intensity],['laser',index>2?.8+2*intensity:0],['gauntlet',index>4?.5+1.6*intensity:0],['field',index>3?.8+intensity:0]]
        .map(([k,w])=>[k,k===this.lastPattern?w*.25:w]);
      let pick=r()*table.reduce((s,[,w])=>s+w,0),pattern='spikes';
      for(const [k,w] of table){pick-=w;if(pick<=0){pattern=k;break;}}
      this.lastPattern=pattern;let width=60;
      const push=h=>{
        if(!h)return;
        if(h.type==='ring'){this.pickups.push(h);return;}
        if(h.type!=='rock'&&h.type!=='gate')h.shapes=hazardShapes(t,h);
        this.hazards.push(h);
      };
      const spikes=(l,at,w)=>push({id:id(),type:'spikes',lane:l,x:at,w,hp:18});
      if(pattern==='spikes'){width=Math.round(60+r()*50+intensity*30);spikes(lane(),x,width);}
      else if(pattern==='spikes2'){width=Math.round(60+r()*40);const free=lane();for(const l of [0,1,2])if(l!==free)spikes(l,x,width);}
      else if(pattern==='crates'){
        width=50;const first=lane(),count=r()<.4+intensity*.3?2:1;
        for(let k=0;k<count;k++)push({id:id(),type:'crate',lane:(first+k)%3,x,w:50,hp:30});
      }
      else if(pattern==='midgap'||pattern==='floorgap'||pattern==='ceilgap'){
        width=Math.round(pattern==='midgap'?150+r()*110:150+r()*90+intensity*50);
        this.gaps.push({id:id(),surface:{floorgap:0,midgap:1,ceilgap:2}[pattern],x,w:width});
        // A ring hangs in a bridge opening as a reward for a brave crossing.
        if(pattern==='midgap'&&r()<.5)push(this.zoneObject('ring',r()<.5?0:1,x+width/2));
      }
      else if(pattern==='boost'){const l=lane();push({id:id(),type:'boost',lane:l,x,w:110,used:[]});this.pickups.push({id:id(),type:'energy',lane:l,x:x+180,y:laneY(t,l,x+180)});width=200;}
      else if(pattern==='laser'){
        const period=2.6-.8*intensity;width=16;
        push({id:id(),type:'laser',lanes:r()<.5?[0,1]:[1,2],x,w:16,period,on:.45,phase:r()*period});
      }
      else if(pattern==='gauntlet'){
        const order=[0,1,2];for(let k=2;k>0;k--){const j=Math.floor(r()*(k+1));[order[k],order[j]]=[order[j],order[k]];}width=450;
        order.forEach((l,k)=>spikes(l,x+k*190,70));
      }
      else if(pattern==='rocks'){
        const count=1+Math.floor(r()*3);width=60+(count-1)*130;
        for(let k=0;k<count;k++)push(this.zoneObject('rock',r()<.5?0:1,x+30+k*130,{spin:Math.round(r()*628)/100}));
      }
      else if(pattern==='gate'){width=150;push(this.zoneObject('gate',r()<.5?0:1,x+75));}
      else if(pattern==='rings'){width=320;const z=r()<.5?0:1;for(let k=0;k<3;k++)push(this.zoneObject('ring',(k+z)%2,x+k*160));}
      else if(pattern==='field'){
        // Asteroid field: cover in both gaps, staggered so there is always a way through.
        width=420;for(let k=0;k<4;k++)push(this.zoneObject('rock',k%2,x+k*130,{spin:Math.round(r()*628)/100}));
      }
      if(index>=1&&r()<.8){const l=lane(),px=x-120;this.pickups.push({id:id(),type:this.pickPickup(intensity),lane:l,x:px,y:laneY(t,l,px)});}
      this.nextX=x+width+Math.round(330-120*intensity+r()*120);
    }
    // ---- output ------------------------------------------------------------
    snapshot(){
      const from=this.camX-100,to=this.camX+SETTINGS.width+100,visible=o=>o.x+(o.w||o.r||o.len||40)>from&&o.x-(o.r||o.len||0)<to,r1=v=>Math.round(v*10)/10;
      return {
        t:Math.round(this.time*1000)/1000,phase:this.phase,phaseTimer:r1(this.phaseTimer),round:this.round,roundTime:r1(this.roundTime),
        timeLeft:Math.max(0,Math.ceil(SETTINGS.roundSeconds-this.roundTime)),overtime:this.overtime,camX:r1(this.camX),speed:r1(this.speed),
        terrain:this.terrain,arena:ARENAS[this.terrain.arena].name,
        wins:[...this.wins],roundsToWin:this.roundsToWin,winner:this.winner,matchWinner:this.matchWinner,
        players:this.players.map(p=>{
          const ghost=p.echo>0&&p.trail.length?p.trail[0]:null;
          return {id:p.id,name:p.name,avatar:p.avatar,x:r1(this.worldX(p)),offset:r1(p.offset),y:r1(p.y),lane:p.lane,
            shifting:p.shift<1,falling:p.falling,inv:Math.round(this.inversion(p)*100)/100,hp:Math.ceil(p.hp),power:Math.floor(p.power),ammo:p.ammo,
            weapon:p.weapon,special:p.special,shield:r1(p.shield),invuln:r1(p.invuln),flash:r1(p.flash),alive:p.alive,
            aimBack:p.aimBack,firing:p.fire,nextAmmoAt:p.nextAmmoAt,meters:Math.floor(this.worldX(p)*SETTINGS.metersPerUnit),
            powers:[...p.powers],powerCd:p.powerCd.map(r1),echo:r1(p.echo),
            ghost:ghost&&{x:r1(this.camX+ghost.offset),y:r1(ghost.y),inv:ghost.inv,aimBack:ghost.aimBack},
            blades:r1(p.blades),blade:Math.round(p.bladeAngle*100)/100,hex:r1(p.hex)};
        }),
        bullets:this.bullets.map(b=>({id:b.id,owner:b.owner,kind:b.kind,x:r1(b.x),y:r1(b.y),vx:Math.round(b.vx+this.speed),vy:Math.round(b.vy),reflected:!!b.reflected||undefined,echo:b.echo||undefined})),
        hazards:this.hazards.filter(h=>!h.destroyed&&visible(h)).map(h=>({id:h.id,type:h.type,lane:h.lane,lanes:h.lanes,zone:h.zone,x:h.x,y:h.y!==undefined?r1(h.y):undefined,w:h.w,
          r:h.r!==undefined?r1(h.r):undefined,len:h.len!==undefined?r1(h.len):undefined,hp:Math.ceil(h.hp),spin:h.spin,
          angle:h.type==='gate'?Math.round((h.phase+h.rate*this.roundTime)*100)/100:undefined,state:h.type==='laser'?this.laserState(h):undefined})),
        gaps:this.gaps.filter(visible).map(g=>({...g})),
        pickups:this.pickups.filter(s=>!s.taken&&visible(s)).map(s=>({id:s.id,type:s.type,x:r1(s.x),y:r1(s.y)})),
        wells:this.wells.map(w=>({id:w.id,owner:w.owner,x:r1(this.camX+w.offset),y:r1(w.y),life:r1(w.life),r:w.r})),
        comets:this.comets.map(c=>({id:c.id,owner:c.owner,lane:c.lane,x:r1(c.x),y:r1(this.cometY(c)),warn:r1(c.warn)})),
        stats:this.stats.map(s=>({...s}))
      };
    }
    drainEvents(){return this.events.splice(0);}
  }
  const api={SETTINGS,ARENAS,WEAPONS,POWERS,POWER_IDS,DEFAULT_POWERS,PICKUPS,AVATAR_IDS,ACTIONS,HAZARD_DAMAGE,Duel,
    terrainAt,surfaceY,laneY,zoneSpan,hazardShapes,gateEnds,hazardTouches,ballisticAngle,circleRect,cleanName,cleanPowers};
  if(typeof module!=='undefined')module.exports=api;else root.GravityDuel=api;
})(typeof window!=='undefined'?window:globalThis);
