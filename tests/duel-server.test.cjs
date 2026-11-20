const test=require('node:test');
const assert=require('node:assert/strict');
const {server,rooms,closeRoom}=require('../server.cjs');

let base;
test.before(()=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{base=`http://127.0.0.1:${server.address().port}`;resolve();})));
test.after(()=>{for(const room of [...rooms.values()])closeRoom(room);server.closeAllConnections?.();server.close();});

const post=(route,body)=>fetch(`${base}/api/duel/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
// Minimal SSE reader: resolves with the first event of the wanted type that passes the filter.
async function openStream(code,token){
  const controller=new AbortController();
  const response=await fetch(`${base}/api/duel/stream?code=${code}&token=${token}`,{signal:controller.signal});
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  return {
    status:response.status,
    async next(type,filter=()=>true,timeout=4000){
      const deadline=Date.now()+timeout;
      for(;;){
        let index;
        while((index=buffer.indexOf('\n\n'))>=0){
          const block=buffer.slice(0,index);buffer=buffer.slice(index+2);
          const name=/^event: (.+)$/m.exec(block)?.[1],data=/^data: (.+)$/m.exec(block)?.[1];
          if(name===type&&data){const parsed=JSON.parse(data);if(filter(parsed))return parsed;}
        }
        if(Date.now()>deadline)throw new Error('Timed out waiting for '+type);
        const {value,done}=await reader.read();if(done)throw new Error('stream closed');buffer+=decoder.decode(value,{stream:true});
      }
    },
    close(){controller.abort();}
  };
}

test('static files are served, private files are not',async()=>{
  assert.equal((await fetch(base+'/duel.html')).status,200);
  assert.equal((await fetch(base+'/')).status,200);
  for(const p of ['/server.cjs','/package.json','/tests/duel.test.cjs','/node_modules/x','/../README.md','/.gitignore'])
    assert.equal((await fetch(base+p)).status,404,p);
});

test('host, join, play and rematch an online duel',async()=>{
  const created=await post('create',{name:'Host',avatar:'pebble'});
  assert.equal(created.status,201);const host=await created.json();
  assert.match(host.code,/^[A-Z]{4}$/);assert.equal(host.seat,0);
  const joined=await (await post('join',{code:host.code.toLowerCase(),name:'Friend',avatar:'astro'})).json();
  assert.equal(joined.seat,1);
  assert.equal((await post('join',{code:host.code})).status,409,'room is full');
  assert.equal((await post('join',{code:'ZZZZ'})).status,404);

  const a=await openStream(host.code,host.token);
  const lobby=await a.next('welcome');assert.equal(lobby.seat,0);assert.equal(lobby.seats[1].name,'Friend');
  const b=await openStream(joined.code,joined.token);
  const first=await a.next('state');
  assert.deepEqual(first.snap.players.map(p=>[p.name,p.avatar]),[['Host','pebble'],['Friend','astro']]);

  // Wait for the fight, then the host moves up a deck via a cumulative press counter.
  await a.next('state',m=>m.snap.phase==='fight',6000);
  assert.equal((await post('input',{code:host.code,token:host.token,up:1,down:0,dash:0,shield:0,fire:false})).status,204);
  const moved=await a.next('state',m=>m.snap.players[0].lane===1);
  assert.equal(moved.snap.players[0].lane,1);
  // Replaying the same counter does not replay the press.
  await post('input',{code:host.code,token:host.token,up:1,fire:false});
  await new Promise(r=>setTimeout(r,300));
  const still=await a.next('state');assert.equal(still.snap.players[0].lane,1);

  assert.equal((await post('input',{code:host.code,token:'forged',up:5})).status,403);
  assert.equal((await post('rematch',{code:host.code,token:host.token})).status,409,'no rematch mid-match');
  const room=rooms.get(host.code);room.sim.matchWinner=0;room.sim.phase='matchover';
  assert.equal((await post('rematch',{code:host.code,token:joined.token})).status,200);
  const restarted=await b.next('state',m=>m.events.some(e=>e.type==='match-start'));
  assert.equal(restarted.snap.round,1);

  // A disconnect pauses the simulation and tells the other pilot.
  b.close();
  const notice=await a.next('lobby',m=>m.seats[1]&&!m.seats[1].connected);assert.ok(notice);
  const t=room.sim.time;await new Promise(r=>setTimeout(r,200));assert.equal(room.sim.time,t);
  a.close();
  assert.equal((await post('leave',{code:host.code,token:host.token})).status,200);
});

test('bad requests are rejected',async()=>{
  const r=await fetch(`${base}/api/duel/create`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
  assert.equal(r.status,400);
  const big=await post('create',{name:'x'.repeat(5000)});assert.equal(big.status,413);
  assert.equal((await fetch(`${base}/api/duel/stream?code=AAAA&token=x`)).status,404);
});
