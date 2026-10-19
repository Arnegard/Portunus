# Aktivera Fråga Portunus

Koden är förberedd för en liten projektbot med förbetalda OpenAI-krediter och **högst 1 000 AI-anrop totalt**. Det är ett livstidstak, inte 1 000 per månad. Ingen påfyllning, inloggning eller kortdebitering sker från Portunus kod.

GitHub Pages fortsätter att visa hemsidan. AI-anropen går genom en separat Cloudflare Worker. Utan konfiguration visar knappen att AI-guiden inte är tillgänglig, medan uträknaren fungerar som vanligt. Backend är avstängd som standard.

## 1. Skapa ett förbetalt API-saldo

1. Öppna [OpenAI API Platform](https://platform.openai.com/) och gå till Billing.
2. Välj förbetalt saldo och börja med ett mindre belopp, exempelvis 5 USD. Kontrollera slutbelopp och eventuell moms innan köp.
3. **Stäng av automatisk påfyllning/Auto recharge.** Ett ChatGPT-abonnemang är separat från API-krediterna.
4. Skapa ett separat API-projekt för Portunus och en API-nyckel. Använd den bara för denna bot.
5. Ange även en låg utgiftsgräns i projektet om kontot erbjuder det. Användningsgränser och kreditavstängning kan ha fördröjning; vår egen räknare är därför ett extra skydd, inte ett löfte om exakt slutdebitering i kronor.

**Klistra aldrig in API-nyckeln i GitHub, `bot-config.js`, en skärmbild eller chatten.** Den ska endast anges som hemlighet i backend enligt steg 3.

API-kostnaden baseras på textmängd, inte ett fast pris per fråga. Köpta krediter kan ha giltighetstid och regler om återbetalning. Kontrollera villkoren i kassan. Backendhosting och andra API-projekt ingår inte i Portunus anropstak.

## 2. Skapa Cloudflare-konto och Turnstile

1. Öppna [Cloudflare](https://dash.cloudflare.com/). Välj gratisnivå för Workers om den passar ditt konto och gällande kvoter. Inget betalt hostingabonnemang behövs i koden.
2. Öppna Turnstile och skapa en hanterad/Managed widget.
3. Tillåt värdnamnet **`arnegard.github.io`** (inget `https://`, inget `/Portunus/`).
4. Du får en **site key** (publik) och en **secret key** (hemlig). Den hemliga nyckeln får aldrig läggas i repot.

## 3. Driftsätt backend

Ladda ned eller klona repot efter att ändringen har slagits ihop. Installera en aktuell Node.js-version som stöds av Wrangler. I terminalen, från repots rot:

```sh
cd backend
npm ci
npx wrangler login
npm run deploy
```

Inloggningen gör du själv i din webbläsare. Första driftsättningen skapar backend och dess räknare, men **botten är fortfarande avstängd**. Byt inte namn på Worker, Durable Object-klassen eller bindningen. De identifierar det beständiga taket.

Lägg sedan in hemligheterna via terminalens dolda inmatning:

```sh
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put RATE_LIMIT_SALT
```

De två första är nycklarna från OpenAI och Turnstile. `RATE_LIMIT_SALT` är en egen slumpmässig hemlighet på minst 32 tecken. Skapa den med en lösenordshanterare. Dela den inte och återanvänd inte din API-nyckel som salt.

I `backend/wrangler.jsonc`:

- Ange Turnstiles **publika** site key i `TURNSTILE_SITE_KEY`.
- Ändra `BOT_ENABLED` från `"false"` till `"true"`.
- Behåll `ALLOWED_ORIGIN` som `https://arnegard.github.io`.

Kör `npm run deploy` igen. Ta Worker-adressen som Wrangler visar och ange den i **repots** `bot-config.js`:

```js
window.PORTUNUS_BOT = { endpoint: 'https://DIN-FAKTISKA-WORKER-ADRESS' };
```

Använd den riktiga HTTPS-adressen utan extra sökväg. Detta är en publik adress, inte en nyckel. Pusha konfigurationsändringen till GitHub så att Pages publicerar den. Ändring av backendens publika konfiguration i repot kräver också en ny `npm run deploy` för att gälla i Cloudflare.

## 4. Kontrollera en riktig fråga

1. Öppna hemsidan och fyll i ålder, kötid och eventuell maxhyra.
2. Klicka **Fråga Portunus – AI-guide** längst ned till höger.
3. Läs informationen, godkänn att frågan och formulärvalen skickas och slutför robotkontrollen.
4. Ställ en kort fråga, till exempel ”Vad betyder mitt resultat?”, ”Vilka områden passar mina val?” eller ”Jämför mitt val med Orminge – vad vinner jag på att välja billigare?”. Namngivna områden inom sökomfånget kan jämföras utan att ändra formuläret.
5. Kontrollera API-förbrukningen i OpenAI och att automatisk påfyllning fortfarande är avstängd.

Detta är första riktiga AI-testet och förbrukar ett anrop. Utvecklingstesterna använder simulerade svar; de visar inte kvaliteten på riktiga modelltexter.

## Hur skydden fungerar

- Modell: `gpt-4.1-mini-2025-04-14`. Ett enda Responses API-anrop per godkänd fråga. Inga automatiska omförsök, externa verktyg, webbsökningar eller anropsloopar.
- Frågan får vara högst 800 tecken, HTTP-kroppen högst 8 KiB och modellsvaret högst 400 genererade tokens. Kontexten innehåller formulärvalen, en bedömning av valt område, en sammanräkning inom sökomfånget, statistik för högst tolv områden samt högst tre jämförelsekort. Valt område, områden som nämns i frågan och kortens områden prioriteras i underlaget. Urvalet är inte en fullständig lista över alla områden.
- Högst fem frågor/minut och tjugo/dygn per session. Extra IP-gräns: tjugo/minut och hundra/dygn. Gränserna kombineras med Turnstile, vars värdnamn och action kontrolleras på servern. Samma wifi kan därför påverka flera användare.
- CORS begränsar webbläsaranrop till rätt ursprung men är **inte** ett autentiseringsskydd på egen hand.
- En gemensam Durable Object gör en beständig transaktion före varje AI-anrop. Vid 1 000 reservationer tillåts inga fler, även efter omstart, deploy eller nytt datum. Högst tre aktiva reservationer samtidigt; övergivna reservationer löper ut men deras använda anrop återbetalas aldrig.
- Ett misslyckat eller avbrutet AI-anrop räknas också eftersom det kan ha kostat pengar. Botten kan därför stänga innan tusen lyckade svar har levererats.
- Om räknaren eller botskyddet inte går att kontrollera stoppas anropet. Vid tomt saldo, vissa utgiftsgränser eller felaktig API-nyckel pausas backend dessutom beständigt så att misslyckade betalningsanrop inte upprepas.
- Gränsen gäller denna Worker och detta lagringsutrymme, inte andra program som använder API-nyckeln. Radera inte Durable Object-data, byt inte dess identitet eller återställ äldre lagring. Det skulle kunna återställa räknaren. Det finns ingen publik återställningsknapp eller administratörsroute.

## Statistik, svar och integritet

Backend bygger en egen kontrollerad kopia av `statistics-2025.js` vid deploy. Uppdateras statistiken måste backend också driftsättas på nytt. Koden skickar inte klientens påstådda hyror eller färdiga förslag till AI:n. Belopp, kötider och underlag i korten kommer från backendens egna data. AI:n förklarar med kort text utan siffror; numeriska eller felaktigt formaterade textsvar ersätts av en neutral förklaring. Det eliminerar inte alla möjliga fel i AI-texten.

Jämförelsen behåller det valda området som första kort om det finns kö- och hyresunderlag inom budget, även om andra områden är billigare. Kötid över den egna visas som beräknad återstående kötid, inte som en omedelbar matchning. Övriga kort prioriterar namngivna områden och jämför sedan hyra och historisk kötid i olika områden. Alternativ vars snitt redan nås av egen kötid prioriteras, och underlag på minst tio bostäder föredras när sådana alternativ finns. Ett område visas högst en gång, med den bostadstyp som rankas först. Det gör listan till en jämförelse, inte en fullständig förteckning över bostadstyper.

Korten visar budgetmarginal, skillnad mellan egen kötid och historiskt snitt samt skillnader mot det valda området när det finns ett jämförbart kort. Dessa beräkningar görs av servern, inte av AI:n. AI-texten ska bedöma valt område först och förklara avvägningar snarare än bara räkna upp förslagen. Om vald snitthyra är över budget eller underlag saknas får modellen ändå bedömningen så att den kan förklara varför området inte får ett kort. Saknad statistik om nyproduktion betyder inte att det saknas nybyggda bostäder eller lediga annonser.

Botten är en hjälp till det befintliga formuläret, inte en chatt som ändrar dina val automatiskt. Varje fråga är fristående. Bromma kan nämnas i frågan för att avgränsa till de Brommaområden vi har, inom valt kommunsök. Inga lediga annonser eller aktuella hyror hämtas.

Portunus sparar inte frågan, svaret eller formulärvalen på servern. `store: false` används för OpenAI-anropet. Det innebär **inte** att externa leverantörer aldrig behandlar eller behåller uppgifter för exempelvis drift och missbruksövervakning. Se [OpenAI:s datadokumentation](https://developers.openai.com/api/docs/guides/your-data/) och Cloudflares villkor.

Cloudflare ser besökarens IP-adress och frågan under behandlingen. OpenAI får frågan och de formulärval som behövs för hjälpen, men inte IP-adressen eller sessions-ID:t från vår kod. Begränsningsräknarna lagrar dagsbundna HMAC-hashar av IP och session, inte råa IP-adresser. Dessa hashade räknare rensas med larm efter ungefär två dygn. Endast totalräknaren ligger kvar permanent. Backendens applikationsloggning är avstängd och koden loggar inga frågor eller nycklar.

## Pausa och fortsätta

Ändra `BOT_ENABLED` till `"false"` och deploya för att pausa manuellt. Uträknaren fortsätter fungera. Sätt även `endpoint` till tom sträng i `bot-config.js` om chattrutan inte ska kontakta backend alls.

Om den permanenta gränsen har nåtts ska botten förbli pausad. Att medvetet höja gränsen eller återuppta efter beständig betalningspaus kräver en separat granskad kod-/lagringsändring av ägaren. Att bara fylla på saldo eller deploya på nytt nollställer inte räknaren eller den beständiga betalningspausen.

## Tester utan AI-kostnad

Från repots rot:

```sh
node backend/build-data.mjs
node --test tests/bot-backend.mjs tests/bot-ui.cjs
node tests/calculator.cjs
cd backend
npm ci
npm run check
```

Backendtesterna verifierar bland annat att reservation nummer 1 001 nekas, att samtidiga anrop inte överskrider taket, att ingen automatisk omförsökning görs, att betalningsfel pausar botten och att fel i lagring stoppar anrop. UI-testernas nätverksanrop är simulerade. Wrangler-kommandot är en dry run och publicerar inte en Worker. Riktig AI- och Turnstile-kvalitet, kontots faktiska kvoter samt visuell kontroll på mobil måste kontrolleras vid aktivering.

Regressionstest för områdesjämförelsen: ålder 31, kötid 13, maxhyra 12 000, Nacka → Nacka Strand, endast vald kommun. För ”Vilka områden passar mina val?” ska Nacka Strand finnas först, med 1 058 kr/mån i budgetmarginal. Orminge ska visa 2 964 kr/mån lägre snitthyra jämfört med Nacka Strand. Efter deploy behöver ett riktigt svar också kontrolleras: texten ska bekräfta att Nacka Strand ryms i de historiska snitten och förklara alternativen, utan att lova en lägenhet. De automatiska testerna verifierar beräkningarna och modellens underlag, inte modellens faktiska ordval.
