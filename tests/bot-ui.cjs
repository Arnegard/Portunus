const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const {webcrypto}=require('node:crypto');
function element(){return {hidden:false,value:'',checked:false,disabled:false,textContent:'',children:[],handlers:{},attributes:{},className:'',append(...x){this.children.push(...x);if(this.isHead)for(const e of x)queueMicrotask(()=>e.onload());},replaceChildren(){this.children=[];},addEventListener(k,fn){this.handlers[k]=fn;},setAttribute(k,v){this.attributes[k]=v;},reportValidity(){return true;},scrollIntoView(){this.scrolled=true;}};}
function setup(endpoint){const els={},document={getElementById(id){return els[id] ||= element()},createElement(){return element()},head:element()};document.head.isHead=true;document.getElementById('bot-panel').hidden=true;document.getElementById('bot-consent').checked=true;document.getElementById('bot-question').value='Vad betyder mitt resultat?';
 const form=document.getElementById('kotidsform');for(const [k,v]of Object.entries({kommun:'Stockholm',omrade:'Farsta',forslagScope:'kommun'}))form[k]={value:v};
 const requests=[];let resets=0;
 const ctx={document,URL,AbortSignal,crypto:webcrypto,sessionStorage:{getItem(){return null},setItem(){}},window:{PORTUNUS_BOT:{endpoint},turnstile:{render(s,opts){queueMicrotask(()=>opts.callback('verified-token'));return 1;},reset(){resets++;}}},uppdateraValidering(){return {alder:22,kotid:2,budget:8000}},kotider:{Stockholm:{Farsta:{}}},uppdateraOmraden(){},raknaUtAlder(){},fetch:async(url,options)=>{requests.push({url,options});return url.endsWith('/config')?{ok:true,json:async()=>({enabled:true,siteKey:'public-key'})}:{ok:true,json:async()=>({answer:'Jämför underlagen i korten.',cards:[{municipality:'Stockholm',area:'Farsta',type:'Befintliga bostäder',rent:7000,queue:5,remaining:3,count:10,rentCount:10}]})};}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('bot.js','utf8'),ctx);return {ctx,els,requests,get resets(){return resets}};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('unconfigured bot makes no calls and calculator remains accessible',async()=>{const x=setup('');x.els['bot-toggle'].handlers.click();await settle();assert.equal(x.requests.length,0);assert(x.els['bot-status'].textContent.includes('inte tillgänglig'));});
test('open/close, proof, explicit consent payload, one request and calculator link',async()=>{const x=setup('https://bot.example/');x.els['bot-toggle'].handlers.click();await settle();assert.equal(x.els['bot-panel'].hidden,false);assert.equal(x.els['bot-send'].disabled,false);
 await x.els['bot-form'].handlers.submit({preventDefault(){}});assert.equal(x.requests.filter(r=>r.url.endsWith('/chat')).length,1);const body=JSON.parse(x.requests[1].options.body);assert.equal(body.consent,true);assert.equal(body.budget,8000);assert.equal(body.age,22);assert.equal(body.token,'verified-token');assert(!body.apiKey);assert.equal(x.resets,1);assert.equal(x.els['bot-send'].disabled,true);
 const card=x.els['bot-log'].children.at(-1);card.children.at(-1).handlers.click();assert(x.els.rakning.scrolled);
 x.els['bot-toggle'].handlers.click();assert.equal(x.els['bot-panel'].hidden,true);
});
test('failed request is not automatically retried and renders message as text',async()=>{const x=setup('https://bot.example/');x.els['bot-toggle'].handlers.click();await settle();x.ctx.fetch=async()=>({ok:false,json:async()=>({error:'<img src=x> gränsen nådd'})});await x.els['bot-form'].handlers.submit({preventDefault(){}});assert.equal(x.els['bot-status'].textContent,'<img src=x> gränsen nådd');assert.equal(x.resets,1);assert.equal(x.els['bot-send'].disabled,true);});
test('comparison cards show verified budget and queue differences; new reply starts at the top',async()=>{
 const x=setup('https://bot.example/');x.els['bot-toggle'].handlers.click();await settle();
 x.ctx.fetch=async()=>({ok:true,json:async()=>({answer:'Ditt val är också värt att undersöka.',cards:[
  {municipality:'Nacka',area:'Nacka Strand',type:'Befintliga bostäder',rent:10942,queue:13,remaining:0,count:13,rentCount:13,reason:'Ditt val',budgetMargin:1058,queueMargin:0},
  {municipality:'Nacka',area:'Orminge',type:'Befintliga bostäder',rent:7978,queue:4,remaining:0,count:81,rentCount:81,reason:'Jämför hyra',budgetMargin:4022,queueMargin:9,comparison:{area:'Nacka Strand',type:'Befintliga bostäder',rentSaving:2964,queueSaving:9}}
 ]})});
 await x.els['bot-form'].handlers.submit({preventDefault(){}});
 const cards=x.els['bot-log'].children.slice(-2);
 assert(cards[0].children[1].textContent.startsWith('Ditt val.'));
 assert.match(cards[0].children[2].textContent,/1\s058 kr\/mån under din maxhyra/);
 assert.match(cards[1].children[2].textContent,/2\s964 kr\/mån lägre snitthyra/);
 assert(cards[1].children[2].textContent.includes('9 år kortare historisk kötid'));
 assert.equal(x.els['bot-panel'].scrollTop,0);
});
