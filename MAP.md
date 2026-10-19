# Områdeskartan

Kartan visar ett ungefärligt läge för vart och ett av de 237 områdena i `statistics-2025.js`. Punkterna är orienteringshjälp, inte officiella områdesgränser, adresser för förmedlade lägenheter eller aktuella annonser. Bostadsförmedlingens områdesnamn kan avse ett större eller annorlunda område än geodatakällans namn.

## Användning

- Välj kommun eller alla kommuner och befintliga bostäder eller nyproduktion.
- Tryck på en markör för historisk snitthyra, kötid och observationstal. Grupperade markörer visar antal områden och zoomas upp vid val.
- **Bara områden inom mina val** jämför den valda bostadstypens snitt med uträknarens egen kötid och eventuell maxhyra. Utan maxhyra filtreras endast egen kötid. Ogiltiga ålders-/kö-/budgetvärden får inga matchningar.
- Grönt betyder att egen kötid når snittet och att snitthyran ryms om budget angetts. Orange är övriga områden med jämförbart underlag och grått saknade kö- eller hyresuppgifter. Färgerna betyder inte att det finns en ledig bostad.
- **Välj i uträknaren** ändrar kommun och område och räknar om med besökarens befintliga ålder, kötid och budget. Att bara utforska kartan ändrar inte formulärvalen.
- Kommunbyte i uträknaren uppdaterar kartans kommun och utsnitt. Budget-/köändringar uppdaterar färger och filter. Bakgrundskartan fångar inte sidans mushjulsskroll; använd plus och minus för zoom.

Om kartans leverantörer inte kan nås finns alla områden kvar i uträknaren. Saknas en koordinat efter en framtida statistikuppdatering visas antalet saknade lägen för urvalet. Ingen kommunmittpunkt används tyst som ersättning för ett okänt områdesläge.

## Geodata och attribution

`map-locations.js` innehåller endast lägespunkter och källreferenser. Hämtat och sammanställt 2026-10-19. Varje post anger en av följande referenser:

- `geonames`: GeoNames-id. 179 punkter från [Sveriges nedladdningsfil](https://download.geonames.org/export/dump/SE.zip), [format och licens](https://download.geonames.org/export/dump/readme.txt). GeoNames data används under **CC BY 4.0**. Namn matchades inom rätt kommun; koordinater har avrundats och knutits till statistikens områdesnamn.
- `wikipedia`: titel för 33 koordinatsatta artiklar på svenskspråkiga Wikipedia, lästa via MediaWiki API. Titlar och eventuella omdirigeringar kontrollerades mot områdesnamn och kommun. Endast koordinatfakta återges, ingen artikeltext. Artiklar finns på `https://sv.wikipedia.org/wiki/TITEL`.
- `wikidata`: Wikidata-id för tre punkter med koordinatpåståendet **P625**, under **CC0**. Se `https://www.wikidata.org/wiki/ID`.
- `osm`: OpenStreetMap-objekt för 22 punkter, lästa via [Photon](https://github.com/komoot/photon) i en begränsad engångskomplettering. Resultat hämtades en i taget med paus och granskades innan användning. OSM-delen är tillgänglig under **ODbL** med attribution till OpenStreetMap-bidragsgivarna. Se `https://www.openstreetmap.org/OBJEKTTYP/ID` och [licensinformationen](https://www.openstreetmap.org/copyright).

En del lägen representeras av en lokal hållplats, skola, väg eller annat orienteringsmärke i området, inte ett beräknat geografiskt centrum. `sourceName` och `positionType` anger sådana kompletteringar. Exempel är Källbrinksskolan för Källbrink, Kafé Väsjön för området kring Väsjön, Rubingatan för Bryggårdsgärdet, Värdsholmsgatan för Värdsholmen och Edsby allé för Eds allé. Dessa ska alltid betraktas som ungefärliga orienteringspunkter.

Kommunala och lokala beskrivningar användes också för att kontrollera ortkopplingarna, bland annat [Övre Bryggårdsgärdet](https://www.norrtalje.se/info/bygga-bo-miljo/norrtalje-vaxer/norrtalje-stad/ovre-bryggardsgardet/om-ovre-bryggardsgardet/), [Västra Eds Allé](https://www.upplandsvasby.se/vastraed) och [Gustavsbergs områden](https://varmdobo.se/artikel/gustavsberg). Punkter är inte exakta nog för fastighetsfrågor eller en ranking av avstånd till innerstan.

## Kartbibliotek och nätverk

Leaflet **1.9.4** och Leaflet.markercluster **1.5.3** hämtas från unpkg först när kartsektionen närmar sig skärmen eller besökaren väljer **Visa kartan**. Biblioteksfilerna har versionslåsning och SHA-256-integritetskontroller. Biblioteken är öppna under BSD-2-Clause respektive MIT; de distribueras av CDN:n med respektive paketlicens.

Bakgrunden kommer från `https://tile.openstreetmap.org/{z}/{x}/{y}.png` med synlig attribution. Ingen förhämtning av offlinekartor, service worker eller cachebrytning görs. Webbläsarens normala cache- och Referer-beteende behålls. Se [OSM:s tile-policy](https://operations.osmfoundation.org/policies/tiles/).

Besökarens formulärvärden behandlas lokalt för färger och filter. Ingen platsbehörighet begärs och inga AI-anrop görs för kartan. Kartleverantör och CDN ser normala webbförfrågningar, som IP-adress och kartutsnitt. Ingen geokodning görs från besökarnas webbläsare; koordinaterna är redan sparade i repot. Den publika Nominatim-tjänsten används inte.

## Kontroller

```sh
node --test tests/area-map.cjs tests/bot-backend.mjs tests/bot-ui.cjs
node tests/calculator.cjs
```

Karttesterna kontrollerar koordinattäckning och källreferenser, kommunfilter, budget-/kögränser, nyproduktion utan underlag, överföring till uträknaren, ändrat utsnitt vid kommunbyte samt nätverksfel. Kartbiblioteket simuleras i dessa tester; de ersätter inte kontroll av den riktiga kartans utseende, externa kartplattor eller mobilgester efter publicering.

Vid nya statistikområden: lägg endast in en lägespunkt med granskad källreferens. Kontrollera särskilt namn som återkommer i flera kommuner och använd aldrig ett första geokodningssvar utan ortkontroll.
