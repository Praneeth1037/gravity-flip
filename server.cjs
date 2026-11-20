/* Local static server plus server-authoritative online duel rooms (Server-Sent Events + small JSON posts, no dependencies). */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {Duel,ACTIONS,SETTINGS}=require('./duel-engine.js');
const root=__dirname;
const PORT=Number(process.env.PORT)||5196;
const HOST=process.env.HOST||'127.0.0.1';
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const PRIVATE=new Set(['node_modules','tests','artifacts','server.cjs','package.json','package-lock.json']);
const MAX_ROOMS=40,ROOM_IDLE_MS=60_000,TICK_MS=1000/60,BROADCAST_MS=33;
const rooms=new Map();

// The duel page may be hosted elsewhere (for example on Vercel), so the room API allows cross-origin calls.
// Seats are protected by tokens in the request body, not cookies, so a wildcard origin is safe here.
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'};
function json(res,status,body){res.writeHead(status,{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
function readBody(req,limit=1024){
  return new Promise((resolve,reject)=>{
    let size=0,tooLarge=false;const chunks=[];
    // Oversized bodies are drained and answered with 413 rather than resetting the socket.
    req.on('data',chunk=>{size+=chunk.length;if(size>limit){if(!tooLarge){tooLarge=true;reject(Object.assign(new Error('Body too large'),{status:413}));}}else chunks.push(chunk);});
    req.on('end',()=>{if(tooLarge)return;try{resolve(chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{});}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}));}});
    req.on('error',reject);
  });
}
function newCode(){
  const letters='ABCDEFGHJKMNPQRSTUVWXYZ';
  for(;;){let code='';for(let i=0;i<4;i++)code+=letters[crypto.randomInt(letters.length)];if(!rooms.has(code))return code;}
}
const newToken=()=>crypto.randomBytes(18).toString('base64url');
function seatOf(room,token){return typeof token==='string'?room.seats.findIndex(s=>s&&s.token===token):-1;}
function lobbyInfo(room){return {code:room.code,started:room.started,seats:room.seats.map((s,i)=>s?{name:room.sim.roster[i].name,avatar:room.sim.roster[i].avatar,powers:room.sim.roster[i].powers,connected:!!s.stream}:null)};}
function sendEvent(res,type,data){res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);}
function broadcast(room,type,data){for(const seat of room.seats)if(seat?.stream)sendEvent(seat.stream,type,data);}
function running(room){return room.started&&room.seats.every(s=>s?.stream);}
function announce(room){broadcast(room,'lobby',lobbyInfo(room));}

function createRoom(){
  const room={code:newCode(),sim:new Duel(),seats:[null,null],started:false,accumulator:0,last:Date.now(),lastBroadcast:0,lastLobby:0,idleSince:Date.now()};
  room.timer=setInterval(()=>tick(room),TICK_MS);rooms.set(room.code,room);return room;
}
function closeRoom(room){
  clearInterval(room.timer);
  for(const seat of room.seats)if(seat?.stream){try{seat.stream.end();}catch{}}
  rooms.delete(room.code);
}
function tick(room){
  const now=Date.now(),dt=Math.min(.1,(now-room.last)/1000);room.last=now;
  if(running(room)){
    room.accumulator+=dt;
    while(room.accumulator>=SETTINGS.fixedStep){room.sim.step(SETTINGS.fixedStep);room.accumulator-=SETTINGS.fixedStep;}
    if(now-room.lastBroadcast>=BROADCAST_MS){room.lastBroadcast=now;broadcast(room,'state',{snap:room.sim.snapshot(),events:room.sim.drainEvents()});}
  }else{
    room.accumulator=0;
    if(now-room.lastLobby>=1000){room.lastLobby=now;announce(room);}
  }
  if(room.seats.some(s=>s?.stream))room.idleSince=now;
  else if(now-room.idleSince>ROOM_IDLE_MS)closeRoom(room);
}
function seatPlayer(room,index,body){
  room.seats[index]={token:newToken(),stream:null,counts:Object.fromEntries(ACTIONS.map(a=>[a,0]))};
  room.sim.setRoster(index,{name:body.name,avatar:body.avatar,powers:body.powers});
  return {code:room.code,token:room.seats[index].token,seat:index};
}

async function api(req,res,url){
  const route=url.pathname.slice('/api/duel/'.length);
  if(req.method==='GET'&&route==='health')return json(res,200,{ok:true,rooms:rooms.size});
  if(req.method==='GET'&&route==='stream'){
    const room=rooms.get(String(url.searchParams.get('code')||'').toUpperCase()),seat=room?seatOf(room,url.searchParams.get('token')):-1;
    if(seat<0)return json(res,404,{error:'Room or seat not found'});
    res.writeHead(200,{...CORS,'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write('retry: 1500\n\n');
    const record=room.seats[seat];
    if(record.stream&&record.stream!==res){try{record.stream.end();}catch{}}
    record.stream=res;
    const keepAlive=setInterval(()=>res.write(': ping\n\n'),15000);
    req.on('close',()=>{clearInterval(keepAlive);if(record.stream===res){record.stream=null;record.fire=false;room.sim.hold(seat,false);announce(room);}});
    sendEvent(res,'welcome',{seat,...lobbyInfo(room)});
    if(!room.started&&room.seats.every(s=>s?.stream)){room.started=true;room.sim.restartMatch();room.sim.drainEvents();}
    announce(room);
    if(room.started)sendEvent(res,'state',{snap:room.sim.snapshot(),events:[]});
    return;
  }
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  let body;try{body=await readBody(req);}catch(error){return json(res,error.status||400,{error:error.message});}
  if(route==='create'){
    if(rooms.size>=MAX_ROOMS)return json(res,503,{error:'The server is full. Try again shortly.'});
    return json(res,201,seatPlayer(createRoom(),0,body));
  }
  const room=rooms.get(String(body.code||'').toUpperCase().trim());
  if(!room)return json(res,404,{error:'No room with that code. Check the code with your friend.'});
  if(route==='join'){
    const free=room.seats.findIndex(s=>!s);
    if(free<0)return json(res,409,{error:'That room already has two players.'});
    const result=seatPlayer(room,free,body);announce(room);return json(res,200,result);
  }
  const seat=seatOf(room,body.token);
  if(seat<0)return json(res,403,{error:'Not a player in this room'});
  if(route==='input'){
    const record=room.seats[seat];
    room.sim.hold(seat,body.fire===true);
    for(const action of ACTIONS){
      const value=Number.isSafeInteger(body[action])&&body[action]>=0?body[action]:record.counts[action];
      // Cumulative counters survive dropped or reordered requests without replaying presses.
      const presses=Math.min(4,Math.max(0,value-record.counts[action]));
      record.counts[action]=Math.max(record.counts[action],value);
      for(let i=0;i<presses;i++)room.sim.press(seat,action);
    }
    res.writeHead(204,CORS).end();return;
  }
  if(route==='rematch'){
    if(room.sim.phase!=='matchover')return json(res,409,{error:'The match is still running'});
    room.sim.restartMatch();broadcast(room,'state',{snap:room.sim.snapshot(),events:room.sim.drainEvents()});return json(res,200,{ok:true});
  }
  if(route==='leave'){
    const record=room.seats[seat];if(record.stream){try{record.stream.end();}catch{}}
    room.seats[seat]=null;room.started=false;room.sim.restartMatch();room.sim.drainEvents();announce(room);
    if(room.seats.every(s=>!s))closeRoom(room);
    return json(res,200,{ok:true});
  }
  return json(res,404,{error:'Unknown route'});
}

const server=http.createServer((req,res)=>{
  let url;
  try{url=new URL(req.url,'http://localhost');decodeURIComponent(url.pathname);}
  catch{res.writeHead(400).end('Bad request');return;}
  if(url.pathname.startsWith('/api/duel/')&&req.method==='OPTIONS'){res.writeHead(204,CORS).end();return;}
  if(url.pathname.startsWith('/api/duel/')){api(req,res,url).catch(()=>{if(!res.headersSent)json(res,500,{error:'Server error'});});return;}
  const pathname=decodeURIComponent(url.pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  const first=path.relative(root,file).split(path.sep)[0];
  if(!file.startsWith(root+path.sep)||first.startsWith('.')||PRIVATE.has(first)||!TYPES[path.extname(file)]){res.writeHead(404).end('Not found');return;}
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404).end('Not found');return;}
    res.setHeader('Content-Type',TYPES[path.extname(file)]);res.setHeader('Cache-Control','no-cache');res.end(data);
  });
});
if(require.main===module){
  server.listen(PORT,HOST,()=>{
    console.log('Gravity Flip: http://127.0.0.1:'+PORT+'   ·   Gravity Duel: http://127.0.0.1:'+PORT+'/duel.html');
    if(HOST==='0.0.0.0'||HOST==='::'){
      const lan=Object.values(os.networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal).map(a=>a.address);
      for(const ip of lan)console.log('Friends on your Wi-Fi can join at: http://'+ip+':'+PORT+'/duel.html');
    }
  });
}
module.exports={server,rooms,closeRoom};
