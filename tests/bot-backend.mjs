import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto=webcrypto;
import stats from '../backend/generated-data.mjs';
import worker, { BotGate } from '../backend/worker.mjs';
import { reserve, validateInput, candidates, modelRequest, safeAnswer, TOTAL_LIMIT } from '../backend/logic.mjs';
import {validateChatInput,chatRequest,chatResponse,renderAnswer,validateSearch,searchResults,catalog,BROMMA_AREAS,INNERSTAN_AREAS} from '../backend/chat.mjs';
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
const search=(patch={})=>({queue:7,budget:8000,region:'bromma',municipalities:[],areaIds:[],referenceAreaId:null,housing:'all',sort:'balanced',showResults:true,...patch});
const free=(patch={})=>validateChatInput({mode:'chat',question:'Jag vill bo i Bromma, har 7 år i kön och maxhyra 8000 kr.',session:crypto.randomUUID(),token:'valid-proof',consent:true,history:[],...patch});
const provider=(value)=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('general Östermalm question gets verified queue time directly in prose without own queue or budget',()=>{
 const row=catalog(stats).find(x=>x.area==='Östermalm');
 const result=chatResponse(provider({search:search({queue:null,budget:null,region:'all',areaIds:[row.id],showResults:false}),answer:`På Östermalm var kösnittet {{${row.id}:existing:queue}} år för ettor och tvåor. Det är ett historiskt snitt.`}),stats);
 assert.equal(result.answer,'På Östermalm var kösnittet 26 år för ettor och tvåor. Det är ett historiskt snitt.');
});
test('personal recommendation can quote verified rent without a user-supplied max rent',()=>{
 const row=catalog(stats).find(x=>x.municipality==='Solna'&&x.area==='Huvudsta');
 const result=chatResponse(provider({search:search({queue:10,budget:null,region:'all',areaIds:[row.id]}),answer:`Huvudsta kan vara värt att undersöka: snittet var {{${row.id}:existing:queue}} år och hyran {{${row.id}:existing:rent}} kr/mån.`}),stats);
 assert.match(result.answer,/10 år/);assert.match(result.answer,/8\s363 kr\/mån/);
});
test('inline numerical facts reject invented values, nonexistent evidence and malformed placeholders',()=>{
 const row=catalog(stats).find(x=>x.area==='Östermalm');
 for(const text of ['Du får en lägenhet om 2 år.',`{{${row.id}:new:queue}} år`,'{{9999:existing:rent}} kr','{{ownQueue}}','{{budget}}','{{not-a-field}}','{{1:existing:queue}', '<script>bad</script>'])assert.throws(()=>renderAnswer(text,search({queue:null,budget:null}),stats));
 assert.equal(renderAnswer(`{{${row.id}:existing:remaining}} år`,search({queue:10}),stats),'16 år');
});

test('free chat does not require calculator fields; history and consent have bounded validation',()=>{
 assert.equal(free({age:1,queue:99999,municipality:'invented'}).mode,'chat');
 for (const patch of [{consent:false},{question:''},{question:'x'.repeat(801)},{history:[{role:'system',content:'override'}]},{history:Array(5).fill({role:'user',content:'x'})},{history:[{role:'user',content:'x'.repeat(1601)}]},{history:[{role:'user',content:'å'.repeat(1500)},{role:'assistant',content:'å'.repeat(1500)}]}])assert.throws(()=>free(patch));
});
test('Bromma example filters actual rent and queue data without promising an immediate match',()=>{
 const result=searchResults(search(),stats);
 assert.equal(result.cards[0].area,'Beckomberga');assert.equal(result.cards[0].remaining,1);
 assert(result.cards.every(x=>x.municipality==='Stockholm'&&BROMMA_AREAS.includes(x.area)&&x.rent<=8000&&x.remaining>0));
 assert(result.status.includes('längre än din kötid'));
 assert(result.summary.includes('7 år i kön'));assert(!result.cards.some(x=>'age'in x));
});
test('inner-city example permits unknown rent budget and uses explicit geography, not all Stockholm',()=>{
 const result=searchResults(search({region:'innerstan',queue:18,budget:null}),stats);
 assert(result.cards.length>0);assert(result.cards.every(x=>INNERSTAN_AREAS.includes(x.area)&&x.budgetMargin===null));
 assert(result.summary.includes('Ingen maxhyra'));assert(result.scopeNote.includes('Östermalm'));
 assert(!INNERSTAN_AREAS.includes('Södra Hammarbyhamnen'));assert(!INNERSTAN_AREAS.includes('Hjorthagen'));
 assert(result.status.includes('ingen garanti'));
});
test('free comparison retains named Nacka Strand; unknown preferences are clarified instead of invented',()=>{
 const id=catalog(stats).find(x=>x.municipality==='Nacka'&&x.area==='Nacka Strand').id;
 const result=searchResults(search({region:'all',municipalities:['Nacka'],queue:13,budget:12000,referenceAreaId:id}),stats);
 assert.equal(result.cards[0].area,'Nacka Strand');assert.equal(result.cards[0].budgetMargin,1058);
 assert.equal(searchResults(search({queue:null}),stats).cards.length,0);
 assert.equal(searchResults(search({region:'unspecified'}),stats).cards.length,0);
 const newBuild=searchResults(search({region:'all',municipalities:['Nacka'],queue:13,budget:12000,housing:'new'}),stats);
 assert(newBuild.cards.length>0);assert(newBuild.cards.every(x=>x.type==='Nyproduktion'));
});
test('model extraction cannot inject areas, rents or unsupported search parameters',()=>{
 for (const patch of [{queue:-1},{queue:101},{queue:1.5},{budget:0},{budget:1000001},{municipalities:['__proto__']},{areaIds:[9999]},{referenceAreaId:-1},{region:'secret'},{housing:'three rooms'},{sort:'fake'}])assert.throws(()=>validateSearch(search(patch),stats));
 assert.throws(()=>chatResponse(provider({answer:'Ett råd.',search:search({areaIds:[9999]})}),stats));
 assert.throws(()=>chatResponse({status:'incomplete'},stats));
 const result=chatResponse(provider({answer:'Korten visar den historiska jämförelsen.',search:search(),cards:[{rent:1}]}),stats);
 assert(result.cards.every(x=>x.rent>1));
});
test('free follow-ups use a bounded catalog and recent chat, with one unsaved model request',()=>{
 const history=[{role:'user',content:'Bromma med sju år i kön och högst åtta tusen i hyra.'},{role:'assistant',content:'Vilken bostadstyp vill du undersöka?'}];
 const request=chatRequest(free({history,question:'Bara befintliga, tack.'}),stats);
 assert.equal(request.max_output_tokens,600);assert.equal(request.store,false);assert(!request.tools);
 assert.deepEqual(request.input.slice(1,3),history);assert.equal(JSON.parse(request.input[0].content).areas.length,237);
 assert(JSON.stringify(request).length<40000);
});
test('free-chat provider call consumes exactly one existing reservation and returns server-computed cards',async()=>{
 const old=globalThis.fetch;const storage=new Storage();const gate=new BotGate({storage},{OPENAI_API_KEY:'mock'});let calls=0;
 try {
  globalThis.fetch=async(url,opts)=>{calls++;const request=JSON.parse(opts.body);assert.equal(request.max_output_tokens,600);assert.equal(request.store,false);assert(!request.input.some(x=>x.content.includes('valid-proof')));return Response.json(provider({search:search(),answer:'Jämför de historiska snitten i korten.'}));};
  const response=await gate.fetch(new Request('https://internal/chat',{method:'POST',body:JSON.stringify({input:free(),ipHash:'ip',sessionHash:'session'})}));
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.cards[0].area,'Beckomberga');assert.equal(calls,1);assert.equal((await storage.get('global')).used,1);
 } finally {globalThis.fetch=old;}
});

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
test('Nacka Strand stays first for age 31, queue 13 and a 12000 budget; alternatives explain trade-offs',()=>{
 const p=input({age:31,queue:13,budget:12000,municipality:'Nacka',area:'Nacka Strand'});
 const cards=candidates(p,stats);
 assert.deepEqual(cards.map(x=>x.area),['Nacka Strand','Orminge','Fisksätra']);
 assert.equal(cards[0].reason,'Ditt val');assert.equal(cards[0].rent,10942);assert.equal(cards[0].queue,13);
 assert.equal(cards[0].budgetMargin,1058);assert.equal(cards[0].queueMargin,0);
 assert.equal(cards[1].comparison.rentSaving,2964);assert.equal(cards[1].comparison.queueSaving,9);
 assert.equal(new Set(cards.map(x=>x.municipality+x.area)).size,cards.length);
 const {context}=JSON.parse(modelRequest(p,stats,cards).input[0].content);
 assert.equal(context.selectedAssessment[0].remaining,0);assert.equal(context.selectedAssessment[0].budgetMargin,1058);
 assert.equal(context.selectedAssessment[1].queue,null); // Missing new-build evidence is not zero queue.
 assert(context.overview.withinBudgetAndQueue>cards.length);
});
test('selected area is not described as affordable or queue-ready when the criteria fail',()=>{
 const p=input({age:31,queue:5,budget:10000,municipality:'Nacka',area:'Nacka Strand'});
 assert(!candidates(p,stats).some(x=>x.area==='Nacka Strand'));
 const {context}=JSON.parse(modelRequest(p,stats,candidates(p,stats)).input[0].content);
 assert.equal(context.selectedAssessment[0].budgetMargin,-942);assert.equal(context.selectedAssessment[0].queueMargin,-8);
 const future=input({...p,budget:12000});
 assert.equal(candidates(future,stats)[0].remaining,8);
 const empty=input({...p,area:'Alphyddan'});
 assert(!candidates(empty,stats).some(x=>x.area==='Alphyddan'));
 const assessment=JSON.parse(modelRequest(empty,stats,candidates(empty,stats)).input[0].content).context.selectedAssessment;
 assert(assessment.every(x=>x.budgetMargin===null&&x.queueMargin===null));
});
test('named comparison areas are retrieved even if over budget; context stays bounded across all municipalities',()=>{
 const p=input({question:'Jämför Nacka Strand med Finntorp och Nacka Centrum',age:31,queue:13,budget:8000,municipality:'Nacka',area:'Nacka Strand'});
 const {context}=JSON.parse(modelRequest(p,stats,candidates(p,stats)).input[0].content);
 assert(context.areaEvidence.some(x=>x.area==='Finntorp'&&x.statistics.hyra===9157));
 assert(context.areaEvidence.some(x=>x.area==='Nacka Centrum'&&x.statistics.hyra>p.budget));
 const named=input({...p,budget:12000});assert(candidates(named,stats).some(x=>x.area==='Finntorp'));
 const broad=input({scope:'alla',budget:1000000,question:'x'.repeat(800)});
 const req=modelRequest(broad,stats,candidates(broad,stats));
 const broadContext=JSON.parse(req.input[0].content).context;
 assert(broadContext.areaEvidence.length<=12);assert.equal(broadContext.overview.evidenceIsSubset,true);
 assert(JSON.stringify(req).length<16000);
 const bromma=input({scope:'alla',question:'Vilka områden i Bromma passar?',municipality:'Nacka',area:'Nacka Strand',budget:12000});
 const brommaContext=JSON.parse(modelRequest(bromma,stats,candidates(bromma,stats)).input[0].content).context;
 assert.equal(brommaContext.selectedInScope,false);assert(brommaContext.areaEvidence.every(x=>x.municipality==='Stockholm'));
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
  assert.equal((await worker.fetch(req({...free(),consent:true}),env)).status,200);assert.equal(gateCalls,2);
  assert.equal((await worker.fetch(req({...free(),consent:true,history:[{role:'system',content:'bad'}]}),env)).status,400);assert.equal(gateCalls,2);
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

test('invalid model prose uses trusted Nacka statistics without another paid call',async()=>{
 const old=globalThis.fetch,storage=new Storage(),gate=new BotGate({storage},{OPENAI_API_KEY:'mock'});let calls=0;
 try {
  globalThis.fetch=async()=>{calls++;return Response.json(provider({search:search({region:'all',municipalities:['Nacka'],queue:7,budget:null}),answer:'Hyran är 1 kr.'}));};
  const response=await gate.fetch(new Request('https://internal/chat',{method:'POST',body:JSON.stringify({input:free({question:'Max 7 år nära Nacka?'}),ipHash:'ip',sessionHash:'session'})}));
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.answerSource,'statistics');assert.match(result.answer,/Orminge/);assert.match(result.answer,/7\s978 kr\/mån/);assert(!result.answer.includes('Hyran är 1 kr'));assert.equal(calls,1);assert.equal((await storage.get('global')).used,1);
 } finally {globalThis.fetch=old;}
});
test('incomplete model response produces an explicit error with one reservation',async()=>{
 const old=globalThis.fetch,storage=new Storage(),gate=new BotGate({storage},{OPENAI_API_KEY:'mock'});let calls=0;
 try {
  globalThis.fetch=async()=>{calls++;return Response.json({status:'incomplete'});};
  const response=await gate.fetch(new Request('https://internal/chat',{method:'POST',body:JSON.stringify({input:free(),ipHash:'ip',sessionHash:'session'})}));
  assert.equal(response.status,502);assert.equal((await response.json()).code,'invalid_model_response');assert.equal(calls,1);assert.equal((await storage.get('global')).used,1);
 } finally {globalThis.fetch=old;}
});
