import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto=webcrypto;
import stats from '../backend/generated-data.mjs';
import worker, { BotGate } from '../backend/worker.mjs';
import { reserve, validateInput, candidates, modelRequest, safeAnswer, TOTAL_LIMIT } from '../backend/logic.mjs';
const input=(patch={})=>({question:'Vilka områden passar?',session:crypto.randomUUID(),token:'valid-proof',consent:true,age:25,queue:7,budget:8000,municipality:'Stockholm',area:'Farsta',scope:'kommun',...patch});
class Storage {
  data=new Map(); tail=Promise.resolve(); alarm=null;
  async get(k){return structuredClone(this.data.get(k));}
  async put(k,v){for(const [key,value] of typeof k==='string'?[[k,v]]:Object.entries(k))this.data.set(key,structuredClone(value));}
  async delete(k){this.data.delete(k);}
  transaction(fn){const p=this.tail.then(()=>fn(this));this.tail=p.catch(()=>{});return p;}
  async getAlarm(){return this.alarm;} async setAlarm(t){this.alarm=t;}
  async list({prefix,limit,startAfter}) {return new Map([...this.data].filter(([k])=>k.startsWith(prefix)&&(!startAfter||k>startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit));}
}
async function release(storage,id){await storage.transaction(async tx=>{const g=await tx.get('global');await tx.put('global',{...g,leases:g.leases.filter(x=>x.id!==id)});});}

test('validate inputs, question cap, consent, rooms and age/queue boundaries',()=>{
 assert.equal(validateInput(input(),stats).queue,7);
 for(const patch of [{age:17},{age:100},{age:20,queue:3},{queue:-1},{queue:1.5},{question:'x'.repeat(801)},{consent:false},{budget:0},{budget:1.5},{budget:1000001},{municipality:'__proto__'},{area:'Missing'},{scope:'other'},{token:''}])assert.throws(()=>validateInput(input(patch),stats));
 assert.doesNotThrow(()=>validateInput(input({age:18,queue:0,budget:null}),stats));
 assert.equal(stats.filter.rum,'1 och 2');
});
test('server suggestions use trusted statistics, respect budgets and scope, support Bromma',()=>{
 for(const municipality of Object.keys(stats.kommuner))for(const budget of [1,5000,10000,20000]){
  const p=input({municipality,area:Object.keys(stats.kommuner[municipality])[0],budget});
  for(const c of candidates(p,stats)){assert.equal(c.municipality,municipality);assert(c.rent<=budget);assert.equal(c.age,p.age+c.remaining);assert(c.count>0);}
 }
 assert.deepEqual(candidates(input({budget:null}),stats),[]);
 assert.deepEqual(candidates(input({budget:1}),stats),[]);
 assert(candidates(input({question:'Vad passar i Bromma?',scope:'alla',budget:20000}),stats).every(c=>c.municipality==='Stockholm'&&c.area!=='Farsta'));
});
test('one bounded request: no tools, no saved conversation; unsafe numeric AI answers fall back',()=>{
 const p=input();const request=modelRequest(p,stats,candidates(p,stats));
 assert.equal(request.max_output_tokens,400);assert.equal(request.store,false);assert.equal(request.model,'gpt-4.1-mini-2025-04-14');assert(!request.tools);assert.equal(request.input.length,1);
 assert(JSON.stringify(request).length<16000);
 const result=text=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:text})}]}]});
 assert.equal(safeAnswer(result('Jämför underlagen i korten.')),'Jämför underlagen i korten.');
 for(const value of ['Hyran är 1 kr.','Besök https://evil.invalid','x'.repeat(1601)])assert(safeAnswer(result(value)).includes('kontrollerade statistiken'));
 assert(safeAnswer({status:'incomplete'}).includes('inte slutföra'));
});
test('lifetime counter permits exactly 1000 reservations, survives new instances and dates',async()=>{
 const storage=new Storage();
 for(let i=0;i<TOTAL_LIMIT;i++){const r=await storage.transaction(tx=>reserve(tx,'ip'+i,'session'+i,1000000000+i*60000));assert(r.ok);await release(storage,r.id);}
 assert.equal((await storage.get('global')).used,1000);
 assert.equal((await storage.transaction(tx=>reserve(tx,'other','other',999999999999))).code,'closed');
 const gate=new BotGate({storage},{OPENAI_API_KEY:'mock'});
 const response=await gate.fetch(new Request('https://internal/chat',{method:'POST',body:JSON.stringify({input:input(),ipHash:'new',sessionHash:'new'})}));assert.equal(response.status,503);
});
test('atomic concurrent reservations do not pass the remaining quota',async()=>{
 const storage=new Storage();await storage.put('global',{used:998,paused:false,leases:[]});
 const results=await Promise.all(Array.from({length:50},(_,i)=>storage.transaction(tx=>reserve(tx,'ip'+i,'s'+i))));
 assert.equal(results.filter(x=>x.ok).length,2);assert.equal((await storage.get('global')).used,1000);
});
test('concurrency, per-session and per-IP limits; no refund for accepted reservations',async()=>{
 const storage=new Storage(),now=100000000;
 const first=await storage.transaction(tx=>reserve(tx,'ip','s',now));const second=await storage.transaction(tx=>reserve(tx,'ip2','s2',now));const third=await storage.transaction(tx=>reserve(tx,'ip3','s3',now));
 assert.equal((await storage.transaction(tx=>reserve(tx,'ip4','s4',now))).code,'busy');
 for(const r of [first,second,third])await release(storage,r.id);
 for(let i=0;i<4;i++){const r=await storage.transaction(tx=>reserve(tx,'ip','s',now));assert(r.ok);await release(storage,r.id);}
 assert.equal((await storage.transaction(tx=>reserve(tx,'ip','s',now))).code,'rate');
 const s2=new Storage();
 for(let i=0;i<20;i++){const r=await s2.transaction(tx=>reserve(tx,'shared','session'+i,now));assert(r.ok);await release(s2,r.id);}
 assert.equal((await s2.transaction(tx=>reserve(tx,'shared','other',now))).code,'rate');
 assert.equal((await s2.get('global')).used,20);
});
test('expired leases recover and daily limits reset; lifetime usage does not',async()=>{
 const storage=new Storage(),now=100000000;
 for(let i=0;i<3;i++)assert((await storage.transaction(tx=>reserve(tx,'i'+i,'s'+i,now))).ok);
 assert((await storage.transaction(tx=>reserve(tx,'other','other',now+46000))).ok);
 assert.equal((await storage.get('global')).used,4);
});
test('alarm removes expired hashed rate keys but preserves lifetime state',async()=>{
 const storage=new Storage();await storage.put({global:{used:1000,paused:false,leases:[]},'rate:expired':{expires:0},'rate:current':{expires:Date.now()+60000}});
 const gate=new BotGate({storage},{});await gate.alarm();assert.equal(await storage.get('rate:expired'),undefined);assert.equal((await storage.get('global')).used,1000);assert(await storage.getAlarm());
});
test('origin/config/missing credentials/oversized body fail before any paid request',async()=>{
 const env={ALLOWED_ORIGIN:'https://arnegard.github.io'};
 const req=(path,opts={})=>new Request('https://worker.invalid'+path,{headers:{Origin:env.ALLOWED_ORIGIN,...opts.headers},...opts});
 assert.equal((await worker.fetch(new Request('https://worker.invalid/config'),env)).status,403);
 assert.equal((await (await worker.fetch(req('/config'),env)).json()).enabled,false);
 assert.equal((await worker.fetch(req('/chat',{method:'POST'}),env)).status,503);
});
test('proof verification rejects wrong hostname/action before gate; valid proof calls gate',async()=>{
 const old=globalThis.fetch;let gateCalls=0;
 const env={ALLOWED_ORIGIN:'https://arnegard.github.io',BOT_ENABLED:'true',OPENAI_API_KEY:'mock',TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET_KEY:'secret',RATE_LIMIT_SALT:'x'.repeat(32),BOT_GATE:{idFromName:x=>x,get:()=>({fetch:async()=>{gateCalls++;return Response.json({answer:'ok',cards:[]});}})}};
 const req=(body=input())=>new Request('https://worker.invalid/chat',{method:'POST',headers:{Origin:env.ALLOWED_ORIGIN,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(body)});
 try {
  for(const proof of [{success:false},{success:true,hostname:'evil.invalid',action:'portunus-chat'},{success:true,hostname:'arnegard.github.io',action:'wrong'}]){globalThis.fetch=async()=>Response.json(proof);assert.equal((await worker.fetch(req(),env)).status,403);}
  assert.equal(gateCalls,0);
  globalThis.fetch=async()=>Response.json({success:true,hostname:'arnegard.github.io',action:'portunus-chat'});
  assert.equal((await worker.fetch(req(),env)).status,200);assert.equal(gateCalls,1);
  assert.equal((await worker.fetch(req({question:'x'.repeat(10000)}),env)).status,400);
 } finally {globalThis.fetch=old;}
});
test('no retries, errors consume one reservation; depleted API pauses the bot',async()=>{
 const old=globalThis.fetch;const storage=new Storage();const gate=new BotGate({storage},{OPENAI_API_KEY:'mock'});let calls=0;
 const req=()=>new Request('https://internal/chat',{method:'POST',body:JSON.stringify({input:input(),ipHash:'ip',sessionHash:'s'})});
 try {
  globalThis.fetch=async()=>{calls++;return Response.json({error:{code:'insufficient_quota'}},{status:429});};
  assert.equal((await gate.fetch(req())).status,503);assert.equal(calls,1);assert.equal((await storage.get('global')).used,1);assert.equal((await storage.get('global')).paused,true);
  assert.equal((await gate.fetch(req())).status,503);assert.equal(calls,1);
 } finally {globalThis.fetch=old;}
});
test('storage errors fail closed before paid calls',async()=>{
 const gate=new BotGate({storage:{transaction:async()=>{throw Error('offline');}}},{});
 const response=await gate.fetch(new Request('https://internal/chat',{method:'POST',body:JSON.stringify({input:input(),ipHash:'ip',sessionHash:'s'})}));assert.equal(response.status,503);
});
test('successful provider response returns trusted cards and one counted request',async()=>{
 const old=globalThis.fetch;const storage=new Storage();const gate=new BotGate({storage},{OPENAI_API_KEY:'mock'});let calls=0;
 try {
  globalThis.fetch=async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const sent=JSON.parse(opts.body);assert.equal(sent.store,false);assert.equal(sent.max_output_tokens,400);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'Jämför underlagen i korten.'})}]}]});};
  const p=input();const response=await gate.fetch(new Request('https://internal/chat',{method:'POST',body:JSON.stringify({input:p,ipHash:'ip',sessionHash:'session'})}));const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.answer,'Jämför underlagen i korten.');assert.deepEqual(data.cards,candidates(p,stats));assert.equal(calls,1);assert.equal((await storage.get('global')).used,1);assert.equal((await storage.get('global')).leases.length,0);
 } finally {globalThis.fetch=old;}
});
