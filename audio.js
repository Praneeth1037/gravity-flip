/* Short, layered local synthesis. No assets or timers; Web Audio owns note scheduling. */
(function(root){
  'use strict';
  class SoundBank{
    constructor(context){
      this.context=context;this.voices=new Set();this.lastStar=-10;
      this.master=context.createGain();this.master.gain.value=.65;
      this.limiter=context.createDynamicsCompressor();this.limiter.threshold.value=-16;this.limiter.ratio.value=8;
      this.master.connect(this.limiter);this.limiter.connect(context.destination);
      this.noise=context.createBuffer(1,Math.ceil(context.sampleRate*.3),context.sampleRate);
      const data=this.noise.getChannelData(0);let seed=3917;for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*(1-i/data.length);}
    }
    enabled(value){this.master.gain.setTargetAtTime(value?.65:0,this.context.currentTime,.015);}
    note(start,end,length,wave='sine',volume=.05,delay=0){
      if(this.voices.size>=28)return;
      const c=this.context,at=c.currentTime+delay,g=c.createGain();let source;
      if(wave==='noise'){source=c.createBufferSource();source.buffer=this.noise;}else{source=c.createOscillator();source.type=wave;source.frequency.setValueAtTime(start,at);source.frequency.exponentialRampToValueAtTime(Math.max(20,end),at+length);}
      const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=wave==='noise'?1800:5000;
      g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(volume,at+.006);g.gain.exponentialRampToValueAtTime(.0001,at+length);
      source.connect(filter);filter.connect(g);g.connect(this.master);this.voices.add(source);source.start(at);source.stop(at+length+.02);
      source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect();this.voices.delete(source);};
    }
    play(type,{gravity=1,chain=0,weapon='machine'}={}){
      if(this.context.state!=='running')return;
      if(type==='flip'){this.note(gravity===-1?280:680,gravity===-1?780:230,.12,'sine',.06);this.note(110,65,.09,'triangle',.035);}
      if(type==='shoot'&&weapon==='scatter'){this.note(110,35,.15,'triangle',.07);this.note(500,80,.11,'noise',.065);}
      else if(type==='shoot'&&weapon==='rail'){this.note(1700,250,.18,'sawtooth',.025);this.note(140,40,.13,'triangle',.055);}
      else if(type==='shoot'&&weapon==='burst'){this.note(990,220,.035,'triangle',.04);this.note(200,80,.028,'noise',.04);}
      else if(type==='shoot'&&weapon==='rocket'){this.note(90,40,.32,'sawtooth',.03);this.note(700,120,.26,'noise',.05);}
      else if(type==='shoot'){this.note(760,210,.045,'triangle',.034);this.note(150,55,.055,'triangle',.04);this.note(200,70,.032,'noise',.045);}
      if(type==='hit'){this.note(220,75,.08,'noise',.045);this.note(390,180,.07,'triangle',.035);}
      if(type==='star'){if(this.context.currentTime-this.lastStar<.045)return;this.lastStar=this.context.currentTime;const n=[659,784,880,988,1175][chain%5];this.note(n,n*1.02,.12,'sine',.05);this.note(n*2,n*2,.08,'sine',.015);}
      if(type==='power'||type==='reward'){[523,659,784,1047].forEach((n,i)=>this.note(n,n,.16,'sine',.04,i*.055));}
      if(type==='burst'){this.note(80,35,.18,'triangle',.07);this.note(900,100,.14,'noise',.065);this.note(784,1047,.14,'sine',.03,.05);}
      if(type==='shield'){this.note(190,800,.2,'sine',.055);this.note(100,60,.1,'noise',.04);}
      if(type==='dry'){this.note(1400,1300,.03,'square',.02);}
      if(type==='dash'){this.note(240,900,.14,'sine',.045);this.note(600,200,.12,'noise',.035);}
      if(type==='heal'){[392,523,659].forEach((n,i)=>this.note(n,n*1.01,.14,'sine',.045,i*.05));}
      if(type==='countdown'){this.note(660,660,.12,'square',.03);}
      if(type==='fight'){this.note(523,1047,.24,'sawtooth',.03);this.note(80,40,.2,'triangle',.06);}
      if(type==='crash'){this.note(140,25,.28,'triangle',.075);this.note(500,50,.25,'noise',.075);}
    }
    dispose(){for(const voice of this.voices){try{voice.stop();}catch{}}this.voices.clear();this.master.disconnect();this.limiter.disconnect();}
  }
  root.GravitySound=SoundBank;
})(window);
