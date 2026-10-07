# Statistik för 2025

Beräknaren använder Bostadsförmedlingens offentliga [detaljstatistik](https://bostad.stockholm.se/statistik/hyra-och-kotid-per-omrade/).

- År: 2025. Kö: Bostadskön. Bostadstyp: Vanlig hyresrätt. Antal rum: Alla.
- Befintliga bostäder och nyproduktion hämtas separat.
- Kommun och område följer källans indelning för 2025. Stockholms stadsdelar ligger under kommunen Stockholm; exempelvis finns Norrmalm och Östermalm separat. Brommas enskilda områden ligger också under Stockholm.
- Kötiden för varje förmedling beräknas som **2025 minus köstartåret**. Medelvärdet avrundas till närmaste hela år. Det är en kalenderårsapproximation och kan skilja sig från källans officiella medelkötid beräknad med exakta datum.
- `null` betyder att underlag saknas med dessa filter. Det betyder inte noll års kötid. Underlaget visas som antal förmedlade bostäder. Färre än 10 i en kategori markeras som litet underlag.
- Uppskattningen är historisk statistik och ingen garanti för framtida bostad.

## Uppdatera underlaget

Kör `python3 scripts/update_statistics.py`. Ingen tredjepartsinstallation krävs. Scriptet hämtar områdeslistan, samtliga kötidsintervall (inklusive 20 år eller mer) och samtliga resultatsidor. Antal poster kontrolleras mot källans totalsiffror och varje sidas offset och storlek kontrolleras innan filen skrivs.

Hämtningen kan ta flera minuter. Resultatsidor sparas tillfälligt i `.statistics-cache` så att en avbruten hämtning kan återupptas. Rensa den katalogen för en fullständig ny hämtning. Cachen ska inte checkas in. Källans poster behålls även när samma lägenhets-ID förekommer flera gånger, så att antalet stämmer med dess totalsiffror. Endast aggregerade snitt och antal publiceras i `statistics-2025.js`, inga adresser eller individuella ködatum.

`index.html` och `statistics-2025.js` måste ligga i samma katalog tillsammans med `grand.jpg`. Sidan fungerar på GitHub Pages och genom att öppna HTML-filen lokalt.
