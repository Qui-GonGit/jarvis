# J.A.R.V.I.S

Web app personale stile J.A.R.V.I.S: chat e voce (speech-to-text/text-to-speech via Web Speech API del browser) con Claude come "cervello" conversazionale.

## Struttura

- `frontend/` — React + Vite + Tailwind CSS
- `server/` — Node + Express, proxy verso l'API di Anthropic e dati di sistema/meteo
- `automation/` — processo Node standalone per la rassegna settimanale platform engineering & AI via email

## Setup

Richiede Node 20+ (il repo include un `.nvmrc`):

```bash
nvm use
```

### Backend

```bash
cd server
npm install
cp .env.example .env   # se non già presente
```

Apri `server/.env` e inserisci la tua chiave da [console.anthropic.com](https://console.anthropic.com):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Avvia il backend:

```bash
npm run dev
```

Parte su `http://localhost:3001`.

### Frontend

In un altro terminale:

```bash
cd frontend
npm install
npm run dev
```

Apri `http://localhost:5173`. Il dev server di Vite fa da proxy delle chiamate `/api/*` verso il backend sulla porta 3001.

### Automation (rassegna settimanale)

Processo Node indipendente che invia una vera email (non una bozza) ogni lunedì alle 6:00 ora di Roma con le novità più recenti in platform engineering, cloud, Kubernetes, SRE, DevOps e AI. Usa il `claude` CLI locale (non l'API Anthropic) per cercare e comporre la rassegna, invia via Gmail riusando il token OAuth già autorizzato in `server/`, e usa Supabase per dedupe/log degli invii.

Richiede Node 20+ (sul Mac potrebbe servire `source ~/.nvm/nvm.sh && nvm use 20` se il default di sistema è più vecchio) e il `claude` CLI autenticato e nel `PATH`.

Setup:

```bash
cd automation
npm install
cp .env.example .env
```

Apri `automation/.env`:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: stessi valori di `server/.env` (riusa il token già salvato in `server/vendor/gmail-token.json`, nessuna nuova autorizzazione).
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`: da un progetto Supabase (Project Settings → API, usa la **service_role key**, non la `anon`). Crea la tabella di log prima di eseguire:

```sql
create table digest_log (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  sent_at timestamptz not null,
  subject text,
  status text not null,
  error text
);
```

Test manuale (ignora il dedupe, invia subito una rassegna reale):

```bash
node jobs/weeklyDigest.js --force
```

Rilanciando senza `--force` subito dopo, deve stampare `{ status: 'skipped', reason: 'already_sent' }` senza inviare nulla — è la verifica che il dedupe su Supabase funziona.

Per farlo girare davvero ogni lunedì, lascia il processo persistente in esecuzione (gestisce da solo lo schedule e il catch-up se era spento al momento previsto):

```bash
node index.js
```

Come tenerlo vivo (terminale aperto, `pm2`, servizio di sistema, ecc.) è una scelta dell'utente, non gestita dal codice.

## Note

- Senza `ANTHROPIC_API_KEY` configurata, l'app resta utilizzabile ma la chat risponde con un messaggio di errore controllato (backend offline).
- Il riconoscimento vocale richiede un browser basato su Chromium (Chrome/Edge) per il supporto a `SpeechRecognition`.
- La posizione meteo di default è Roma; puoi cambiarla con `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_CITY`, `WEATHER_COUNTRY` in `server/.env`.
