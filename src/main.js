import './style.css';

const characters = {
  Sonic: { color:'#168cff', tagline:'SPEED • Spin Dash', special:'Spin Dash', speed:1.12, power:1, move:'Fast dash and rapid spin strike' },
  Amy: { color:'#ff6ca8', tagline:'POWER • Hammer time', special:'Piko Piko Smash', speed:.94, power:1.2, move:'Heavy hammer strike with strong knockback' },
  Rouge: { color:'#f3e7ef', tagline:'AGILITY • Aerial expert', special:'Screw Kick', speed:1.08, power:.96, move:'Quick aerial kick and evasive movement' },
  Shadow: { color:'#ed334c', tagline:'CHAOS • Precision', special:'Chaos Control', speed:1.04, power:1.12, move:'Brief burst of speed and powerful strike' },
  Cream: { color:'#ffc86d', tagline:'TECHNIQUE • Teamwork', special:'Cheese Assist', speed:1, power:.92, move:'Cheese rushes forward for a ranged hit' }
};
const state = { screen:'home', room:null, playerId:crypto.randomUUID(), name:'Player', character:'Sonic', players:[], game:null, keys:{}, lastAction:0, polling:null, onlineInput:null, onlineBusy:false, previousOnlineKeys:{}, onlineRaf:0, visualPositions:{}, local:false, lastFacingX:1, lastFacingY:0 };
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
    const dodge=(k.shift||k.Shift)&&!state.previousOnlineKeys.dodge;
    state.previousOnlineKeys={attack:!!(k.j||k.J),special:!!(k.k||k.K),dodge:!!(k.shift||k.Shift)};
    if(dx!==0)state.lastFacingX=dx;if(dy!==0)state.lastFacingY=dy;
    if(dx===0 && dy===0 && !attack && !special && !dodge) return;
    state.onlineBusy=true;
    const move=dodge?'dodge':attack?'attack':special?'special':'';
    try{await api('action',{room:state.room,id:state.playerId,dx,dy,move,dodgeDx:dx||state.lastFacingX,dodgeDy:dy||state.lastFacingY});}
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
function renderGame(){app.innerHTML=`<main class="arena-page"><header class="arena-top"><div class="mark">SB<span>ONLINE</span></div><div class="timer" id="timer">03:00</div><div class="chip">ROOM ${esc(state.room||'LOCAL')}</div></header><div class="hud" id="hud"></div><canvas id="arena" width="960" height="540" aria-label="Battle arena"></canvas><div class="arena-logo"><img src="/art/sonic-battle-logo.png" alt="Sonic Battle Online Arena"><span>♡ 夢と友情のバトル ♡</span></div><div class="controls-help"><span>MOVE <b>WASD / ARROWS</b></span><span>JUMP <b>SPACE</b></span><span>ATTACK <b>J</b></span><span>SPECIAL <b>K</b></span><span>DODGE <b>SHIFT</b></span></div><div class="touch-controls"><div class="dpad"><button data-key="ArrowLeft">◀</button><button data-key="ArrowUp">▲</button><button data-key="ArrowDown">▼</button><button data-key="ArrowRight">▶</button></div><div class="touch-actions"><button data-key="Space">JUMP</button><button data-key="j">ATK</button><button data-key="k">SPECIAL</button><button data-key="Shift">DODGE</button></div></div><div class="game-footer"><span id="status">FIGHT!</span><button id="exitGame" class="secondary">EXIT MATCH</button></div></main>`;bindGame();drawArena()}
function bindGame(){document.querySelector('#exitGame').onclick=()=>{state.local=false;cancelAnimationFrame(raf);clearInterval(state.polling);clearInterval(state.onlineInput);state.onlineInput=null;stopOnlineRender();state.screen='home';render()};document.querySelectorAll('[data-key]').forEach(b=>{const k=b.dataset.key;const setPressed=value=>{state.keys[k]=value;state.keys[k.toLowerCase()]=value};b.onpointerdown=e=>{e.preventDefault();setPressed(true)};b.onpointerup=b.onpointerleave=b.onpointercancel=()=>setPressed(false)});}
function clearPressedKeys(){for(const key of Object.keys(state.keys))state.keys[key]=false;}
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();state.keys[e.key===' '?'Space':e.key]=true;state.keys[e.key.toLowerCase()]=true});
window.addEventListener('keyup',e=>{state.keys[e.key===' '?'Space':e.key]=false;state.keys[e.key.toLowerCase()]=false});
window.addEventListener('blur',clearPressedKeys);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPressedKeys()});window.addEventListener('pointerup',()=>{for(const k of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','Shift','shift','j','k']){state.keys[k]=false;state.keys[k.toLowerCase()]=false}});
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
function drawPixelFighter(ctx, character, x, y, facing=1, lives=3){
  // Small hand-drawn pixel sprites, built from crisp block shapes so they scale cleanly.
  const px=3; const put=(color, rows, ox=-24, oy=-54)=>{ctx.fillStyle=color;rows.forEach((row,ry)=>{for(let rx=0;rx<row.length;rx++)if(row[rx]!==' ')ctx.fillRect(ox+rx*px,oy+ry*px,px,px);});};
  ctx.save();ctx.translate(x,y);ctx.scale(facing<0?-1:1,1);
  // shadow
  ctx.fillStyle='rgba(85,36,79,.25)';ctx.beginPath();ctx.ellipse(0,0,26,7,0,0,Math.PI*2);ctx.fill();
  if(character==='Sonic'||character==='Shadow'){
    const fur=character==='Sonic'?'#0876e8':'#24253c', accent=character==='Sonic'?'#38b9ff':'#e52b4e';
    put(fur,['      ###','    ######','  ########',' ##########','###########',' ######  ##','  ###### ##','   ####### ','    #####  ','     ###   ']);
    put('#ffe5bc',['       ##','      ###','      ###','       ##']);
    put('#fff',['      ##','      ##','       #']);put('#101020',['       #','       #']);
    put('#fff',['   ##','  ###','   ##'], -15,-30);
    put(accent,['   ##','  ####',' ######','  ####'], -12,-6);
    put('#fff',['##  ##','##  ##'], -21,0);put('#e92f42',['######',' #####'], -24,6);put('#fff',['  ##','  ##'], 0,0);
  }else if(character==='Amy'){
    put('#f34b9b',['      ##','    #####','  ########',' ##########',' ######### ','  #######  ','   #####   ']);
    put('#ff8fc7',['    ##','   ####','  ######'], -18,-42);
    put('#ffe2b8',['      ###','     ####','     ####','      ###']);put('#fff',['      ##','      ##']);put('#168b52',['       #'], -3,-31);
    put('#f8f1f8',['  ##  ##','  ##  ##'], -21,0);put('#f2f2f8',[' ##',' ##'], 9,-9);
    put('#d92c54',['######',' #####'], -24,6);put('#fff',['  ##','  ##'], 0,0);
  }else if(character==='Rouge'){
    put('#fff0f6',['      ##','    ######','  ########',' ##########',' ######### ','  #######  ']);
    put('#f5c7df',['    ##','   ####','  ######'], -18,-42);
    put('#ffe2bf',['      ###','     ####','     ####','      ###']);put('#fff',['      ##','      ##']);put('#75b8ff',['       #'], -3,-31);
    put('#fff',['  ##  ##','  ##  ##'], -21,0);put('#d84b92',['######',' #####'], -24,6);
  }else{
    put('#fff0d7',['      ##','    ######','  ########',' ##########',' ######### ','  #######  ']);
    put('#f5dfad',['    ##','   ####','  ######'], -18,-42);
    put('#ffe2bf',['      ###','     ####','     ####','      ###']);put('#fff',['      ##','      ##']);put('#73a9ed',['       #'], -3,-31);
    put('#fff',['  ##  ##','  ##  ##'], -21,0);put('#e84c67',['######',' #####'], -24,6);
  }
  // Character name plate and life pips.
  ctx.fillStyle='#fff';ctx.strokeStyle='#55264b';ctx.lineWidth=3;ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.strokeText(character,x===-999?0:0,-66);ctx.fillText(character,0,-66);
  for(let i=0;i<Math.max(0,lives);i++){ctx.fillStyle='#ff4f9e';ctx.font='16px serif';ctx.fillText('♥',(i-(Math.max(0,lives)-1)/2)*16,-77);}
  ctx.restore();
}
function drawArena(){
  const canvas=document.querySelector('#arena');if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  // Amy's-room-inspired pixel bedroom stage.
  ctx.imageSmoothingEnabled=false;
  const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#ffcce7');sky.addColorStop(.62,'#ffe5f3');sky.addColorStop(1,'#ffb9dc');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#f7a8d0';ctx.fillRect(0,55,w,340);ctx.fillStyle='#ffdbef';ctx.fillRect(12,65,w-24,325);
  // window + city
  ctx.fillStyle='#ff91c6';ctx.fillRect(315,85,330,245);ctx.fillStyle='#9bd5ff';ctx.fillRect(326,96,308,222);
  for(let i=0;i<10;i++){const bx=334+i*31, bh=35+(i*19)%100;ctx.fillStyle=i%2?'#9b9ce8':'#b6a8ef';ctx.fillRect(bx,318-bh,23,bh);for(let wy=326-bh;wy<314;wy+=16){ctx.fillStyle='#fff0b9';ctx.fillRect(bx+6,wy,4,5);ctx.fillRect(bx+14,wy,4,5);}}
  ctx.fillStyle='#fff';ctx.fillRect(473,95,5,225);ctx.fillRect(326,205,308,5);
  // curtains
  ctx.fillStyle='#ffacd6';ctx.fillRect(298,88,32,244);ctx.fillRect(634,88,32,244);ctx.fillStyle='#ff7dbb';for(let y=96;y<326;y+=24){ctx.fillRect(300,y,28,8);ctx.fillRect(636,y,28,8);}
  // bookshelf
  ctx.fillStyle='#dc6da8';ctx.fillRect(28,145,112,238);ctx.fillStyle='#ffb6d8';ctx.fillRect(36,154,96,220);for(let y=185;y<360;y+=56){ctx.fillStyle='#b55c98';ctx.fillRect(36,y,96,5);for(let i=0;i<5;i++){ctx.fillStyle=['#f9d45f','#8dd8e7','#c3a4ef','#ff7cae'][i%4];ctx.fillRect(43+i*16,y-25,10,24);}}
  // dresser and heart motifs
  ctx.fillStyle='#e98ab9';ctx.fillRect(150,238,116,144);ctx.fillStyle='#ffc9e4';for(let y=251;y<363;y+=35){ctx.fillRect(160,y,96,27);ctx.fillStyle='#d66a9f';ctx.fillRect(203,y+12,12,3);ctx.fillStyle='#ffc9e4';}
  // bed, pillows, headboard
  ctx.fillStyle='#d66da8';ctx.fillRect(350,265,325,106);ctx.fillStyle='#ffb5d9';ctx.fillRect(361,274,304,86);ctx.fillStyle='#fff0f8';ctx.fillRect(380,282,268,72);
  for(let i=0;i<4;i++){ctx.fillStyle=i%2?'#ffc4e1':'#ff9fd0';ctx.beginPath();ctx.roundRect(515+i*31,260,35,34,8);ctx.fill();ctx.fillStyle='#ff65aa';ctx.font='20px serif';ctx.fillText('♥',524+i*31,283);}
  // vanity / mirror and decor
  ctx.fillStyle='#d975ac';ctx.fillRect(735,235,120,148);ctx.fillStyle='#ffc8e3';ctx.fillRect(746,247,98,125);ctx.fillStyle='#fff0f9';ctx.beginPath();ctx.ellipse(795,198,39,48,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d77aad';ctx.lineWidth=7;ctx.stroke();ctx.fillStyle='#a6d9ff';ctx.beginPath();ctx.ellipse(795,198,29,38,0,0,Math.PI*2);ctx.fill();
  // framed pictures
  [[180,104],[704,102],[840,105]].forEach(([x,y],i)=>{ctx.fillStyle='#d477aa';ctx.fillRect(x,y,55,72);ctx.fillStyle='#fff1f8';ctx.fillRect(x+5,y+5,45,62);ctx.fillStyle=i===1?'#ff79b8':'#ffd96b';ctx.font='28px serif';ctx.fillText(i===1?'♡':'✦',x+14,y+43);});
  // floor
  ctx.fillStyle='#ffc4e1';ctx.fillRect(0,382,w,158);ctx.fillStyle='#ffb2d8';for(let x=0;x<w;x+=80){ctx.fillRect(x,382,2,158);}for(let y=405;y<h;y+=35){ctx.fillRect(0,y,w,2);}
  // heart rug
  ctx.fillStyle='#f77fba';ctx.beginPath();ctx.ellipse(480,447,170,40,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffb9dc';ctx.beginPath();ctx.ellipse(480,442,145,29,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff80b9';ctx.font='bold 48px serif';ctx.textAlign='center';ctx.fillText('♡',480,457);
  // magazine sparkles at the edges, keeping the fight area clear.
  for(let i=0;i<24;i++){const x=(i*137+27)%w,y=12+((i*67)%350);if(x>250&&x<700&&y>60&&y<360)continue;ctx.fillStyle=i%2?'#fff':'#ff65b1';ctx.font=`${12+(i%3)*4}px serif`;ctx.fillText(i%3===0?'✦':i%3===1?'♡':'★',x,y);}
  // gold-trimmed platform
  ctx.fillStyle='#a84780';ctx.fillRect(0,478,w,10);ctx.fillStyle='#ffe66d';ctx.fillRect(0,478,w,4);ctx.fillStyle='#fff0f8';ctx.fillRect(0,488,w,52);for(let x=0;x<w;x+=48){ctx.fillStyle=x%96?'#f8b0d4':'#fff0f8';ctx.fillRect(x,492,24,8);}
  const ps=state.players||[];
  ps.forEach((p,i)=>{const targetX=p.x??(120+i*120),targetY=(p.y??270)+150;let x=targetX,y=targetY;if(!state.local){const v=state.visualPositions[p.id]||(state.visualPositions[p.id]={x:targetX,y:targetY});v.x+=(targetX-v.x)*.24;v.y+=(targetY-v.y)*.24;x=v.x;y=v.y;}drawPixelFighter(ctx,p.character,x,y,(i===0?1:-1),p.lives??3);});
  const hud=document.querySelector('#hud');if(hud)hud.innerHTML=ps.map(p=>`<div class="hud-card"><b>${esc(p.character)}</b><span>${'♥ '.repeat(Math.max(0,p.lives??3))}</span><small>${esc(p.name)}</small></div>`).join('');
}
function toast(msg){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.append(t)}t.textContent=msg;setTimeout(()=>t.remove(),4000)}
render();
