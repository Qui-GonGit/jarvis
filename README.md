# J.A.R.V.I.S

Web app personale stile J.A.R.V.I.S: chat e voce (speech-to-text/text-to-speech via Web Speech API del browser) con Claude come "cervello" conversazionale.

## Struttura

- `frontend/` — React + Vite + Tailwind CSS
- `server/` — Node + Express, proxy verso l'API di Anthropic e dati di sistema/meteo

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

## Note

- Senza `ANTHROPIC_API_KEY` configurata, l'app resta utilizzabile ma la chat risponde con un messaggio di errore controllato (backend offline).
- Il riconoscimento vocale richiede un browser basato su Chromium (Chrome/Edge) per il supporto a `SpeechRecognition`.
- La posizione meteo di default è Roma; puoi cambiarla con `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_CITY`, `WEATHER_COUNTRY` in `server/.env`.
