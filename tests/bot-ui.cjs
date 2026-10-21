const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const {webcrypto}=require('node:crypto');
function element(){return {scrollHeight:100,scrollTop:0,hidden:false,value:'',checked:false,disabled:false,textContent:'',children:[],handlers:{},attributes:{},className:'',append(...x){for(const e of x)e.parent=this;this.children.push(...x);if(this.isHead)for(const e of x)queueMicrotask(()=>e.onload());},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},replaceChildren(){this.children=[];},addEventListener(k,fn){this.handlers[k]=fn;},setAttribute(k,v){this.attributes[k]=v;},reportValidity(){return true;},scrollIntoView(){this.scrolled=true;}};}
function setup(endpoint){const els={},document={getElementById(id){return els[id] ||= element()},createElement(){return element()},head:element()};document.head.isHead=true;document.getElementById('bot-panel').hidden=true;document.getElementById('bot-consent').checked=true;document.getElementById('bot-question').value='Vad betyder mitt resultat?';
 const form=document.getElementById('kotidsform');for(const [k,v]of Object.entries({kommun:'Stockholm',omrade:'Farsta',forslagScope:'kommun'}))form[k]={value:v};
 const requests=[];let resets=0,proof;
 const ctx={document,URL,AbortSignal,TextEncoder,crypto:webcrypto,sessionStorage:{getItem(){return null},setItem(){}},window:{PORTUNUS_BOT:{endpoint},turnstile:{render(s,opts){proof=opts.callback;queueMicrotask(()=>opts.callback('verified-token'));return 1;},reset(){resets++;}}},uppdateraValidering(){return {alder:22,kotid:2,budget:8000}},kotider:{Stockholm:{Farsta:{}}},uppdateraOmraden(){},raknaUtAlder(){},fetch:async(url,options)=>{requests.push({url,options});return url.endsWith('/config')?{ok:true,json:async()=>({enabled:true,siteKey:'public-key'})}:{ok:true,json:async()=>({answer:'Jämför underlagen i korten.',cards:[{municipality:'Stockholm',area:'Farsta',type:'Befintliga bostäder',rent:7000,queue:5,remaining:3,count:10,rentCount:10}]})};}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('bot.js','utf8'),ctx);return {ctx,els,requests,prove(){proof('verified-token')},get resets(){return resets}};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('follow-up sends recent conversation; new chat clears it without reading the calculator',async()=>{
 const x=setup('https://bot.example/');x.ctx.uppdateraValidering=()=>{throw Error('Calculator must not be read')};
 x.els['bot-toggle'].handlers.click();await settle();
 x.els['bot-question'].value='Bromma, sju år i kön och max åtta tusen';
 await x.els['bot-form'].handlers.submit({preventDefault(){}});
 x.prove();x.els['bot-question'].value='Och om jag höjer hyran?';
 await x.els['bot-form'].handlers.submit({preventDefault(){}});
 const body=JSON.parse(x.requests.at(-1).options.body);
 assert.equal(body.history.length,2);assert.equal(body.history[0].content,'Bromma, sju år i kön och max åtta tusen');
 assert.equal(x.els['bot-log'].children.length,2);
 x.els['bot-reset'].handlers.click();assert.equal(x.els['bot-log'].children.length,0);
 x.prove();x.els['bot-question'].value='Nu vill jag fråga om innerstan';
 await x.els['bot-form'].handlers.submit({preventDefault(){}});
 assert.deepEqual(JSON.parse(x.requests.at(-1).options.body).history,[]);
});
test('unconfigured bot makes no calls and calculator remains accessible',async()=>{const x=setup('');x.els['bot-toggle'].handlers.click();await settle();assert.equal(x.requests.length,0);assert(x.els['bot-status'].textContent.includes('inte tillgänglig'));});
test('long conversations retain only bounded recent history and three ordinary chat exchanges',async()=>{
 const x=setup('https://bot.example/');x.els['bot-toggle'].handlers.click();await settle();
 for(let i=0;i<6;i++){
  x.prove();x.els['bot-question'].value='å'.repeat(799)+i;
  await x.els['bot-form'].handlers.submit({preventDefault(){}});
  const body=JSON.parse(x.requests.at(-1).options.body);
  assert(body.history.length<=4);assert(new TextEncoder().encode(JSON.stringify(body.history)).length<=4096);
  assert(new TextEncoder().encode(x.requests.at(-1).options.body).length<=8192);
 }
 assert.equal(x.els['bot-log'].children.length,3);assert(x.els['bot-log'].children.every(t=>t.className==='bot-turn'));
});
test('open/close, proof, consent and calculator-independent request',async()=>{const x=setup('https://bot.example/');x.els['bot-toggle'].handlers.click();await settle();assert.equal(x.els['bot-panel'].hidden,false);assert.equal(x.els['bot-send'].disabled,false);
 await x.els['bot-form'].handlers.submit({preventDefault(){}});assert.equal(x.requests.filter(r=>r.url.endsWith('/chat')).length,1);const body=JSON.parse(x.requests[1].options.body);assert.equal(body.consent,true);assert.equal(body.mode,'chat');assert.equal(body.age,undefined);assert.equal(body.budget,undefined);assert.equal(body.municipality,undefined);assert.deepEqual(body.history,[]);assert.equal(body.token,'verified-token');assert(!body.apiKey);assert.equal(x.resets,1);assert.equal(x.els['bot-send'].disabled,true);
 assert.equal(x.els['bot-log'].scrollTop,x.els['bot-log'].scrollHeight);
 x.els['bot-toggle'].handlers.click();assert.equal(x.els['bot-panel'].hidden,true);
});
test('failed request is not automatically retried and renders message as text',async()=>{const x=setup('https://bot.example/');x.els['bot-toggle'].handlers.click();await settle();x.ctx.fetch=async()=>({ok:false,json:async()=>({error:'<img src=x> gränsen nådd'})});await x.els['bot-form'].handlers.submit({preventDefault(){}});assert.equal(x.els['bot-status'].textContent,'<img src=x> gränsen nådd');assert.equal(x.resets,1);assert.equal(x.els['bot-send'].disabled,true);x.prove();assert.equal(x.els['bot-status'].textContent,'<img src=x> gränsen nådd');assert.equal(x.els['bot-log'].children.at(-1).children.at(-1).children[1].textContent,'<img src=x> gränsen nådd');});
test('ordinary chat displays the answer directly without cards or extra summaries',async()=>{
 const x=setup('https://bot.example/');x.els['bot-toggle'].handlers.click();await settle();
 x.ctx.fetch=async()=>({ok:true,json:async()=>({answer:'På Östermalm var kösnittet 26 år.',summary:'Extra söktext',scopeNote:'Extra geografi',status:'Extra text',cards:[{area:'Östermalm',rent:8695}]})});
 await x.els['bot-form'].handlers.submit({preventDefault(){}});
 const turn=x.els['bot-log'].children.at(-1);
 assert.equal(turn.children.length,2);assert.equal(turn.children[0].children[0].textContent,'Du');
 assert.equal(turn.children[1].children[1].textContent,'På Östermalm var kösnittet 26 år.');
 assert(!turn.children.some(x=>x.className==='bot-card'||x.className==='bot-evidence'));
 assert.equal(x.els['bot-log'].scrollTop,x.els['bot-log'].scrollHeight);
});
