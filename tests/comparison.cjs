const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const context={Intl};vm.createContext(context);
vm.runInContext(fs.readFileSync('statistics-2025.js','utf8'),context);
vm.runInContext(fs.readFileSync('comparison.js','utf8'),context);
const {metrics,describe}=context.PortunusComparison;
const data=context.statistik2025.kommuner;
test('all 237 areas compare the same housing type and preserve missing evidence',()=>{
 let areas=0;
 for(const values of Object.values(data))for(const d of Object.values(values)){
  areas++;
  for(const type of ['existing','new']){
   const fresh=type==='new',v=metrics(d,type,2);
   const q=fresh?d.ny:d.vanlig,r=fresh?d.hyraNy:d.hyra,c=fresh?d.antalNy:d.antal,rc=fresh?d.antalHyraNy:d.antalHyra;
   assert.equal(v.queue,c>0&&Number.isFinite(q)?q:null);
   assert.equal(v.rent,rc>0&&Number.isFinite(r)&&r>0?r:null);
   assert.equal(v.remaining,v.queue===null?null:Math.max(q-2,0));
  }
 }
 assert.equal(areas,237);
});
test('Nacka Strand and Orminge use exact differences without reversing cheaper and shorter',()=>{
 const a=metrics(data.Nacka['Nacka Strand'],'existing',10),b=metrics(data.Nacka.Orminge,'existing',10);
 assert.equal(a.remaining,3);assert.equal(b.remaining,0);
 const summary=describe(a,b,'Nacka Strand','Orminge');
 assert.match(summary,/Orminge har 9 år kortare/);assert.match(summary,/Orminge har 2\s964 kr lägre/);
 assert.equal(describe(a,b,'Nacka Strand','Orminge'),describe(b,a,'Orminge','Nacka Strand'));
});
test('missing queue or rent does not create zero values or imply no apartments',()=>{
 const missing=metrics({vanlig:0,hyra:1000,antal:0,antalHyra:0},'existing',0);
 assert.equal(missing.queue,null);assert.equal(missing.rent,null);assert.equal(missing.remaining,null);
 const realZero=metrics({vanlig:0,hyra:1000,antal:1,antalHyra:1},'existing',0);
 assert.equal(realZero.queue,0);assert.equal(realZero.remaining,0);assert.equal(realZero.small,true);
 const mixed=describe(missing,realZero,'A','B');assert.match(mixed,/Saknat underlag/);assert(!mixed.includes('0 kr'));
});
test('equal values, small samples and opposing trade-offs are explicit',()=>{
 const a={queue:3,rent:9000},b={queue:5,rent:7000};
 assert.match(describe(a,b,'A','B'),/A har 2 år kortare/);assert.match(describe(a,b,'A','B'),/B har 2\s000 kr lägre/);
 assert.match(describe(a,a,'A','B'),/samma historiska kötid/);assert.match(describe(a,a,'A','B'),/Snitthyran är densamma/);
 assert.match(describe(a,a,'A','A'),/samma område/);
 assert.equal(metrics({ny:4,hyraNy:8000,antalNy:12,antalHyraNy:3},'new',4).small,true);
});
