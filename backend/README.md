# Portunus AI-backend via Cloudflares dashboard

Fullständig guide för saldo, nycklar, integritet och användningsgränser finns i [AI-GUIDE.md](../AI-GUIDE.md).

## Koppla den befintliga Workern till GitHub

Workern heter `portunus-ai`. I Cloudflare: öppna den och gå till **Settings → Builds → Git repository → GitHub**. Välj `Arnegard/Portunus` och använd:

| Inställning | Värde |
|---|---|
| Production branch | `main` |
| Disable builds | Avstängt |
| Build command | `npm ci` |
| Deploy command | `npm run deploy` |
| Enable Preview builds | Avmarkerat |
| Advanced settings → Path | `backend` |
| API token | Låt Cloudflare skapa sin egen byggtoken |

Lämna byggdialogens extra variabler tomma. Hemliga API-nycklar ska läggas in som **runtime Secrets** på Workern, inte i GitHub eller som publik frontendkonfiguration. Begränsa GitHub-appen till endast Portunus.

Om GitHub-knappen bara öppnar den redan installerade appens inställningar, trots rätt repoåtkomst, beskriver [Cloudflare en ominstallation av GitHub-appen](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/#reinstall-the-cloudflare-github-app) som ett möjligt felsökningssteg.

## Första publiceringen

Att koppla ett redan befintligt repo startar inte nödvändigtvis ett bygge direkt. En ny commit på `main` ska starta Workers Builds. Kontrollera byggloggen och sedan **Deployments**; att Hello World har status Ready visar bara att exemplet fungerar. GitHub Pages publicering är separat från Workerns.

Bygget installerar låsta beroenden från `package-lock.json`. `wrangler deploy` kör `build-data.mjs`, paketerar den kontrollerade statistiken och skapar Durable Object-bindningen och SQLite-lagringen via migrationen i `wrangler.jsonc`.

## Nycklar och aktivering efter lyckat bygge

Backend är avstängd med `BOT_ENABLED=false` tills konfigurationen är klar. Spara följande som runtime Secrets under Workerns Settings:

- `OPENAI_API_KEY`: projektets OpenAI-nyckel.
- `TURNSTILE_SECRET_KEY`: Turnstiles hemliga nyckel.
- `RATE_LIMIT_SALT`: egen slumpmässig hemlighet, minst 32 tecken.

Turnstiles **publika** site key ska anges i `TURNSTILE_SITE_KEY` i `wrangler.jsonc`. När alla hemligheter finns kan `BOT_ENABLED` ändras till `true` i samma fil och ändringen publiceras genom en ny commit/deploy. Publika variabler som anges i Wrangler-filen ska hanteras där, så att nästa GitHub-bygge inte skriver över ändringar som enbart gjorts i dashboarden.

Ange därefter den riktiga Worker-adressen i `bot-config.js`. Ägaren genomför första riktiga frågan och kontrollerar debiteringen. Inga hemligheter ska skickas i chatten.

## Bevara anropstaket

Behåll Worker-namnet `portunus-ai`, Durable Object-klassen/bindningen och objektidentiteten `portunus-lifetime-v1`. Radera eller återställ inte räknarens lagring. Den ska ligga kvar mellan byggen och datumbyten. Det permanenta taket är 1 000 reservationer totalt, inklusive misslyckade AI-anrop, och det fylls aldrig på automatiskt.
