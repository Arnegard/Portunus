const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function element(value='') {
 return {value,checked:false,disabled:false,hidden:false,children:[],handlers:{},options:[],textContent:'',clientWidth:320,
  classList:{toggle(){}},append(...items){this.children.push(...items);if(this.isHead)for(const x of items)queueMicrotask(()=>this.fail?x.onerror():x.onload());},
  add(option){this.options.push(option);},addEventListener(name,fn){(this.handlers[name]||=[]).push(fn);},remove(){},
  scrollIntoView(){this.scrolled=true;}};
}
function setup({fail=false,missing=false}={}) {
 const elements={};const get=id=>elements[id]||=element();
 const form=get('kotidsform');for(const [key,value]of Object.entries({alder:'31',kotid:'13',kommun:'Nacka',omrade:'Nacka Strand',maxhyra:'12000'}))form[key]=element(value);
 const head=element();head.isHead=true;head.fail=fail;
 let cluster,fitCalls=0,calculations=0;
 const map={setView(){return this},addLayer(){},fitBounds(bounds){fitCalls++;this.bounds=bounds;},remove(){this.removed=true}};
 const L={map(){return map},divIcon(x){return x},tileLayer(url,options){L.tiles={url,options};return {addTo(){return this},on(){return this}}},
  markerClusterGroup(){cluster={layers:[],addLayer(x){this.layers.push(x)},clearLayers(){this.layers=[]},zoomToShowLayer(x,fn){fn()}};return cluster;},
  marker(coords,options){return {coords,options,handlers:{},bindPopup(content){this.popup=content;return this},on(event,fn){this.handlers[event]=fn;return this},getElement(){return element()},openPopup(){this.opened=true}};}};
 const ctx={window:{L},L,document:{head,getElementById:get,createElement(){return element()}},Option:function(text,value){return {text,value}},setTimeout,clearTimeout,Promise,
  uppdateraOmraden(){form.omrade.value=Object.keys(ctx.kotider[form.kommun.value])[0]},raknaUtAlder(){calculations++;return true}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('statistics-2025.js','utf8'),ctx);ctx.kotider=ctx.statistik2025.kommuner;
 vm.runInContext(fs.readFileSync('map-locations.js','utf8'),ctx);if(missing)delete ctx.window.PORTUNUS_MAP_LOCATIONS.Nacka['Nacka Strand'];
 vm.runInContext(fs.readFileSync('area-map.js','utf8'),ctx);
 const fire=async(el,name)=>{for(const fn of el.handlers[name]||[])await fn({preventDefault(){}})};
 return {ctx,elements,form,map,L,fire,get cluster(){return cluster},get fitCalls(){return fitCalls},get calculations(){return calculations}};
}
test('stored positions reference known areas, traceable sources and plausible coordinates',()=>{
 const x=setup();let count=0;
 for(const [m,areas]of Object.entries(x.ctx.window.PORTUNUS_MAP_LOCATIONS))for(const [a,p]of Object.entries(areas)){
  count++;assert(Object.hasOwn(x.ctx.kotider[m],a),m+' '+a);assert(p.lat>58.6&&p.lat<60.5&&p.lng>16.5&&p.lng<19.3);assert(p.geonames||p.wikipedia||p.wikidata||p.osm);
 }
 assert.equal(count,Object.values(x.ctx.kotider).reduce((sum,areas)=>sum+Object.keys(areas).length,0));assert.equal(Object.keys(x.ctx.window.PORTUNUS_MAP_LOCATIONS.Stockholm).length,Object.keys(x.ctx.kotider.Stockholm).length);
 const a=x.ctx.window.PORTUNUS_MAP_LOCATIONS.Nacka['Nacka Strand'];const b=x.ctx.window.PORTUNUS_MAP_LOCATIONS.Nacka.Fisksätra;assert(Math.hypot(a.lat-b.lat,a.lng-b.lng)>.03);
});
test('map is lazy, clusters positions, and shows trusted rent and queue in popup',async()=>{
 const x=setup();assert.equal(x.cluster,undefined);assert.equal(x.elements['map-municipality'].value,'Nacka');
 await x.fire(x.elements['map-load'],'click');
 const marker=x.cluster.layers.find(x=>x.options.title==='Nacka Strand – Nacka');assert(marker);
 assert.match(marker.popup.children[2].textContent,/10\s942 kr\/mån/);assert(marker.popup.children[2].textContent.includes('13 års kötid'));
 assert.equal(x.L.tiles.url,'https://tile.openstreetmap.org/{z}/{x}/{y}.png');assert(x.L.tiles.options.attribution.includes('OpenStreetMap'));
 assert.equal(x.elements['map-load'].hidden,true);assert(x.fitCalls>0);
 marker.popup.children.at(-1).handlers.click[0]();assert.equal(x.form.kommun.value,'Nacka');assert.equal(x.form.omrade.value,'Nacka Strand');assert.equal(x.calculations,1);assert(x.elements.rakning.scrolled);
});
test('budget, queue and housing filters use the selected type; missing statistics never become zero',async()=>{
 const x=setup();await x.fire(x.elements['map-load'],'click');
 x.elements['map-only-matches'].checked=true;await x.fire(x.elements['map-only-matches'],'change');
 assert(x.cluster.layers.some(x=>x.options.title==='Nacka Strand – Nacka'));
 x.form.maxhyra.value='10000';await x.fire(x.form,'input');assert(!x.cluster.layers.some(x=>x.options.title==='Nacka Strand – Nacka'));
 x.form.maxhyra.value='-1';await x.fire(x.form,'input');assert.equal(x.cluster.layers.length,0);
 x.form.maxhyra.value='12000';x.elements['map-housing'].value='new';x.elements['map-only-matches'].checked=false;await x.fire(x.elements['map-housing'],'change');
 const marker=x.cluster.layers.find(x=>x.options.title==='Nacka Strand – Nacka');assert(marker.popup.children[2].textContent.includes('Köunderlag saknas'));assert(marker.options.icon.className.includes('missing'));
 x.elements['map-only-matches'].checked=true;await x.fire(x.elements['map-only-matches'],'change');assert(!x.cluster.layers.some(x=>x.options.title==='Nacka Strand – Nacka'));
});
test('municipality changes in calculator reframe the map, all-area scope includes other municipalities',async()=>{
 const x=setup();await x.fire(x.elements['map-load'],'click');const fits=x.fitCalls;
 x.form.kommun.value='Norrtälje';x.form.omrade.value='Rimbo';await x.fire(x.form,'change');assert.equal(x.elements['map-municipality'].value,'Norrtälje');assert(x.fitCalls>fits);
 x.elements['map-municipality'].value='';await x.fire(x.elements['map-municipality'],'change');assert(x.cluster.layers.length>200);
});
test('unlocated areas are reported; unavailable map provider leaves calculator usable',async()=>{
 const x=setup({missing:true});await x.fire(x.elements['map-load'],'click');assert(x.elements['map-status'].textContent.includes('Kartläge saknas'));
 const failure=setup({fail:true});await failure.fire(failure.elements['map-load'],'click');assert(failure.elements['map-status'].textContent.includes('kunde inte laddas'));assert.equal(failure.elements['map-load'].disabled,false);assert.equal(failure.cluster,undefined);
});
