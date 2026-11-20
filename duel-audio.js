/* Gravity Duel sound system: synthesized effects and a generated soundtrack. No audio files.
   Effects and music have separate buses; each pilot's sounds are panned to their side. */
(function(root){
  'use strict';
  const NOTE=n=>440*Math.pow(2,(n-69)/12);
  // A minor loop: Am – F – C – G (MIDI roots), with chord tones for the arpeggio.
  const PROGRESSION=[[45,[57,60,64,69]],[41,[53,57,60,65]],[48,[55,60,64,67]],[43,[55,59,62,67]]];
  class DuelAudio{
    constructor(context){
      const c=this.context=context;
      this.voices=0;this.maxVoices=48;this.last={};
      this.master=c.createGain();this.master.gain.value=.9;
      this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-14;this.limiter.ratio.value=10;this.limiter.attack.value=.003;this.limiter.release.value=.2;
      this.sfx=c.createGain();this.sfx.gain.value=.8;
      this.music=c.createGain();this.music.gain.value=0;this.musicLevel=.32;
      this.sfx.connect(this.master);this.music.connect(this.master);this.master.connect(this.limiter);this.limiter.connect(c.destination);
      this.noiseBuffer=c.createBuffer(1,c.sampleRate,c.sampleRate);
      const data=this.noiseBuffer.getChannelData(0);let seed=7177;for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=seed/4294967296*2-1;}
      this.playing=false;this.step=0;this.nextTime=0;this.tempo=118;this.intensity=0;this.timer=null;
    }
    setSfx(on){this.sfx.gain.setTargetAtTime(on?.8:0,this.context.currentTime,.02);}
    setMusic(on){this.musicOn=on;this.music.gain.setTargetAtTime(on&&this.playing?this.musicLevel:0,this.context.currentTime,.25);}
    // ---- primitives ---------------------------------------------------------
    voice(duration){if(this.voices>=this.maxVoices)return false;this.voices++;setTimeout(()=>{this.voices--;},(duration+.1)*1000);return true;}
    out(bus,pan){
      const c=this.context;if(!pan||!c.createStereoPanner)return bus;
      const p=c.createStereoPanner();p.pan.value=pan;p.connect(bus);return p;
    }
    tone({f0=440,f1=f0,dur=.12,type='sine',vol=.05,delay=0,attack=.005,cutoff=8000,pan=0,bus=this.sfx}={}){
      if(!this.voice(dur+delay))return;
      const c=this.context,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter();
      o.type=type;o.frequency.setValueAtTime(Math.max(20,f0),t);if(f1!==f0)o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
      f.type='lowpass';f.frequency.value=cutoff;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
      o.connect(f);f.connect(g);g.connect(this.out(bus,pan));o.start(t);o.stop(t+dur+.03);
      o.onended=()=>{o.disconnect();f.disconnect();g.disconnect();};
    }
    noise({dur=.15,vol=.05,f0=1200,f1=f0,q=1,kind='bandpass',delay=0,pan=0,bus=this.sfx}={}){
      if(!this.voice(dur+delay))return;
      const c=this.context,t=c.currentTime+delay,s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();
      s.buffer=this.noiseBuffer;f.type=kind;f.Q.value=q;f.frequency.setValueAtTime(f0,t);if(f1!==f0)f.frequency.exponentialRampToValueAtTime(Math.max(30,f1),t+dur);
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
      s.connect(f);f.connect(g);g.connect(this.out(bus,pan));s.start(t,Math.random()*.5);s.stop(t+dur+.03);
      s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};
    }
    chord(notes,{dur=.18,type='triangle',vol=.035,gap=.06,pan=0}={}){notes.forEach((n,i)=>this.tone({f0:NOTE(n),dur,type,vol,delay:i*gap,pan}));}
    // Rate limit for very frequent sounds so rapid fire never turns to mush.
    gate(name,seconds){const now=this.context.currentTime;if(now-(this.last[name]??-9)<seconds)return false;this.last[name]=now;return true;}
    // ---- effects -------------------------------------------------------------
    play(type,o={}){
      if(this.context.state!=='running')return;
      const pan=o.p===0?-.45:o.p===1?.45:0,P={pan};
      switch(type){
        case 'shoot':{
          if(!this.gate('shoot'+o.p,.03))return;
          const w=o.weapon;
          if(w==='scatter'){this.noise({dur:.16,vol:.08,f0:900,f1:200,kind:'lowpass',...P});this.tone({f0:120,f1:45,dur:.15,type:'triangle',vol:.07,...P});}
          else if(w==='rail'){this.tone({f0:2400,f1:300,dur:.22,type:'sawtooth',vol:.03,...P});this.tone({f0:160,f1:40,dur:.18,type:'triangle',vol:.07,...P});this.noise({dur:.2,vol:.03,f0:4000,f1:800,...P});}
          else if(w==='rocket'){this.noise({dur:.4,vol:.07,f0:600,f1:150,kind:'lowpass',...P});this.tone({f0:90,f1:50,dur:.35,type:'sawtooth',vol:.03,...P});}
          else if(w==='boomerang'){this.tone({f0:500,f1:900,dur:.18,type:'triangle',vol:.03,...P});this.noise({dur:.25,vol:.03,f0:1500,f1:3000,q:4,...P});}
          else if(w==='burst'){this.tone({f0:1000,f1:240,dur:.04,type:'square',vol:.025,...P});this.noise({dur:.04,vol:.04,f0:2200,...P});}
          else{this.tone({f0:820,f1:200,dur:.05,type:'square',vol:.022,...P});this.tone({f0:150,f1:60,dur:.06,type:'triangle',vol:.04,...P});this.noise({dur:.035,vol:.035,f0:2600,...P});}
          break;
        }
        case 'echo-shot':if(this.gate('echo'+o.p,.05))this.tone({f0:1200,f1:600,dur:.08,type:'sine',vol:.02,...P});break;
        case 'hurt':{
          if(!this.gate('hurt'+o.p,.05))return;
          if(o.cause==='laser'){this.tone({f0:1800,f1:200,dur:.18,type:'sawtooth',vol:.04,...P});this.noise({dur:.15,vol:.04,f0:5000,...P});}
          else if(o.cause==='void'){this.tone({f0:900,f1:80,dur:.6,type:'sine',vol:.06,...P});}
          else if(o.cause==='comet'||o.cause==='splash'){this.noise({dur:.35,vol:.1,f0:500,f1:80,kind:'lowpass',...P});this.tone({f0:80,f1:35,dur:.3,type:'sine',vol:.1,...P});}
          else{this.noise({dur:.09,vol:.06,f0:700,f1:250,...P});this.tone({f0:260,f1:110,dur:.1,type:'triangle',vol:.05,...P});}
          break;
        }
        case 'block':this.tone({f0:1600,f1:1500,dur:.18,type:'sine',vol:.04,...P});this.tone({f0:2400,dur:.12,type:'sine',vol:.02,...P});break;
        case 'reflect':this.tone({f0:900,f1:2400,dur:.14,type:'triangle',vol:.05,...P});this.tone({f0:3200,dur:.1,type:'sine',vol:.02,delay:.03,...P});break;
        case 'shield':this.tone({f0:220,f1:880,dur:.3,type:'sine',vol:.06,...P});this.tone({f0:330,f1:1320,dur:.3,type:'triangle',vol:.025,delay:.02,...P});this.noise({dur:.3,vol:.02,f0:3000,f1:6000,q:6,...P});break;
        case 'dash':case 'boost':this.noise({dur:.22,vol:.07,f0:400,f1:3000,q:2,...P});this.tone({f0:200,f1:700,dur:.18,type:'sine',vol:.04,...P});break;
        case 'lane':this.tone({f0:o.up?300:700,f1:o.up?760:260,dur:.13,type:'sine',vol:.045,...P});break;
        case 'drop':this.tone({f0:600,f1:180,dur:.2,type:'sine',vol:.04,...P});break;
        case 'bounce':this.tone({f0:180,f1:520,dur:.09,type:'triangle',vol:.07,...P});this.tone({f0:520,f1:200,dur:.12,type:'triangle',vol:.05,delay:.08,...P});break;
        case 'land':if(this.gate('land'+o.p,.08))this.noise({dur:.06,vol:.025,f0:300,kind:'lowpass',...P});break;
        case 'bump':if(this.gate('bump'+o.p,.15))this.tone({f0:140,f1:110,dur:.06,type:'square',vol:.02,...P});break;
        case 'dry':if(this.gate('dry'+o.p,.2))this.tone({f0:1500,f1:1400,dur:.03,type:'square',vol:.025,...P});break;
        case 'no-item':if(this.gate('noitem'+o.p,.25)){this.tone({f0:180,dur:.1,type:'square',vol:.03,...P});this.tone({f0:150,dur:.12,type:'square',vol:.03,delay:.1,...P});}break;
        case 'select':this.tone({f0:1100,f1:1300,dur:.05,type:'triangle',vol:.03,...P});break;
        case 'pickup':{
          const item=o.item;
          if(item==='health')this.chord([67,72,76],{dur:.25,type:'sine',vol:.05,gap:.07,pan});
          else if(item==='ammo'){this.noise({dur:.03,vol:.05,f0:3000,...P});this.noise({dur:.04,vol:.05,f0:2200,delay:.06,...P});this.tone({f0:420,dur:.06,type:'square',vol:.02,delay:.06,...P});}
          else if(item==='energy'||item==='ring')this.chord([76,79,84,88],{dur:.14,type:'sine',vol:.035,gap:.04,pan});
          else if(item==='orb'){this.chord([69,76,81,85,88],{dur:.28,type:'triangle',vol:.035,gap:.05,pan});this.noise({dur:.4,vol:.02,f0:5000,f1:9000,q:8,...P});}
          else{this.noise({dur:.05,vol:.05,f0:1800,...P});this.tone({f0:300,f1:900,dur:.12,type:'square',vol:.025,delay:.05,...P});this.noise({dur:.05,vol:.05,f0:1200,delay:.12,...P});}
          break;
        }
        case 'refill':if(this.gate('refill',.2))this.chord([84,91],{dur:.12,type:'sine',vol:.03,gap:.05,pan});break;
        case 'power':{
          const id=o.power;
          if(id==='well'){this.tone({f0:220,f1:40,dur:.7,type:'sine',vol:.09,...P});this.noise({dur:.7,vol:.04,f0:3000,f1:200,q:3,...P});}
          else if(id==='echo'){[0,.12,.24,.36].forEach((d,i)=>this.tone({f0:880,f1:660,dur:.1,type:'sine',vol:.05*(1-i*.22),delay:d,...P}));}
          else if(id==='comet'){this.tone({f0:2000,f1:300,dur:.65,type:'sine',vol:.04,...P});this.noise({dur:.7,vol:.05,f0:300,f1:900,kind:'lowpass',...P});}
          else if(id==='blades'){for(let i=0;i<6;i++)this.noise({dur:.06,vol:.04,f0:5000-i*400,q:10,delay:i*.05,...P});this.tone({f0:600,f1:1200,dur:.3,type:'sawtooth',vol:.015,...P});}
          else if(id==='hex'){this.tone({f0:415,f1:400,dur:.45,type:'triangle',vol:.04,...P});this.tone({f0:587,f1:560,dur:.45,type:'triangle',vol:.04,...P});}
          break;
        }
        case 'well-open':this.tone({f0:70,f1:30,dur:1.2,type:'sine',vol:.12});this.noise({dur:1.1,vol:.04,f0:150,f1:2000,q:2});break;
        case 'swallow':if(this.gate('swallow',.08))this.tone({f0:900,f1:120,dur:.12,type:'sine',vol:.03});break;
        case 'hexed':this.tone({f0:500,f1:350,dur:.5,type:'sawtooth',vol:.03,...P});this.tone({f0:353,f1:500,dur:.5,type:'sawtooth',vol:.03,...P});break;
        case 'explosion':this.noise({dur:.5,vol:.12,f0:800,f1:60,kind:'lowpass'});this.tone({f0:110,f1:30,dur:.45,type:'sine',vol:.12});break;
        case 'destroy':{
          if(!this.gate('destroy',.05))return;
          if(o.kind==='crate'){this.noise({dur:.12,vol:.08,f0:700,q:3});this.noise({dur:.18,vol:.05,f0:400,delay:.05,q:2});}
          else if(o.kind==='rock'){this.noise({dur:.4,vol:.09,f0:300,f1:80,kind:'lowpass'});this.tone({f0:90,f1:40,dur:.3,type:'triangle',vol:.06});}
          else if(o.kind==='gate'){this.tone({f0:520,f1:480,dur:.5,type:'square',vol:.03});this.tone({f0:780,dur:.4,type:'sine',vol:.03});this.noise({dur:.2,vol:.06,f0:2000});}
          else{this.noise({dur:.15,vol:.06,f0:1500,f1:500});this.tone({f0:400,f1:150,dur:.12,type:'triangle',vol:.04});}
          break;
        }
        case 'hazard-hit':if(this.gate('hh',.04))this.noise({dur:.03,vol:.03,f0:3500,q:2});break;
        case 'spark':if(this.gate('spark',.05))this.noise({dur:.025,vol:.02,f0:5000,q:3});break;
        case 'falling':this.tone({f0:700,f1:250,dur:.35,type:'sine',vol:.03,...P});break;
        case 'countdown':this.tone({f0:660,dur:.14,type:'square',vol:.04});break;
        case 'fight':this.tone({f0:523,f1:1046,dur:.3,type:'sawtooth',vol:.04});this.tone({f0:80,f1:40,dur:.3,type:'triangle',vol:.08});this.noise({dur:.3,vol:.04,f0:2000,f1:6000});break;
        case 'overtime':[0,.3,.6].forEach(d=>this.tone({f0:880,f1:660,dur:.22,type:'square',vol:.035,delay:d}));break;
        case 'ko':this.noise({dur:.8,vol:.12,f0:1200,f1:60,kind:'lowpass',...P});this.tone({f0:300,f1:40,dur:.8,type:'sawtooth',vol:.05,...P});break;
        case 'round-win':this.chord([60,64,67,72,76],{dur:.3,type:'triangle',vol:.05,gap:.09});break;
        case 'match-win':this.chord([60,64,67,72],{dur:.35,type:'triangle',vol:.05,gap:.12});this.chord([65,69,72,77],{dur:.35,type:'triangle',vol:.05,gap:.12,pan:0});setTimeout(()=>this.chord([67,71,74,79,84],{dur:.6,type:'triangle',vol:.06,gap:.08}),520);break;
        case 'heartbeat':this.tone({f0:70,f1:50,dur:.12,type:'sine',vol:.09,...P});this.tone({f0:65,f1:45,dur:.12,type:'sine',vol:.07,delay:.16,...P});break;
        case 'ui':this.tone({f0:900,f1:1100,dur:.05,type:'triangle',vol:.03});break;
      }
    }
    // ---- generated soundtrack ---------------------------------------------
    startMusic(){
      if(this.playing)return;
      this.playing=true;this.step=0;this.nextTime=this.context.currentTime+.08;
      this.music.gain.setTargetAtTime(this.musicOn?this.musicLevel:0,this.context.currentTime,.4);
      this.timer=setInterval(()=>this.schedule(),25);
    }
    stopMusic(){
      if(!this.playing)return;
      this.playing=false;clearInterval(this.timer);this.timer=null;
      this.music.gain.setTargetAtTime(0,this.context.currentTime,.15);
    }
    setIntensity(level){this.intensity=level;this.tempo=level>=2?146:level===1?126:118;}
    schedule(){
      const c=this.context;if(c.state!=='running')return;
      const sixteenth=60/this.tempo/4;
      while(this.nextTime<c.currentTime+.12){this.note(this.step,this.nextTime);this.nextTime+=sixteenth;this.step++;}
    }
    note(step,t){
      const bar=Math.floor(step/16)%PROGRESSION.length,beat=step%16,[root,tones]=PROGRESSION[bar],m=this.music,c=this.context,delay=Math.max(0,t-c.currentTime);
      // Bass on eighths with an octave jump, kick on the beat, hats on sixteenths, arpeggio on top.
      if(beat%2===0)this.tone({f0:NOTE(root+(beat%8===6?12:0)),dur:.16,type:'sawtooth',vol:.05,cutoff:420,delay,bus:m});
      if(beat%4===0){this.tone({f0:120,f1:40,dur:.14,type:'sine',vol:.14,delay,bus:m});}
      if(this.intensity>=1&&(beat===4||beat===12))this.noise({dur:.12,vol:.06,f0:1800,q:.8,delay,bus:m});
      this.noise({dur:.03,vol:beat%2?.012:.02,f0:8000,kind:'highpass',delay,bus:m});
      if(beat%2===1||this.intensity>=2)this.tone({f0:NOTE(tones[(step>>1)%tones.length]+12),dur:.12,type:'triangle',vol:.018,cutoff:3500,delay,bus:m});
      if(beat===0)this.tone({f0:NOTE(tones[0]),dur:sixteenthLen(this.tempo)*15,type:'sine',vol:.02,attack:.2,delay,bus:m});
    }
    dispose(){this.stopMusic();try{this.master.disconnect();this.limiter.disconnect();}catch{}}
  }
  const sixteenthLen=tempo=>60/tempo/4;
  root.GravityDuelAudio=DuelAudio;
})(window);
