/* Cosmetic rig only: it never changes the circular collision body. */
(function(root){
  'use strict';
  const E=typeof module!=='undefined'?require('./engine.js'):root.GravityEngine;
  const TAU=Math.PI*2;
  function createPose(){return {recoil:0,landing:0,angle:0,inversion:1,anchorOffset:0,phase:0,grounded:true,groundBlend:1,facing:1,slope:0,bob:0};}
  function updatePose(pose,run,dt,reduced=false){
    const bounds=E.boundsAt(run.distance),side=run.gravity===1?'bottom':'top';
    const wasGrounded=pose.grounded;
    pose.grounded=E.hasSurface(run.distance,side,E.surfaceOpenings(run.obstacles))&&run.vy===0&&Math.abs(run.y-bounds[side])<.1;
    pose.landing=reduced?0:(!wasGrounded&&pose.grounded?1:pose.landing*Math.exp(-18*dt));
    pose.recoil=reduced?0:pose.recoil*Math.exp(-24*dt);
    pose.facing=1;
    pose.slope=Math.atan((E.terrainAt(run.distance+8)[side]-E.terrainAt(run.distance-8)[side])/16);
    const lean=pose.grounded?pose.slope:Math.max(-.28,Math.min(.28,Math.atan2(run.vy,run.speed)*.24));
    // Vertical inversion preserves world-forward facing. A short bank leads the transfer,
    // then the soles align exactly with the landing slope rather than easing through it.
    pose.angle=reduced||pose.grounded?lean:pose.angle+(lean-pose.angle)*(1-Math.exp(-22*dt));
    pose.inversion=reduced||pose.grounded?run.gravity:pose.inversion+(run.gravity-pose.inversion)*(1-Math.exp(-20*dt));
    pose.anchorOffset=pose.grounded?E.terrainAt(run.distance)[side]-run.y-run.gravity*17/Math.cos(pose.slope):0;
    pose.phase=reduced?0:run.distance/100*TAU;
    pose.groundBlend=reduced?Number(pose.grounded):pose.groundBlend+(Number(pose.grounded)-pose.groundBlend)*(1-Math.exp(-25*dt));
    pose.bob=reduced||!pose.grounded?0:-Math.abs(Math.sin(pose.phase*2))*.8;
    return pose;
  }
  function legPose(pose,side){
    const phase=((pose.phase/TAU+(side===1?0:.5))%1+1)%1,stance=phase<.56;
    const t=stance?phase/.56:(phase-.56)/.44;
    const stride=stance?11-22*t:-11+22*t,lift=stance?0:Math.sin(t*Math.PI)*8;
    const blend=pose.groundBlend,face=pose.facing;
    const foot={x:(stride*blend+(side*8+4)*(1-blend))*face,y:17-lift*blend-(1-blend)*(side===1?7:11)};
    const hip={x:side*5,y:pose.bob},ankle={x:foot.x,y:foot.y-3};
    const dx=ankle.x-hip.x,dy=ankle.y-hip.y,d=Math.max(.001,Math.hypot(dx,dy)),bend=Math.sqrt(Math.max(0,13*13-d*d/4));
    const knee={x:(hip.x+ankle.x)/2+dy/d*bend*face,y:(hip.y+ankle.y)/2-dx/d*bend*face};
    return {hip,knee,ankle,foot,stance:stance&&pose.grounded};
  }
  const api={createPose,updatePose,legPose};
  if(typeof module!=='undefined')module.exports=api;else root.GravityMotion=api;
})(typeof window!=='undefined'?window:globalThis);
