"use strict";

/*
  Reproducible maths model for the Eclipse Vault demo.
  Example: npm run math -- --spins 1000000 --seed 20261106
*/

const LINES = 20;
const LINE_BET = 1;
const TOTAL_STAKE = LINES * LINE_BET;
const SCATTER = "X";
const WILD = "W";
const MAX_AWARDED_FREE_SPINS = 30;
const MAX_MULTIPLIER = 5;
const PAYLINES = [[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1],[0,1,1,1,0],[2,1,1,1,2],[1,0,0,0,1],[1,2,2,2,1],[0,1,0,1,0],[2,1,2,1,2],[0,2,0,2,0],[2,0,2,0,2],[0,2,1,2,0],[2,0,1,0,2],[1,1,0,1,1]];
// Payouts are credits per active payline for 3, 4, or 5 matching symbols.
// A line may contain its named symbol and Wilds only; different named symbols never combine.
const PAYTABLE = {T:[5.2,10.4,26],J:[7.8,15.6,39],Q:[10.4,20.8,52],K:[13,26,65],A:[15.6,31.2,78],S:[26,52,156],R:[78,208,624],W:[156,780,3900]};
const BASE_REELS = [["A","K","Q","J","T","S","A","K","Q","J","T","A","K","Q","J","T","A","K","Q","J","T","R","A","K","Q","J","T","A","K","Q","W","X"],["K","A","J","Q","T","S","K","A","J","Q","T","K","A","J","Q","T","K","A","J","Q","T","R","K","A","J","Q","T","K","A","Q","W","X"],["Q","K","A","J","T","S","Q","K","A","J","T","Q","K","A","J","T","Q","K","A","J","Q","T","R","Q","K","A","J","T","Q","A","K","R","W","X"],["J","Q","K","A","T","S","J","Q","K","A","T","J","Q","K","A","T","J","Q","K","A","T","R","J","Q","K","A","T","J","K","A","S","W","X"],["T","J","Q","K","A","S","T","J","Q","K","A","T","J","Q","K","A","T","J","Q","K","A","R","T","J","Q","K","A","T","Q","K","W","X"]];
const FREE_REELS = [["A","K","Q","J","T","S","A","K","Q","J","A","K","Q","A","K","R","Q","J","A","K","Q","A","R","K","W","A","W","Q","S","X"],["K","A","J","Q","T","S","K","A","J","K","A","J","Q","R","K","A","J","Q","K","A","R","Q","K","A","W","J","W","S","X"],["Q","K","A","J","T","S","Q","K","A","J","Q","K","R","A","J","Q","K","A","R","Q","J","K","A","W","Q","W","R","S","X"],["J","Q","K","A","T","S","J","Q","K","A","J","R","Q","K","A","J","Q","R","K","A","J","Q","W","K","W","R","S","X"],["T","J","Q","K","A","S","T","J","Q","K","R","A","T","J","Q","K","R","A","T","J","Q","K","W","A","W","R","S","X"]];

function options(){const values=process.argv.slice(2);const read=(name,fallback)=>{const equals=values.find(item=>item.startsWith(`--${name}=`));if(equals)return equals.slice(name.length+3);const index=values.indexOf(`--${name}`);return index>=0&&values[index+1]?values[index+1]:fallback;};return {spins:Math.max(1,Number(read("spins","200000"))),seed:Number(read("seed","20261106"))>>>0};}
function rng(seed){let value=seed||1;return ()=>{value|=0;value=value+0x6D2B79F5|0;let result=Math.imul(value^value>>>15,1|value);result=result+Math.imul(result^result>>>7,61|result)^result;return ((result^result>>>14)>>>0)/4294967296;};}
function windowAt(reel,stop){return [reel[stop],reel[(stop+1)%reel.length],reel[(stop+2)%reel.length]];}
function randomGrid(reels,random){return reels.map(reel=>windowAt(reel,Math.floor(random()*reel.length)));}
function symbolMatches(symbol,candidate){return candidate===symbol||candidate===WILD;}
function lineResult(symbols){let best={award:0,symbol:null,length:0};for(const symbol of Object.keys(PAYTABLE)){for(const length of [5,4,3]){if(symbols.slice(0,length).every(candidate=>symbolMatches(symbol,candidate))){const award=PAYTABLE[symbol][length-3];if(award>best.award)best={award,symbol,length};break;}}}return best;}
function linePayout(symbols){return lineResult(symbols).award;}
function evaluate(grid){let payout=0;const wins=[];PAYLINES.forEach((line,index)=>{const result=lineResult(line.map((row,reel)=>grid[reel][row]));if(result.award){payout+=result.award;wins.push({index:index+1,line,result});}});const all=grid.flat();return {payout,wins,scatters:all.filter(symbol=>symbol===SCATTER).length,wilds:all.filter(symbol=>symbol===WILD).length};}
function symbolCounts(reel){return reel.reduce((counts,symbol)=>{counts[symbol]=(counts[symbol]||0)+1;return counts;},{});}
function exactOneLineReturn(reels){const counts=reels.map(symbolCounts);let expected=0;function visit(index,symbols,probability){if(index===counts.length){expected+=linePayout(symbols)*probability;return;}for(const [symbol,count] of Object.entries(counts[index]))visit(index+1,[...symbols,symbol],probability*count/reels[index].length);}visit(0,[],1);return expected;}
function scatterDistribution(reels){let distribution=[1];for(const reel of reels){const hitStops=reel.reduce((total,_,stop)=>total+(windowAt(reel,stop).includes(SCATTER)?1:0),0);const hit=hitStops/reel.length,next=Array(distribution.length+1).fill(0);distribution.forEach((probability,count)=>{next[count]+=probability*(1-hit);next[count+1]+=probability*hit;});distribution=next;}return distribution;}
function freeAward(scatters){return scatters>=5?16:scatters===4?12:8;}
function simulateRound(random){let payout=0,featurePaid=0,triggered=false;const base=evaluate(randomGrid(BASE_REELS,random));payout+=base.payout;if(base.scatters<3)return {payout,featurePaid,triggered};triggered=true;let left=freeAward(base.scatters),awarded=left,multiplier=1;while(left>0){const result=evaluate(randomGrid(FREE_REELS,random));const win=result.payout*multiplier;payout+=win;featurePaid+=win;left-=1;if(result.scatters>=3&&awarded<MAX_AWARDED_FREE_SPINS){const added=Math.min(4,MAX_AWARDED_FREE_SPINS-awarded);left+=added;awarded+=added;}if(result.wilds>0)multiplier=Math.min(MAX_MULTIPLIER,multiplier+1);}return {payout,featurePaid,triggered};}
function formatPercent(value){return `${(value*100).toFixed(4)}%`;}
function main(){const {spins,seed}=options();const exactLine=exactOneLineReturn(BASE_REELS);const scatter=scatterDistribution(BASE_REELS);const random=rng(seed);let payout=0,featurePayout=0,triggers=0;for(let spin=0;spin<spins;spin++){const round=simulateRound(random);payout+=round.payout;featurePayout+=round.featurePaid;if(round.triggered)triggers+=1;}console.log("ECLIPSE VAULT MATH MODEL");console.log(`Seed: ${seed} | Simulated base spins: ${spins.toLocaleString("en-US")}`);console.log("");console.log("Exact base-game values from the reel strips:");console.log(`  Regular line RTP: ${formatPercent(exactLine / LINE_BET)}`);console.log(`  Regular 20-line RTP: ${formatPercent((exactLine * LINES) / TOTAL_STAKE)}`);console.log(`  Scatter trigger chance (3+): ${formatPercent(scatter.slice(3).reduce((sum,value)=>sum+value,0))}`);console.log(`  3 / 4 / 5 Scatter chances: ${formatPercent(scatter[3])} / ${formatPercent(scatter[4])} / ${formatPercent(scatter[5])}`);console.log("");console.log("Seeded Monte Carlo estimate, including Free Spins:");console.log(`  Total RTP: ${formatPercent(payout / (spins * TOTAL_STAKE))}`);console.log(`  Free Spins RTP contribution: ${formatPercent(featurePayout / (spins * TOTAL_STAKE))}`);console.log(`  Simulated feature trigger rate: ${formatPercent(triggers / spins)}`);}

if(require.main===module)main();

module.exports={LINES,LINE_BET,TOTAL_STAKE,SCATTER,WILD,MAX_AWARDED_FREE_SPINS,MAX_MULTIPLIER,PAYLINES,PAYTABLE,BASE_REELS,FREE_REELS,windowAt,symbolMatches,lineResult,evaluate,freeAward};
