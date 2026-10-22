import { getStore } from "@netlify/blobs";

type Player = { id:string; name:string; character:string; ready:boolean; lives:number; x:number; y:number; score:number; joinedAt:number };
type Game = { status:"lobby"|"playing"|"finished"; startedAt:number|null; endsAt:number|null; winner:string|null; knockouts:Record<string,number> };
type Room = { code:string; hostId:string; players:Player[]; game:Game; updatedAt:number };
const chars = new Set(["Sonic","Amy","Rouge","Shadow","Cream"]);
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const code = () => Math.random().toString(36).slice(2,8).toUpperCase();
export default async (req:Request) => {
  if(req.method!=="POST") return json({error:"POST required"},405);
  let input:any; try{input=await req.json()}catch{return json({error:"Invalid JSON"},400)}
  const action=String(input.action||""); const id=String(input.id||"");
  const store=getStore({name:"sonic-battle-rooms",consistency:"strong"});
  try{
    if(action==="create"){
      let room:Room; let key:string;
      for(let i=0;i<5;i++){key=code();if(!(await store.get(key,{type:"json"}))){break}}
      room={code:key!,hostId:id,players:[playerFrom(input)],game:{status:"lobby",startedAt:null,endsAt:null,winner:null,knockouts:{}},updatedAt:Date.now()};
      await store.setJSON(room.code,room);return json({room});
    }
    const roomCode=String(input.room||"").toUpperCase();
    if(!/^[A-Z0-9]{4,8}$/.test(roomCode))return json({error:"Enter a valid room code."},400);
    const room=await store.get(roomCode,{type:"json"}) as Room|null;
    if(!room)return json({error:"Room not found. Check the code and try again."},404);
    if(action==="state"){
      if(room.game.status==="playing" && room.game.endsAt && Date.now()>=room.game.endsAt){finish(room);room.updatedAt=Date.now();await store.setJSON(roomCode,room);}
      return json({room});
    }
    if(action==="join"){
      if(!id)return json({error:"Player ID required."},400);
      if(!room.players.some(p=>p.id===id)){
        if(room.game.status!=="lobby")return json({error:"This match has already started."},409);
        if(room.players.length>=8)return json({error:"This room is full."},409);
        room.players.push(playerFrom(input));
      }
    } else if(action==="ready"){
      const p=room.players.find(p=>p.id===id);if(!p)return json({error:"Join this room first."},403);p.ready=!p.ready;
    } else if(action==="start"){
      if(room.hostId!==id)return json({error:"Only the room host can start the match."},403);
      if(room.players.length<2)return json({error:"At least two players are required."},400);
      room.game={status:"playing",startedAt:Date.now(),endsAt:Date.now()+180000,winner:null,knockouts:Object.fromEntries(room.players.map(p=>[p.id,0]))};
      room.players.forEach((p,i)=>{p.lives=3;p.x=90+i*110;p.y=270;p.score=0});
    } else if(action==="action"){
      if(room.game.status!=="playing")return json({error:"The match is not running."},409);
      const p=room.players.find(p=>p.id===id);if(!p)return json({error:"Player not found."},403);
      const now=Date.now();if(now>=(room.game.endsAt||0)){finish(room);room.updatedAt=Date.now();await store.setJSON(roomCode,room);return json({room});}
      const move=String(input.move||"");const dx=Math.max(-1,Math.min(1,Number(input.dx)||0));const dy=Math.max(-1,Math.min(1,Number(input.dy)||0));
      p.x=Math.max(20,Math.min(940,p.x+dx*12));p.y=Math.max(180,Math.min(390,p.y+dy*9));
      if(move==="attack"||move==="special"){
        const range=move==="special"?150:85;const target=room.players.filter(q=>q.id!==id&&q.lives>0).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
        if(target&&Math.hypot(target.x-p.x,target.y-p.y)<range){target.lives--;target.x=Math.max(20,Math.min(940,target.x+(target.x>=p.x?70:-70)));if(target.lives<=0){room.game.knockouts[id]=(room.game.knockouts[id]||0)+1;p.score++;}}
      }
      const alive=room.players.filter(q=>q.lives>0);if(alive.length<=1)finish(room);
    } else return json({error:"Unknown action."},400);
    room.updatedAt=Date.now();await store.setJSON(roomCode,room);return json({room});
  }catch(e){return json({error:"Room service error: "+(e instanceof Error?e.message:"unknown error")},500)}
};
function playerFrom(input:any):Player {return {id:String(input.id||crypto.randomUUID()),name:String(input.name||"Player").slice(0,18),character:chars.has(input.character)?input.character:"Sonic",ready:false,lives:3,x:100+Math.random()*700,y:270,score:0,joinedAt:Date.now()}}
function finish(room:Room){room.game.status="finished";const alive=room.players.filter(p=>p.lives>0).sort((a,b)=>b.lives-a.lives||(room.game.knockouts[b.id]||0)-(room.game.knockouts[a.id]||0));room.game.winner=alive[0]?.name||"Draw"}
