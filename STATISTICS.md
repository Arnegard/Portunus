# Statistik och områdesförslag

Data kommer från Bostadsförmedlingens [detaljstatistik](https://bostad.stockholm.se/statistik/hyra-och-kotid-per-omrade/).

- År: 2025. Kö: Bostadskön. Bostadstyp: Vanlig hyresrätt.
- Endast **exakt 1 eller 2 rum** ingår i både kötid och hyra. Halvrum och större lägenheter ingår inte. Ettor och tvåor räknas tillsammans; varje förmedlad post väger lika, inte varje rumsstorleks medelvärde.
- Befintliga bostäder och nyproduktion beräknas separat. Alla kommuner och områden i källans områdeslista finns kvar även när dessa filter ger noll bostäder.
- Kötid: medelvärdet av 2025 minus varje posts köstartår, avrundat till närmaste hela år. Det är en kalenderårsapproximation som kan skilja sig från exakta datumkötider.
- Hyra: medelvärdet av månadshyrorna i samma poster, avrundat till hela kronor. Ogiltiga eller saknade hyror utesluts; separat hyresantal visas när det skiljer sig från kötidsunderlaget.
- `null` betyder saknat underlag, inte 0 års kötid eller 0 kr i hyra. Färre än 10 bostäder markeras som litet underlag.
- Beloppen är historiska hyror för 2025, inte dagens annonser. Ingen bostad eller framtida kötid garanteras.

## Områdesförslag

Besökaren kan ange valfri maxhyra och söka i vald kommun eller alla kommuner. Förslag tas fram lokalt i webbläsaren utan AI eller överföring av ålder, kötid eller budget.

En områdes- och bostadstyp tas med när kötid och hyra finns, antalet bostäder är positivt och den avrundade snitthyran är högst budgeten. Återstående kötid beräknas som `max(områdets kötid − egen kötid, 0)`. Förslagen sorteras efter:

1. Minst återstående kötid.
2. Vid lika tid: minst 10 bostäder i både kö- och hyresunderlag före små underlag.
3. Lägre snitthyra, därefter fler bostäder och slutligen alfabetisk ordning.

Högst sex förslag visas. Befintliga bostäder och nyproduktion i samma område kan visas som två alternativ. Om egen kötid når snittet skriver sidan just det; det innebär inte att besökaren kan få en bostad direkt. En snitthyra inom budget innebär inte att varje bostad i området är inom budget. Tom budget ger inga förslag. Inga matchningar ger ett tydligt meddelande och inga förslag över budget.

## Återskapa data

Kör `python3 scripts/update_statistics.py` (endast Python 3:s standardbibliotek behövs). Scriptet hämtar rumsfiltren 1 och 2 separat, båda fastighetstyperna, samtliga kötidsintervall inklusive 20 år eller mer och samtliga resultatsidor. Varje posts rumsantal, sidstorlek, offset och totalsiffror kontrolleras före aggregeringen. Resultatsidor sparas i `.statistics-cache` så att hämtningen kan återupptas. Rensa katalogen för att hämta om allt. Cachen ska inte checkas in.

Källans poster behålls även när samma lägenhets-ID återkommer så att antalet följer källans totalsiffror. Bara aggregerade snitt och antal publiceras, inte adresser eller individuella ködatum.

`index.html`, `statistics-2025.js` och `grand.jpg` ligger i samma katalog. Sidan fungerar på GitHub Pages och genom att öppna HTML-filen lokalt.
