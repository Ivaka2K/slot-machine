"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mathModel = require("./tools/math-model.js");
const database = require("./database.js");

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const LINES = 20;
const SCATTER = "X";
const BETS = [0.25, 0.5, 1, 2, 5];
const PAYLINES = [[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1],[0,1,1,1,0],[2,1,1,1,2],[1,0,0,0,1],[1,2,2,2,1],[0,1,0,1,0],[2,1,2,1,2],[0,2,0,2,0],[2,0,2,0,2],[0,2,1,2,0],[2,0,1,0,2],[1,1,0,1,1]];
const BASE_REELS = [["A","K","Q","J","T","S","A","K","Q","J","T","A","K","Q","J","T","A","K","Q","J","T","R","A","K","Q","J","T","A","K","Q","W","X"],["K","A","J","Q","T","S","K","A","J","Q","T","K","A","J","Q","T","K","A","J","Q","T","R","K","A","J","Q","T","K","A","Q","W","X"],["Q","K","A","J","T","S","Q","K","A","J","T","Q","K","A","J","T","Q","K","A","J","Q","T","R","Q","K","A","J","T","Q","A","K","R","W","X"],["J","Q","K","A","T","S","J","Q","K","A","T","J","Q","K","A","T","J","Q","K","A","T","R","J","Q","K","A","T","J","K","A","S","W","X"],["T","J","Q","K","A","S","T","J","Q","K","A","T","J","Q","K","A","T","J","Q","K","A","R","T","J","Q","K","A","T","Q","K","W","X"]];
const FREE_REELS = [["A","K","Q","J","T","S","A","K","Q","J","A","K","Q","A","K","R","Q","J","A","K","Q","A","R","K","W","A","W","Q","S","X"],["K","A","J","Q","T","S","K","A","J","K","A","J","Q","R","K","A","J","Q","K","A","R","Q","K","A","W","J","W","S","X"],["Q","K","A","J","T","S","Q","K","A","J","Q","K","R","A","J","Q","K","A","R","Q","J","K","A","W","Q","W","R","S","X"],["J","Q","K","A","T","S","J","Q","K","A","J","R","Q","K","A","J","Q","R","K","A","J","Q","W","K","W","R","S","X"],["T","J","Q","K","A","S","T","J","Q","K","R","A","T","J","Q","K","R","A","T","J","Q","K","W","A","W","R","S","X"]];

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const initialGrid = () => [["A","K","Q"],["J","T","S"],["R","A","W"],["X","K","Q"],["A","J","T"]];
const newState = () => ({balance:20000,lineBet:1,grid:initialGrid(),free:{active:false,left:0,awarded:0,multiplier:1,totalWin:0,played:0}});
const totalStake = state => state.lineBet * LINES;
const windowAt = (reel, stop) => [reel[stop],reel[(stop+1)%reel.length],reel[(stop+2)%reel.length]];
const outcomeFor = reels => {const stops=reels.map(reel=>crypto.randomInt(reel.length));return {stops,grid:reels.map((reel,index)=>windowAt(reel,stops[index]))};};
const count = (grid,symbol) => grid.flat().filter(item=>item===symbol).length;
function calculate(grid,lineBet){const result=mathModel.evaluate(grid);return {...result,payout:result.payout*lineBet};}
function awardFeature(state,scatters){const award=scatters>=5?16:scatters===4?12:8;state.free={active:true,left:award,awarded:award,multiplier:1,totalWin:0,played:0};return {award,scatters};}
function snapshot(state){return {balance:state.balance,lineBet:state.lineBet,grid:state.grid,free:state.free};}
function spin(state){const free=state.free.active; if(!free && state.balance<totalStake(state)) throw new Error("Insufficient demo credits."); const outcome=outcomeFor(free?FREE_REELS:BASE_REELS);const result=calculate(outcome.grid,state.lineBet);const multiplier=free?state.free.multiplier:1;const regularWin=result.payout*multiplier;if(!free)state.balance-=totalStake(state);state.balance+=regularWin;state.grid=outcome.grid;let featureStarted=null,featureEnded=null;if(free){state.free.left-=1;state.free.played+=1;state.free.totalWin+=regularWin;if(result.scatters>=3&&state.free.awarded<30){const added=Math.min(4,30-state.free.awarded);state.free.left+=added;state.free.awarded+=added;result.retrigger=added;}if(result.wilds>0)state.free.multiplier=Math.min(5,state.free.multiplier+1);if(state.free.left===0){featureEnded={totalWin:state.free.totalWin,played:state.free.played};state.free={active:false,left:0,awarded:0,multiplier:1,totalWin:0,played:0};}}else if(result.scatters>=3)featureStarted=awardFeature(state,result.scatters);return {outcome,result,regularWin,mode:free?"free":"base",featureStarted,featureEnded,state:snapshot(state)};}
function buyBonus(state){const cost=totalStake(state)*40;if(state.free.active||state.balance<cost)throw new Error("Insufficient demo credits for Buy Bonus.");const stops=[31,31,33,0,0];const outcome={stops,grid:BASE_REELS.map((reel,index)=>windowAt(reel,stops[index]))};state.balance-=cost;state.grid=outcome.grid;const featureStarted=awardFeature(state,3);return {outcome,cost,featureStarted,state:snapshot(state)};}

function cookies(req){return Object.fromEntries((req.headers.cookie||"").split(";").filter(Boolean).map(part=>part.trim().split("=").map(decodeURIComponent)));}
function safeUser(user){return {id:user.id,username:user.username};}
function authenticatedUser(req){return database.userFromSession(cookies(req).eclipse_vault_sid);}
function createSession(res,user){const token=crypto.randomBytes(32).toString("hex");database.createSession(token,user.id,Date.now()+SESSION_MAX_AGE_SECONDS*1000);res.setHeader("Set-Cookie",`eclipse_vault_sid=${token}; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax; Path=/`);}
function clearSession(req,res){database.deleteSession(cookies(req).eclipse_vault_sid);res.setHeader("Set-Cookie","eclipse_vault_sid=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/");}
function passwordHash(password,salt){return crypto.scryptSync(password,salt,64).toString("hex");}
function send(res,status,payload){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(payload));}
function body(req){return new Promise((resolve,reject)=>{let raw="";req.on("data",chunk=>{raw+=chunk;if(raw.length>10_000)req.destroy();});req.on("end",()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error("Invalid JSON."));}});req.on("error",reject);});}
const TYPES={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".png":"image/png",".wav":"audio/wav",".json":"application/json; charset=utf-8"};
function serveStatic(req,res){const requestPath=req.url.split("?")[0]==="/"?"/index.html":req.url.split("?")[0];const filePath=path.resolve(ROOT,`.${decodeURIComponent(requestPath)}`);if(!filePath.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}fs.readFile(filePath,(error,data)=>{if(error){res.writeHead(error.code==="ENOENT"?404:500).end("Not found");return;}res.writeHead(200,{"Content-Type":TYPES[path.extname(filePath)]||"application/octet-stream"});res.end(data);});}
const server=http.createServer(async(req,res)=>{try{const route=req.url.split("?")[0];
  if(route==="/api/auth/register"&&req.method==="POST"){const {username,password}=await body(req);const name=String(username||"").trim();if(!/^[A-Za-z0-9_]{3,24}$/.test(name))throw new Error("Username must contain 3-24 letters, numbers, or underscores.");if(typeof password!=="string"||password.length<8)throw new Error("Password must contain at least 8 characters.");if(database.findUserByName(name))throw new Error("That username is already registered.");const salt=crypto.randomBytes(16).toString("hex");const user={id:crypto.randomUUID(),username:name,passwordSalt:salt,passwordHash:passwordHash(password,salt),...newState()};database.createUser(user);createSession(res,user);return send(res,201,{user:safeUser(user),state:snapshot(user)});}
  if(route==="/api/auth/login"&&req.method==="POST"){const {username,password}=await body(req);const user=database.findUserByName(String(username||"").trim());if(!user||typeof password!=="string"||!crypto.timingSafeEqual(Buffer.from(passwordHash(password,user.passwordSalt),"hex"),Buffer.from(user.passwordHash,"hex")))throw new Error("Invalid username or password.");createSession(res,user);return send(res,200,{user:safeUser(user),state:snapshot(user)});}
  if(route==="/api/auth/logout"&&req.method==="POST"){clearSession(req,res);return send(res,200,{ok:true});}
  if(route==="/api/auth/me"&&req.method==="GET"){const user=authenticatedUser(req);if(!user)return send(res,401,{error:"Sign in to access your demo wallet."});return send(res,200,{user:safeUser(user),state:snapshot(user)});}
  const state=authenticatedUser(req);if(route.startsWith("/api/game/")&&!state)return send(res,401,{error:"Sign in to access your demo wallet."});
  if(route==="/api/game/state"&&req.method==="GET")return send(res,200,{state:snapshot(state)});
  if(route==="/api/game/spin"&&req.method==="POST"){const response=spin(state);database.saveGameState(state);return send(res,200,response);}
  if(route==="/api/game/buy-bonus"&&req.method==="POST"){const response=buyBonus(state);database.saveGameState(state);return send(res,200,response);}
  if(route==="/api/game/reset"&&req.method==="POST"){Object.assign(state,newState());database.saveGameState(state);return send(res,200,{state:snapshot(state)});}
  if(route==="/api/game/bet"&&req.method==="POST"){const {direction}=await body(req);const index=BETS.indexOf(state.lineBet);if(direction==="up"&&index<BETS.length-1)state.lineBet=BETS[index+1];if(direction==="down"&&index>0)state.lineBet=BETS[index-1];database.saveGameState(state);return send(res,200,{state:snapshot(state)});}
  return serveStatic(req,res);
}catch(error){send(res,400,{error:error.message||"Request failed."});}});
server.listen(PORT,"127.0.0.1",()=>console.log(`Eclipse Vault running at http://127.0.0.1:${PORT}`));
