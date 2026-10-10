const fs=require('fs'),vm=require('vm'),assert=require('assert');
const dataSource=fs.readFileSync('statistics-2025.js','utf8');
const html=fs.readFileSync('index.html','utf8');
function element(value='') { return {value,textContent:'',placeholder:'',max:'',options:[],children:[],handlers:{},classList:{set:new Set(),toggle(n,on){on?this.set.add(n):this.set.delete(n)}},setCustomValidity(m){this.error=m},addEventListener(k,fn){this.handlers[k]=fn},add(o){this.options.push(o);if(!this.value)this.value=o.value},replaceChildren(){this.options=[];this.children=[];this.value=''},append(child){this.children.push(child)},scrollIntoView(){}}; }
const els={}; const form=element(); ['alder','kotid','kommun','omrade','maxhyra','forslagScope'].forEach(k=>form[k]=element());form.reportValidity=()=>!form.alder.error&&!form.kotid.error&&!form.maxhyra.error;els.kotidsform=form;
form.forslagScope.value='kommun';
const ctx={document:{createElement(){return element()},getElementById(id){return els[id] ||= element()}},Option:function(text,value){return{text,value}},console};
vm.createContext(ctx);vm.runInContext(dataSource,ctx);vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],ctx);
assert.equal(form.kommun.value,'Stockholm');assert.equal(form.omrade.value,'Farsta');assert.equal(els.summa1.textContent,22+Math.max(ctx.statistik2025.kommuner.Stockholm.Farsta.vanlig-2,0));
// Traverse all combinations: own area data, both missing states, no fallback to Farsta.
for(const [kommun,areas] of Object.entries(ctx.statistik2025.kommuner)) {
 form.kommun.value=kommun;ctx.uppdateraOmraden();assert.equal(form.omrade.options.length,Object.keys(areas).length);
 for(const [area,data] of Object.entries(areas)) {
  form.omrade.value=area;ctx.raknaUtAlder();
  for(const [category,suffix] of [['vanlig','1'],['ny','2']]) {
   assert.equal(els['summa'+suffix].textContent,data[category]===null?'Underlag saknas':22+Math.max(data[category]-2,0),kommun+' '+area+' '+category);
   assert.equal(els['summa'+suffix].classList.set.has('stor--saknas'),data[category]===null);
  }
  for (const [field,suffix] of [['hyra','1'],['hyraNy','2']]) {
   const rent=data[field];
   assert.equal(els['hyra'+suffix].textContent,rent===null?'Underlag saknas':new Intl.NumberFormat('sv-SE').format(rent)+' kr/mån',kommun+' '+area+' rent');
  }
  assert(els.statistiknotering.textContent.includes(kommun+' – '+area));
 }
}
for(const [age,queue,valid] of [[18,0,true],[18,1,false],[20,2,true],[20,3,false],[99,81,true],[99,82,false],[17,0,false],[100,0,false],[20.5,1,false],[20,1.5,false]]) {
 form.alder.value=String(age);form.kotid.value=String(queue);ctx.uppdateraValidering();assert.equal(form.reportValidity(),valid,age+'/'+queue);
}
form.alder.value='20';form.kotid.value='2';form.kommun.value='Nacka';ctx.uppdateraOmraden();form.omrade.value='Fisksätra';ctx.raknaUtAlder();const fisk=els.kotid1.textContent;form.omrade.value='Nacka Strand';ctx.raknaUtAlder();console.log('Nacka existing:',fisk,'vs',els.kotid1.textContent);
assert(html.includes('href="#nyproduktion"'));assert(html.includes('.stor.stor--saknas'));
console.log('Passed every municipality/area and age/queue boundary.');

for(const value of [null,undefined,0,-1,NaN,Infinity]) assert.equal(ctx.formateraHyra(value),'Underlag saknas');
assert.equal(ctx.formateraHyra(13218),'13\u00a0218 kr/mån');
console.log('All 237 rent displays, missing rents and Swedish number formatting passed.');

// Isolated fixtures verify selection, ranking, missing data and exact budget boundaries.
const original=ctx.kotider;
ctx.kotider={A:{Quick:{vanlig:2,ny:null,hyra:6000,hyraNy:null,antal:20,antalHyra:20,antalNy:0,antalHyraNy:0},
 Small:{vanlig:2,ny:null,hyra:5000,hyraNy:null,antal:1,antalHyra:1,antalNy:0,antalHyraNy:0},
 Wait:{vanlig:5,ny:null,hyra:4000,hyraNy:null,antal:30,antalHyra:30,antalNy:0,antalHyraNy:0},
 Expensive:{vanlig:0,ny:null,hyra:6001,hyraNy:null,antal:20,antalHyra:20,antalNy:0,antalHyraNy:0},
 Missing:{vanlig:null,ny:null,hyra:1000,hyraNy:null,antal:0,antalHyra:1,antalNy:0,antalHyraNy:0}},
 B:{New:{vanlig:null,ny:1,hyra:null,hyraNy:3000,antal:0,antalHyra:0,antalNy:20,antalHyraNy:20}}};
let suggestions=ctx.hittaForslag(2,6000,'A');
assert.deepEqual(Array.from(suggestions,x=>x.omrade),['Quick','Small','Wait']);
assert.equal(suggestions[0].kvar,0);assert.equal(suggestions[2].kvar,3);
assert.equal(ctx.hittaForslag(2,2999,null).length,0);
assert.equal(ctx.hittaForslag(2,3000,'B')[0].typ,'Nyproduktion');
assert(ctx.hittaForslag(2,6000,null).every(x=>x.hyra<=6000));
ctx.kotider=original;
form.alder.value='22';form.kotid.value='2';form.kommun.value='Stockholm';ctx.uppdateraOmraden();form.omrade.value='Farsta';
for(const [budget,valid] of [['',true],['0',false],['-1',false],['7500.5',false],['7500',true]]) {
 form.maxhyra.value=budget;ctx.uppdateraValidering();assert.equal(form.reportValidity(),valid);
}
form.maxhyra.value='1';ctx.raknaUtAlder();assert.equal(els['forslag-lista'].children.length,0);assert(els['forslag-status'].textContent.includes('Inga områden'));
form.maxhyra.value='10000';form.forslagScope.value='alla';ctx.raknaUtAlder();assert(els['forslag-lista'].children.length>0 && els['forslag-lista'].children.length<=6);
const first=ctx.hittaForslag(2,10000,null)[0];els['forslag-lista'].children[0].children.at(-1).handlers.click();
assert.equal(form.kommun.value,first.kommun);assert.equal(form.omrade.value,first.omrade);
form.maxhyra.value='';ctx.raknaUtAlder();assert.equal(els['forslag-lista'].children.length,0);
console.log('Recommendation budget/scope/ranking/empty-state/click-through tests passed.');
