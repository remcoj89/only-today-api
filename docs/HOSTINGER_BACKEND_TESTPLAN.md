# Hostinger backend testplan (production check)

Gebruik dit stappenplan om te controleren of je API op Hostinger correct draait.

## 1) Basis: process + build

1. Controleer in hPanel dat je app status **Running** is.
2. Controleer build/start commands:
   - Build: `npm ci && npm run build`
   - Start: `npm start`
3. Controleer of Node-versie LTS is (bijv. 20.x of 22.x).

## 2) Environment variabelen

Zorg dat minimaal deze variabelen gezet zijn:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `NODE_ENV=production`
- `PORT` (indien Hostinger dit vereist)

## 3) Smoke test (publieke endpoint)

Voer vanaf je laptop uit:

```bash
curl -i https://<jouwdomein>/health
```

Verwacht:
- HTTP `200`
- body: `{"status":"ok"}`

Als dit faalt:
- check runtime logs in hPanel,
- check of app op juiste poort luistert,
- check of reverse proxy correct naar Node app routeert.

## 4) Auth test (beschermde endpoint)

Gebruik een geldige bearer token:

```bash
curl -i https://<jouwdomein>/protected \
  -H "Authorization: Bearer <access_token>"
```

Verwacht:
- HTTP `200`
- body bevat `userId`.

Negatieve test zonder token:

```bash
curl -i https://<jouwdomein>/protected
```

Verwacht:
- HTTP `401`

## 5) API route test (core business endpoint)

Test minimaal 1 echte route die je app gebruikt (bijv. `/auth`, `/days`, `/periods`, `/documents`).
Controleer:
- juiste statuscode,
- correcte validatiefouten bij ongeldige payload,
- succesvolle persist in Supabase/Postgres.

## 6) Database/migraties

Na deploy:

```bash
npm run migrate
```

Controleer in DB:
- tabel `schema_migrations` bevat alle SQL bestanden,
- nieuwe tabellen/kolommen bestaan,
- API werkt met de nieuwste schemawijzigingen.

## 7) CORS verificatie (frontend domein)

Test vanaf je frontend-URL in browser devtools:
- preflight OPTIONS succesvol,
- geen CORS blocked requests.

Als je meerdere domeinen hebt, test ze allemaal (prod + staging).

### Als je deze fout ziet

`No "Access-Control-Allow-Origin" header is present on the requested resource`.

Dan is in de praktijk meestal één van deze oorzaken actief:

1. Het request komt niet bij je Node app terecht (reverse proxy/CDN/WAF blokkeert `OPTIONS`).
2. Je endpoint URL wijst naar de verkeerde service of route.
3. Je frontend stuurt `credentials: "include"` maar de backend/proxy CORS headers zijn daar niet op ingesteld.

Snelle diagnose:

```bash
curl -i -X OPTIONS 'https://api.jouwdomein.nl/auth/login' \
  -H 'Origin: http://localhost:4321' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Verwacht minimaal in response headers:
- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods`
- `Access-Control-Allow-Headers`

Zie je een `403` van proxy/server (bijv. `envoy`, `nginx`, `cloudflare`) zonder CORS headers, dan moet je Hostinger/proxy laag `OPTIONS` toelaten en doorsturen naar je app.

## 8) Scheduler/cron gedrag

Deze API start intern jobs op process-start.
Controleer in logs dat jobs niet dubbel lopen als je meerdere instances hebt.

Aanpak:
- slechts 1 instance jobs laten draaien (of extern cron gebruiken),
- check logpatronen per minuut/dag op duplicaten.

## 9) Observability checklist

Controleer minimaal:
- error logs (geen crash loops),
- 5xx percentage,
- response time p95,
- uptime monitor op `/health` (bijv. elke 1 min).

## 10) E2E release-acceptatie (aanbevolen)

Run deze flow handmatig na elke deploy:

1. Login/auth verkrijgen.
2. Beschermde route callen.
3. Document of day-entry aanmaken/updaten.
4. Gegevens teruglezen.
5. Verifiëren in database.

Pas als alle stappen groen zijn: release accepteren.

## 11) Veelvoorkomend probleem: `localhost:3001` in frontend

Ja: op productie moet je **niet** meer naar `localhost:3001` fetchen.

Gebruik in je frontend de publieke API URL, bijvoorbeeld:
- `https://api.jouwdomein.nl` (subdomein aanbevolen)
- of `https://jouwdomein.nl/api` (met reverse proxy path)

### Wat je moet invullen

1. Maak in Hostinger een (sub)domein dat naar je Node app wijst.
2. Zet in je frontend environment variabele:
   - `NEXT_PUBLIC_API_URL=https://api.jouwdomein.nl` (Next.js)
   - of vergelijkbare `VITE_API_URL` / `REACT_APP_API_URL`.
3. Gebruik die variabele in je fetch-client i.p.v. hardcoded localhost.

Voorbeeld:

```ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL!;
await fetch(`${API_BASE_URL}/health`);
```

### Snelle check

- Open browser devtools → Network.
- Controleer dat requests naar `https://...` gaan en **niet** naar `http://localhost:3001`.
- Controleer response headers/status en CORS fouten.


## 12) Probleem: `429 Too Many Requests` op productie (maar niet lokaal)

Als dit alleen op Hostinger gebeurt, is de kans groot dat IP-detectie achter proxy fout gaat en auth-rate-limiting te agressief triggert.

### Symptoom

- Calls naar protected endpoints (bijv. `/accountability/partner`) geven `429`.
- Lokaal werkt het wel.

### Oorzaken

1. Reverse proxy stuurt verkeer door, maar backend vertrouwt proxy-informatie niet correct.
2. Veel mislukte auth calls (bijv. door CORS/preflight issues of ontbrekende token) verhogen fail-counter op hetzelfde IP.
3. Alle requests lijken vanaf één gedeeld proxy-IP te komen.

### Oplossing

1. Zet env op Hostinger:
   - `TRUST_PROXY=true`
2. Herstart app.
3. Los eventuele CORS/auth fouten eerst op (zodat fail-counter niet blijft oplopen).
4. Test daarna opnieuw met geldige bearer token.

### Snelle controle

- Controleer in network tab of `Authorization: Bearer ...` echt meegestuurd wordt.
- Controleer of `/auth/login` en `/accountability/partner` geen 401/403 lus veroorzaken vóór de 429.

