#!/usr/bin/env python3
"""Hämta alla statistikposter för 2025 och uppdatera statistics-2025.js.
Kräver Python 3, använder endast standardbiblioteket. Rensa .statistics-cache
om du vill hämta om redan sparade resultatsidor. Kör från valfri katalog.
"""
import urllib.request,urllib.parse,json,time,math,concurrent.futures,pathlib
BASE='https://bostad.stockholm.se/statistik/data/'
ROOT=pathlib.Path(__file__).resolve().parent.parent
CACHE=ROOT/'.statistics-cache'; CACHE.mkdir(exist_ok=True)
def get(endpoint,params,key):
 f=CACHE/(key+'.json')
 if f.exists():return json.loads(f.read_text())
 for attempt in range(3):
  try:
   with urllib.request.urlopen(BASE+endpoint+'?'+urllib.parse.urlencode(params),timeout=60) as r: x=json.load(r)
   f.write_text(json.dumps(x,ensure_ascii=False));return x
  except Exception:
   if attempt==2:raise
   time.sleep(2)
def params(kind):return dict(year=2025,queue='Bostadskön',area='',buildingType=kind,apartmentType='',rooms='')
def chart(kind,name):return get('kotid-per-omrade',params(kind),'chart-'+name)
def page(task):
 name,kind,group,num=task
 p=params(kind);p.update(group=group,page=num,sort=2)
 x=get('kotid-per-omrade-bostader',p,f'{name}-{group}-{num}');return task,x
areas=get('omraden',dict(year=2025,queue='Bostadskön'),'areas')
(ROOT/'.statistics-cache'/'areas-2025.json').write_text(json.dumps(areas,ensure_ascii=False))
kinds=[('vanlig','Utan nyproduktion'),('ny','Endast nyproduktion')]
charts={name:chart(kind,name) for name,kind in kinds}
tasks=[]
for name,kind in kinds:
 for label,count in zip(charts[name]['labels'],charts[name]['datasets'][0]['data']):
  for n in range(1,math.ceil(count/10)+1):tasks.append((name,kind,label['group'],n))
print('Pages:',len(tasks),'counts:',{n:sum(c['datasets'][0]['data']) for n,c in charts.items()},flush=True)
completed=0;start=time.time();last=start
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for task,x in pool.map(page,tasks):
  completed+=1
  if time.time()-last>30 or completed==len(tasks):
   print(f'{completed}/{len(tasks)} pages; {int(time.time()-start)} seconds',flush=True);last=time.time()
# Strict pagination validation and aggregate only minimal fields.
rows={n:[] for n,k in kinds}
for name,kind in kinds:
 for label,count in zip(charts[name]['labels'],charts[name]['datasets'][0]['data']):
  group=label['group'];items=[]
  for num in range(1,math.ceil(count/10)+1):
   x=page((name,kind,group,num))[1];assert x['total']==count,(name,group,x['total'],count)
   assert x['offset']==(num-1)*10,(name,group,num,x['offset'])
   batch=json.loads(x['objects']) if x['objects'] else []
   assert len(batch)==min(10,count-(num-1)*10),(name,group,num,len(batch))
   items.extend(batch)
  assert len(items)==count
  rows[name].extend(items)
for name,items in rows.items():
 # Källan kan innehålla flera poster för samma lägenhets-ID.
 # Behåll källans poster så att underlaget stämmer med dess totalsiffror.
 allrows=[]
 for x in items:
  y=int(x['kotid_datum_kort'][:4]);assert 0<=2025-y<=100
  allrows.append(dict(kommun=x['kommun'],omrade=x['stadsdel'],startar=y,hyra=x.get('hyra'),id=x['lagenhet_id']))
 (CACHE/('minimal-'+name+'.json')).write_text(json.dumps(allrows,ensure_ascii=False))
print('Validated all page offsets, sizes and totals.',flush=True)

import json,math,datetime
from pathlib import Path
areas=json.loads((CACHE/'areas-2025.json').read_text())
kommuner={a['Kommun'].strip():{o.strip():dict(vanlig=None,ny=None,antal=0,antalNy=0,hyra=None,hyraNy=None,antalHyra=0,antalHyraNy=0) for o in a['Stadsdelar']} for a in areas}
sums={};counts={};rent_sums={};rent_counts={}
for category in ['vanlig','ny']:
 rows=json.loads((CACHE/('minimal-'+category+'.json')).read_text())
 for row in rows:
  kommun,omrade=row['kommun'].strip(),row['omrade'].strip()
  kommuner.setdefault(kommun,{}).setdefault(omrade,dict(vanlig=None,ny=None,antal=0,antalNy=0,hyra=None,hyraNy=None,antalHyra=0,antalHyraNy=0))
  key=kommun,omrade,category;sums[key]=sums.get(key,0)+2025-row['startar'];counts[key]=counts.get(key,0)+1
  rent=row.get('hyra')
  if isinstance(rent,(int,float)) and math.isfinite(rent) and rent>0:
   rent_sums[key]=rent_sums.get(key,0)+rent;rent_counts[key]=rent_counts.get(key,0)+1
 for (kommun,omrade,cat),n in counts.items():
  kommuner[kommun][omrade][cat]=math.floor(sums[(kommun,omrade,cat)]/n+0.5)
  kommuner[kommun][omrade]['antal' if cat=='vanlig' else 'antalNy']=n
  rent_count=rent_counts.get((kommun,omrade,cat),0)
  kommuner[kommun][omrade]['antalHyra' if cat=='vanlig' else 'antalHyraNy']=rent_count
  kommuner[kommun][omrade]['hyra' if cat=='vanlig' else 'hyraNy']=math.floor(rent_sums[(kommun,omrade,cat)]/rent_count+0.5) if rent_count else None
meta=dict(ar=2025,kontrollerad=datetime.date.today().isoformat(),kalla='https://bostad.stockholm.se/statistik/hyra-och-kotid-per-omrade/',metod='Medelvärde av 2025 minus varje bostads köstartår, avrundat till närmaste hela år.',hyresmetod='Medelvärde av annonserad månadshyra för samma förmedlade bostäder, alla storlekar, avrundat till hela kronor. Saknade eller ogiltiga hyresbelopp räknas inte.',filter=dict(ko='Bostadskön',bostadstyp='Vanlig hyresrätt',rum='Alla'),totaler={cat:sum(n for key,n in counts.items() if key[2]==cat) for cat in ['vanlig','ny']},kommuner=kommuner)
(ROOT/'statistics-2025.js').write_text('// Genererad från Bostadsförmedlingens offentliga detaljstatistik.\n// null betyder att underlag saknas, inte noll års kötid eller noll kronor i hyra.\nvar statistik2025 = '+json.dumps(meta,ensure_ascii=False,indent=2)+';\n')
print('Municipalities:',len(kommuner),'areas:',sum(map(len,kommuner.values())),'totals:',meta['totaler'])
for name in ['Farsta','Södermalm','Vällingby','Östermalm','Norrmalm']:print(name,kommuner['Stockholm'][name])
for name in ['Fisksätra','Nacka Strand']:print(name,kommuner['Nacka'][name])
