import './style.css';

const characters = {
  Sonic: { color:'#168cff', tagline:'SPEED • Spin Dash', special:'Spin Dash', speed:1.12, power:1, move:'Fast dash and rapid spin strike' },
  Amy: { color:'#ff6ca8', tagline:'POWER • Hammer time', special:'Piko Piko Smash', speed:.94, power:1.2, move:'Heavy hammer strike with strong knockback' },
  Rouge: { color:'#f3e7ef', tagline:'AGILITY • Aerial expert', special:'Screw Kick', speed:1.08, power:.96, move:'Quick aerial kick and evasive movement' },
  Shadow: { color:'#ed334c', tagline:'CHAOS • Precision', special:'Chaos Control', speed:1.04, power:1.12, move:'Brief burst of speed and powerful strike' },
  Cream: { color:'#ffc86d', tagline:'TECHNIQUE • Teamwork', special:'Cheese Assist', speed:1, power:.92, move:'Cheese rushes forward for a ranged hit' }
};
const state = { screen:'home', room:null, playerId:crypto.randomUUID(), name:'Player', character:'Sonic', players:[], game:null, keys:{}, lastAction:0, polling:null, onlineInput:null, onlineBusy:false, previousOnlineKeys:{}, onlineRaf:0, visualPositions:{}, local:false };
const app = document.querySelector('#app');
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){
  if(state.screen==='home') app.innerHTML = `
    <main class="shell"><header><div class="mark">SB<span>ONLINE</span></div><div class="chip">✦ MULTIPLAYER ARENA</div></header>
    <section class="hero"><div class="eyebrow">READY • FIGHT • REPEAT</div><h1>SONIC BATTLE<br><em>ONLINE ARENA</em></h1><p class="lead">A fast-paced, retro-inspired arena brawler. Pick your fighter, invite your friends, and be the last one standing.</p>
    <div class="menu-card"><label>YOUR FIGHTER</label><div class="fighter-grid">${Object.entries(characters).map(([n,c])=>`<button class="fighter ${state.character===n?'selected':''}" data-char="${n}" style="--fighter:${c.color}"><span class="sprite">${n==='Sonic'?'🦔':n==='Amy'?'🔨':n==='Rouge'?'🦇':n==='Shadow'?'⚡':'🐰'}</span><b>${n}</b><small>${c.tagline}</small></button>`).join('')}</div>
    <label for="playerName">CALLSIGN</label><input id="playerName" maxlength="18" value="${esc(state.name)}" placeholder="Enter your name">
    <div class="actions"><button id="create" class="primary">CREATE ROOM ↗</button><div class="join-row"><input id="roomCode" maxlength="6" placeholder="ROOM CODE"><button id="join" class="secondary">JOIN</button></div></div>
    <button id="practice" class="text-button">TRY LOCAL PRACTICE ↗</button>
    </div><div class="footnote">2–8 PLAYERS · 3 LIVES EACH · LAST FIGHTER STANDING WINS</div></section></main>`;
  if(state.screen==='lobby') app.innerHTML = `<main class="shell"><header><div class="mark">SB<span>ONLINE</span></div><button id="leave" class="secondary">LEAVE ROOM</button></header><section class="lobby"><div class="eyebrow">BATTLE LOBBY</div><h1>ROOM <em>${esc(state.room)}</em></h1><p>Share this code with your friends.</p><button id="copy" class="code">${esc(state.room)}　⧉</button><div class="roster"><div class="roster-head">FIGHTERS <span>${state.players.length}/8</span></div>${state.players.map(p=>`<div class="player-row"><span class="mini-sprite">${p.character==='Sonic'?'🦔':p.character==='Amy'?'🔨':p.character==='Rouge'?'🦇':p.character==='Shadow'?'⚡':'🐰'}</span><div><b>${esc(p.name)}</b><small>${esc(p.character)}${p.id===state.playerId?' · YOU':''}</small></div><span class="ready">${p.ready?'READY':'CONNECTED'}</span></div>`).join('')}</div><button id="ready" class="primary wide">${state.players.find(p=>p.id===state.playerId)?.ready?'CANCEL READY':'I’M READY'}</button><button id="start" class="secondary wide" ${state.players.length<2?'disabled':''}>START BATTLE (2+ PLAYERS)</button><p class="hint">The host starts when at least two fighters are ready. In this prototype, the room host is the first player to create it.</p></section></main>`;
  if(state.screen==='game') renderGame();
  if(state.screen==='result') app.innerHTML=`<main class="shell result"><div class="eyebrow">MATCH COMPLETE</div><h1>${state.winner==='DRAW'?'DRAW': 'VICTORY'}<br><em>${esc(state.winner||'FIGHTER')}</em></h1><p>Battle again with the same crew or return to the menu.</p><button id="again" class="primary">RETURN TO MENU</button></main>`;
  bind();
}
function bind(){
  document.querySelectorAll('[data-char]').forEach(b=>b.onclick=()=>{state.character=b.dataset.char;render()});
  const name=document.querySelector('#playerName'); if(name) name.onchange=()=>state.name=name.value.trim()||'Player';
  const create=document.querySelector('#create'); if(create) create.onclick=async()=>{state.name=name.value.trim()||'Player';await api('create',{id:state.playerId,name:state.name,character:state.character});};
  const join=document.querySelector('#join'); if(join) join.onclick=async()=>{state.name=name.value.trim()||'Player';await api('join',{room:document.querySelector('#roomCode').value.trim().toUpperCase(),id:state.playerId,name:state.name,character:state.character});};
  const leave=document.querySelector('#leave'); if(leave) leave.onclick=()=>{clearInterval(state.polling);clearInterval(state.onlineInput);state.onlineInput=null;stopOnlineRender();state.screen='home';render()};
  const copy=document.querySelector('#copy'); if(copy) copy.onclick=()=>navigator.clipboard?.writeText(state.room);
  const ready=document.querySelector('#ready'); if(ready) ready.onclick=async()=>api('ready',{room:state.room,id:state.playerId});
  const start=document.querySelector('#start'); if(start) start.onclick=async()=>api('start',{room:state.room,id:state.playerId});
  const practice=document.querySelector('#practice'); if(practice) practice.onclick=()=>startPractice();
  const again=document.querySelector('#again'); if(again) again.onclick=()=>{state.local=false;cancelAnimationFrame(raf);clearInterval(state.polling);clearInterval(state.onlineInput);state.onlineInput=null;stopOnlineRender();state.screen='home';render()};
}
async function api(action,data={}){
  try{
    const r=await fetch('/.netlify/functions/game',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...data})});
    const out=await r.json(); if(!r.ok) throw new Error(out.error||'Network error');
    if(out.room){state.room=out.room.code;state.players=out.room.players||[];state.game=out.room.game||null; if(state.game?.status==='playing')state.screen='game';else if(state.game?.status==='finished'){state.winner=state.game.winner;state.screen='result'}else state.screen='lobby';}
    if(action==='create'||action==='join'){clearInterval(state.polling);state.polling=setInterval(()=>api('state',{room:state.room,id:state.playerId}),700);}
    if(!state.local && state.screen==='game') { startOnlineInput(); startOnlineRender(); }
    if(action==='state' && state.screen==='game') {
      // A player may transition from lobby to game via polling. Mount the game UI once.
      if(!document.querySelector('#arena')) renderGame();
      updateOnlineTimer(); drawArena(); startOnlineRender(); return;
    }
    if(action==='action' && state.screen==='game') { updateOnlineTimer(); drawArena(); startOnlineRender(); return; }
    if(state.screen==='result'){clearInterval(state.polling);clearInterval(state.onlineInput);state.onlineInput=null;stopOnlineRender();}
    render();
  }catch(e){toast(e.message+' — use Practice Mode to test locally, or deploy the Netlify project for online rooms.')}
}
function startOnlineRender(){
  if(state.local || state.onlineRaf || state.screen!=='game') return;
  const frame=()=>{
    state.onlineRaf=0;
    if(state.local || state.screen!=='game') return;
    updateOnlineTimer(); drawArena();
    state.onlineRaf=requestAnimationFrame(frame);
  };
  state.onlineRaf=requestAnimationFrame(frame);
}
function stopOnlineRender(){if(state.onlineRaf)cancelAnimationFrame(state.onlineRaf);state.onlineRaf=0;state.visualPositions={};}
function startOnlineInput(){
  if(state.local || state.onlineInput) return;
  state.previousOnlineKeys={};
  state.onlineInput=setInterval(async()=>{
    if(state.local || state.screen!=='game' || !state.room || state.onlineBusy) return;
    const k=state.keys, dx=(k.d||k.D||k.ArrowRight?1:0)-(k.a||k.A||k.ArrowLeft?1:0);
    const dy=(k.s||k.S||k.ArrowDown?1:0)-(k.w||k.W||k.ArrowUp?1:0);
    const attack=(k.j||k.J)&&!state.previousOnlineKeys.attack;
    const special=(k.k||k.K)&&!state.previousOnlineKeys.special;
    state.previousOnlineKeys={attack:!!(k.j||k.J),special:!!(k.k||k.K)};
    if(dx===0 && dy===0 && !attack && !special) return;
    state.onlineBusy=true;
    try{await api('action',{room:state.room,id:state.playerId,dx,dy,move:attack?'attack':special?'special':''});}
    finally{state.onlineBusy=false;}
  },100);
}
function updateOnlineTimer(){
  const timer=document.querySelector('#timer');
  if(!timer || !state.game) return;
  const end=state.game.endsAt;
  if(end){const seconds=Math.max(0,Math.ceil((end-Date.now())/1000));timer.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
}
function startPractice(){
  state.local=true;state.room='LOCAL';state.screen='game';
  state.players=[{id:state.playerId,name:state.name,character:state.character,lives:3,x:120,y:270,vx:0,vy:0,ready:true,score:0},{id:'cpu1',name:'Training Bot',character:'Shadow',lives:3,x:650,y:270,vx:0,vy:0,ready:true,score:0}];
  state.game={status:'playing',seconds:180,startedAt:Date.now(),winner:null};state.dodgeReady=true;state.dodgeUntil=0;render();beginLocal();
}
let raf=0,last=0;
function beginLocal(){cancelAnimationFrame(raf);last=performance.now();const tick=now=>{const dt=Math.min((now-last)/16.67,2);last=now;if(state.screen!=='game'||!state.local)return;stepLocal(dt);drawArena();raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick)}
function renderGame(){app.innerHTML=`<main class="arena-page"><header class="arena-top"><div class="mark">SB<span>ONLINE</span></div><div class="timer" id="timer">03:00</div><div class="chip">ROOM ${esc(state.room||'LOCAL')}</div></header><div class="hud" id="hud"></div><canvas id="arena" width="960" height="540" aria-label="Battle arena"></canvas><div class="controls-help"><span>MOVE <b>WASD / ARROWS</b></span><span>JUMP <b>SPACE</b></span><span>ATTACK <b>J</b></span><span>SPECIAL <b>K</b></span><span>DODGE <b>SHIFT</b></span></div><div class="touch-controls"><div class="dpad"><button data-key="ArrowLeft">◀</button><button data-key="ArrowUp">▲</button><button data-key="ArrowDown">▼</button><button data-key="ArrowRight">▶</button></div><div class="touch-actions"><button data-key="Space">JUMP</button><button data-key="j">ATK</button><button data-key="k">SPECIAL</button><button data-key="Shift">DODGE</button></div></div><div class="game-footer"><span id="status">FIGHT!</span><button id="exitGame" class="secondary">EXIT MATCH</button></div></main>`;bindGame();drawArena()}
function bindGame(){document.querySelector('#exitGame').onclick=()=>{state.local=false;cancelAnimationFrame(raf);clearInterval(state.polling);clearInterval(state.onlineInput);state.onlineInput=null;stopOnlineRender();state.screen='home';render()};document.querySelectorAll('[data-key]').forEach(b=>{const k=b.dataset.key;b.onpointerdown=e=>{e.preventDefault();state.keys[k]=true};b.onpointerup=b.onpointerleave=()=>state.keys[k]=false});}
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();state.keys[e.key===' '?'Space':e.key]=true;state.keys[e.key.toLowerCase()]=true});
window.addEventListener('keyup',e=>{state.keys[e.key===' '?'Space':e.key]=false;state.keys[e.key.toLowerCase()]=false});
function stepLocal(dt){
  const p=state.players[0],bot=state.players[1],k=state.keys,c=characters[p.character];
  if(k.a||k.ArrowLeft)p.vx-=.65*c.speed*dt;if(k.d||k.ArrowRight)p.vx+=.65*c.speed*dt;
  p.vx*=Math.pow(.82,dt);p.x+=p.vx*dt*3;p.x=Math.max(35,Math.min(925,p.x));
  if((k.Space||k.w||k.ArrowUp)&&p.y>=270)p.vy=-10;
  // Shift dodge: a quick directional burst with a short cooldown and visible invulnerability window.
  if(k.shift && state.dodgeReady){state.dodgeReady=false;state.dodgeUntil=Date.now()+260;p.vx+=(p.vx<0?-1:p.vx>0?1:(k.a||k.ArrowLeft?-1:1))*13*c.speed;}
  if(!k.shift)state.dodgeReady=true;
  if(Date.now()<state.dodgeUntil){p.x=Math.max(35,Math.min(925,p.x));}
  p.vy+=.45*dt;p.y+=p.vy*dt;if(p.y>270){p.y=270;p.vy=0}
  if((k.j||k.J)&&Date.now()-state.lastAction>400){state.lastAction=Date.now();if(Math.abs(p.x-bot.x)<125 && Date.now()>=state.dodgeUntil){bot.lives--;bot.x=p.x<bot.x?Math.min(925,bot.x+75):Math.max(35,bot.x-75);if(bot.lives<=0){state.game.winner=p.name;state.game.status='finished';state.screen='result';render()}}}
  if((k.k||k.K)&&Date.now()-state.lastAction>500){state.lastAction=Date.now();p.vx+=(p.x<bot.x?1:-1)*10*c.speed;if(Math.abs(p.x-bot.x)<190){bot.lives--;if(bot.lives<=0){state.game.winner=p.name;state.game.status='finished';state.screen='result';render()}}}
  bot.vx+=(p.x>bot.x?-.15:.15);bot.x+=bot.vx*dt;bot.x=Math.max(35,Math.min(925,bot.x));bot.vx*=.9;
  state.game.seconds=Math.max(0,180-(Date.now()-state.game.startedAt)/1000);
  if(state.game.seconds<=0){
    state.game.status='finished';
    if(p.lives>bot.lives)state.game.winner=p.name;else if(bot.lives>p.lives)state.game.winner=bot.name;else state.game.winner='DRAW';
    state.screen='result';cancelAnimationFrame(raf);render();return;
  }
  const m=Math.floor(state.game.seconds/60),s=Math.floor(state.game.seconds%60);const t=document.querySelector('#timer');if(t)t.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function drawArena(){
  const canvas=document.querySelector('#arena');if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#142c60');g.addColorStop(.6,'#3159a0');g.addColorStop(1,'#121a39');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#203c78';for(let i=0;i<14;i++){const x=i*78;ctx.fillRect(x,130+(i%3)*25,35,250);ctx.fillStyle='#31539a';ctx.fillRect(x+8,145+(i%3)*25,6,220);ctx.fillStyle='#203c78'}
  for(let i=0;i<20;i++){ctx.fillStyle=i%2?'#ffce4e':'#64e8cf';ctx.fillRect(i*50,410,25,8)}
  ctx.fillStyle='#10182e';ctx.fillRect(0,430,w,110);ctx.fillStyle='#3e6eaa';ctx.fillRect(0,420,w,12);ctx.fillStyle='#70e8d2';ctx.fillRect(0,420,w,3);
  const ps=state.players||[];const emojis={Sonic:'🦔',Amy:'🔨',Rouge:'🦇',Shadow:'⚡',Cream:'🐰'};
  ps.forEach((p,i)=>{
    const targetX=p.x??(120+i*120),targetY=p.y??270;
    let x=targetX,y=targetY;
    if(!state.local){const v=state.visualPositions[p.id]||(state.visualPositions[p.id]={x:targetX,y:targetY});v.x+=(targetX-v.x)*.24;v.y+=(targetY-v.y)*.24;x=v.x;y=v.y;}
    ctx.save();ctx.translate(x,y);ctx.fillStyle=characters[p.character]?.color||'#fff';ctx.fillRect(-18,-38,36,38);ctx.fillStyle='#10182e';ctx.fillRect(-14,-31,9,6);ctx.fillRect(5,-31,9,6);ctx.fillStyle='#fff';ctx.fillRect(-12,-30,4,3);ctx.fillRect(7,-30,4,3);ctx.fillStyle='#d5eaff';ctx.fillRect(-23,-5,46,6);ctx.fillStyle='#ffe06a';ctx.fillRect(-23,-5,46*Math.max(0,p.lives/3),6);ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText(p.name||p.character,0,-49);ctx.restore()});
  const hud=document.querySelector('#hud');if(hud)hud.innerHTML=ps.map(p=>`<div class="hud-card"><b>${esc(p.character)}</b><span>${'♥ '.repeat(Math.max(0,p.lives??3))}</span><small>${esc(p.name)}</small></div>`).join('');
}
function toast(msg){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.append(t)}t.textContent=msg;setTimeout(()=>t.remove(),4000)}
render();
