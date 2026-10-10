#!/usr/bin/env python3
"""Hämta statistik för exakt 1 och 2 rum under 2025. Python 3, standardbiblioteket.
Rensa .statistics-cache för att hämta om samtliga sidor. Avbrott kan återupptas.
"""
import concurrent.futures
import datetime
import json
import math
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / '.statistics-cache'
CACHE.mkdir(exist_ok=True)
BASE = 'https://bostad.stockholm.se/statistik/data/'
KINDS = {'vanlig': 'Utan nyproduktion', 'ny': 'Endast nyproduktion'}

def get(endpoint, params, key):
    path = CACHE / (key + '.json')
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(3):
        try:
            with urllib.request.urlopen(BASE + endpoint + '?' + urllib.parse.urlencode(params), timeout=50) as response:
                result = json.load(response)
            path.write_text(json.dumps(result, ensure_ascii=False))
            return result
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)

def params(kind, room):
    return dict(year=2025, queue='Bostadskön', area='', buildingType=KINDS[kind], apartmentType='', rooms=room)

def page(task):
    kind, room, group, number = task
    query = params(kind, room)
    query.update(group=group, page=number, sort=2)
    return get('kotid-per-omrade-bostader', query, f'small-{kind}-{room}-{group}-{number}')

areas = get('omraden', dict(year=2025, queue='Bostadskön'), 'areas')
charts = {}
tasks = []
for kind in KINDS:
    for room in (1, 2):
        chart = get('kotid-per-omrade', params(kind, room), f'small-chart-{kind}-{room}')
        charts[kind, room] = chart
        for label, count in zip(chart['labels'], chart['datasets'][0]['data']):
            tasks.extend((kind, room, label['group'], n) for n in range(1, math.ceil(count / 10) + 1))
print(f'{len(tasks)} resultatsidor för 1 och 2 rum.', flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for i, result in enumerate(pool.map(page, tasks), 1):
        if i % 50 == 0 or i == len(tasks):
            print(f'{i}/{len(tasks)} sidor', flush=True)

blank = lambda: dict(vanlig=None, ny=None, antal=0, antalNy=0, hyra=None, hyraNy=None, antalHyra=0, antalHyraNy=0)
kommuner = {a['Kommun'].strip(): {o.strip(): blank() for o in a['Stadsdelar']} for a in areas}
sums, counts, rent_sums, rent_counts = {}, {}, {}, {}
for (kind, room), chart in charts.items():
    for label, count in zip(chart['labels'], chart['datasets'][0]['data']):
        group = label['group']
        for number in range(1, math.ceil(count / 10) + 1):
            result = page((kind, room, group, number))
            assert result['total'] == count, (kind, room, group, 'total')
            assert result['offset'] == (number - 1) * 10, 'offset'
            rows = json.loads(result['objects']) if result['objects'] else []
            assert len(rows) == min(10, count - (number - 1) * 10), 'sidstorlek'
            for row in rows:
                assert row['rum'] == room, 'fel antal rum'
                kommun, omrade = row['kommun'].strip(), row['stadsdel'].strip()
                kommuner.setdefault(kommun, {}).setdefault(omrade, blank())
                key = kommun, omrade, kind
                years = 2025 - int(row['kotid_datum_kort'][:4])
                assert 0 <= years <= 100
                sums[key] = sums.get(key, 0) + years
                counts[key] = counts.get(key, 0) + 1
                rent = row.get('hyra')
                if isinstance(rent, (int, float)) and math.isfinite(rent) and rent > 0:
                    rent_sums[key] = rent_sums.get(key, 0) + rent
                    rent_counts[key] = rent_counts.get(key, 0) + 1
for (kommun, omrade, kind), count in counts.items():
    item = kommuner[kommun][omrade]
    item[kind] = math.floor(sums[kommun, omrade, kind] / count + 0.5)
    item['antal' if kind == 'vanlig' else 'antalNy'] = count
    n = rent_counts.get((kommun, omrade, kind), 0)
    item['antalHyra' if kind == 'vanlig' else 'antalHyraNy'] = n
    item['hyra' if kind == 'vanlig' else 'hyraNy'] = math.floor(rent_sums[kommun, omrade, kind] / n + 0.5) if n else None
# Behåll källans poster, även när lägenhets-ID återkommer, för att följa totalsiffrorna.
meta = dict(ar=2025, kontrollerad=datetime.date.today().isoformat(),
    kalla='https://bostad.stockholm.se/statistik/hyra-och-kotid-per-omrade/',
    metod='Medelvärde av 2025 minus köstartår, avrundat till hela år.',
    hyresmetod='Genomsnittlig månadshyra för samma ettor och tvåor, avrundad till hela kronor.',
    filter=dict(ko='Bostadskön', bostadstyp='Vanlig hyresrätt', rum='1 och 2'),
    totaler={kind: sum(n for key, n in counts.items() if key[2] == kind) for kind in KINDS}, kommuner=kommuner)
(ROOT / 'statistics-2025.js').write_text('// Ettor och tvåor, 2025. null betyder att underlag saknas.\nvar statistik2025 = ' + json.dumps(meta, ensure_ascii=False, indent=2) + ';\n')
print('Kontrollerade totalsiffror:', meta['totaler'], flush=True)
