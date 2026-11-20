/* Shared canvas character renderer for solo runs and duels. Cosmetic only: hitboxes live in the engines. */
(function(root){
  'use strict';
  const M=root.GravityMotion;
  const COLORS={orbit:['#ffad50','#536c83','#ffdc8c'],wisp:['#88f5d9','#388f8a','#d5fff3'],pebble:['#b99aef','#68518e','#e5d4ff'],astro:['#dcebf5','#617e95','#ffffff']};
  const GUN_COLORS={machine:'#87dff3',blaster:'#87dff3',scatter:'#ffca7c',burst:'#a8ef9e',rail:'#83dbff',rocket:'#ff9d7a'};
  function round(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}}
  function ellipse(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();}
  function line(c,x1,y1,x2,y2,color,width=2){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  function gun(c,weapon){
    const gunColor=GUN_COLORS[weapon]||GUN_COLORS.machine;
    round(c,9,-13,21,9,3,'#324b65',gunColor);
    if(weapon==='scatter'){round(c,23,-14,13,5,1,gunColor);round(c,23,-8,13,5,1,gunColor);round(c,11,-3,9,5,2,'#9c6c46');}
    else if(weapon==='rail'){round(c,23,-11,22,4,1,gunColor);for(let gx=22;gx<39;gx+=5)line(c,gx,-14,gx,-5,'#e7faff',2);}
    else if(weapon==='rocket'){round(c,6,-17,34,13,6,'#4a3442',gunColor);ellipse(c,40,-10.5,4,5,'#ffd7b0');round(c,14,-4,7,7,2,'#7d5662');}
    else{round(c,25,-11,9,5,1,gunColor);if(weapon==='burst'){round(c,14,-18,10,4,1,gunColor);round(c,15,-4,6,9,1,'#759b66');}}
  }
  // rig: pose from GravityMotion.createPose(); options.aimBack mirrors only the weapon arm.
  function draw(c,id,x,y,rig,size=60,weapon='machine',options={}){
    const colors=COLORS[id]||COLORS.orbit;
    c.save();c.translate(x,y+(rig.anchorOffset+17*rig.inversion*rig.landing*.08)*size/60);c.rotate(rig.angle);c.scale(size/60*(1+rig.landing*.04),size/60*(1-rig.landing*.08)*(Math.abs(rig.inversion)<.12?Math.sign(rig.inversion||1)*.12:rig.inversion));c.lineCap='round';
    function limb(side){
      const leg=M.legPose(rig,side),{hip,knee,ankle,foot}=leg;
      c.save();if(side===-1)c.globalAlpha*=.7;
      line(c,hip.x,hip.y,knee.x,knee.y,colors[1],6);line(c,knee.x,knee.y,ankle.x,ankle.y,colors[0],5);
      ellipse(c,knee.x,knee.y,3.1,3.1,colors[2]);ellipse(c,knee.x,knee.y,1.4,1.4,colors[1]);
      round(c,foot.x-5+(rig.facing===-1?-3:0),foot.y-5,13,5,2.5,colors[0],colors[2]);
      line(c,foot.x-4+(rig.facing===-1?-3:0),foot.y,foot.x+7+(rig.facing===-1?-3:0),foot.y,'#76eddf',1.5);
      c.restore();
    }
    limb(-1);
    for(const side of [-1,1]){const swing=Math.sin(rig.phase+(side===1?Math.PI:0))*rig.groundBlend;
      const shoulder={x:side*14,y:-20+rig.bob},elbow={x:side*(17+2*swing),y:-11+rig.bob},hand={x:side*(15-4*swing),y:-4+swing*4+rig.bob};
      line(c,shoulder.x,shoulder.y,elbow.x,elbow.y,colors[1],4);line(c,elbow.x,elbow.y,hand.x,hand.y,colors[0],5);ellipse(c,hand.x,hand.y,3,3,colors[2]);
    }
    // Side-profile silhouettes: backpack behind, visor/eye and boot toes toward world-right.
    c.save();c.translate(0,rig.bob);
    round(c,-19,-23,9,20,4,colors[1],colors[2]);
    round(c,-11,-19,23,22,8,colors[0],colors[2]);
    if(id==='wisp'){
      ellipse(c,2,-23,16,15,colors[0]);ellipse(c,13,-24,3,5,'#123e4b');
      line(c,-9,-33,-13,-39,colors[0],4);
    }else if(id==='pebble'){
      round(c,-12,-37,30,27,11,colors[0],colors[2]);
      line(c,-6,-36,-8,-43,'#ffeac5',5);ellipse(c,12,-26,3,5,'#251a41');
      line(c,14,-17,18,-18,'#503b70',2);
    }else{
      round(c,-14,-38,32,29,id==='astro'?14:11,colors[0],colors[2]);
      round(c,2,-33,20,19,7,'#0b2438',id==='astro'?'#d6ba75':'#6c8b9d');
      ellipse(c,14,-24,3.4,6,id==='astro'?'#f9df9e':'#74f8ff');
      ellipse(c,13,-26,1,2,'#fff');
      if(id==='orbit'){line(c,-7,-38,-10,-44,colors[1],2);ellipse(c,-10,-44,2,2,colors[2]);}
    }
    round(c,-3,-9,12,5,2,colors[1]);line(c,1,-7,6,-7,'#8bf9e8',1.5);c.restore();
    limb(1);
    c.save();if(options.aimBack){c.scale(-1,1);c.translate(rig.recoil*4,0);}else c.translate(-rig.recoil*4,0);
    gun(c,weapon);c.restore();
    c.restore();
  }
  root.GravityRig=Object.freeze({draw,COLORS,GUN_COLORS});
})(window);
