# Portunus

En kötidsräknare som uppskattar din ålder när du kan få en hyresrätt, utifrån områdesstatistik för 2025.

## Öppna hemsidan

[Öppna Portunus](https://arnegard.github.io/Portunus/), eller skanna QR-koden med mobilens kamera:

[![QR-kod till Portunus hemsida](Portunus-QR.png)](https://arnegard.github.io/Portunus/)

QR-koden leder till **https://arnegard.github.io/Portunus/**.

## Statistik

Läs om underlaget och hur det uppdateras i [STATISTICS.md](STATISTICS.md).

## Jämför två områden

Öppna **Jämför med ett annat område** under uträknarens resultat. Det vänstra kortet följer senaste giltiga uträkningen; välj kommun och område separat för det högra. Bostadstypen gäller båda korten. Jämförelsen visar historisk kötid, snitthyra, skillnaden mot egen kötid och antal bostäder, samt hyresmarginal om maxhyra är angiven. Nyproduktion med saknad statistik får ingen gissad siffra. En kort sammanfattning visar skillnaderna och små underlag markeras.

En ny giltig uträkning uppdaterar det första området och personliga värden men behåller det andra områdesvalet. På mobil staplas korten. Inga nya AI-anrop eller externa datakällor används. Kör `node --test tests/comparison.cjs` och `node tests/calculator.cjs` för data- och beräknarkontroller.

## Områdeskarta

Utforska de 237 områdena på kartan och tryck på en markör för snitthyra och kötid. Filtrera på kommun, bostadstyp eller uträknarens kötid och maxhyra. Knappen i områdets ruta väljer området i uträknaren. Lägena är ungefärliga; se [MAP.md](MAP.md) för geodata, licenser och tester.

## AI-guide

Projektbotten kan aktiveras med förbetalda API-krediter och ett permanent tak på 1 000 AI-anrop. Se [AI-GUIDE.md](AI-GUIDE.md) för konton, säker nyckelhantering och driftsättning. Den är avstängd tills backend och den publika backendadressen är konfigurerade.
