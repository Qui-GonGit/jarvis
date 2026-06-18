# Widget ETF per JARVIS — Design

## Contesto

JARVIS è la web app personale stile Iron Man (React + Vite frontend, Node/Express
backend) già descritta nel resto del repo. Oggi la colonna destra della dashboard
è occupata interamente dal pannello Conversazione. L'utente vuole seguire
l'andamento di tre ETF (XBAE, XMME, XDWD) direttamente nella dashboard, con lo
stesso stile holographic-blue del resto dell'app.

## Obiettivo

Aggiungere un widget "ETF" che mostri prezzo e variazione giornaliera per una
lista configurabile di ticker, senza richiedere API a pagamento né credenziali
di un broker. Solo prezzo/andamento, non un vero portafoglio (niente quote
possedute né prezzo di carico).

## Layout

La colonna destra (`grid-cols-[320px_1fr_380px]` in `App.jsx`) viene divisa
verticalmente in due:
- **In alto**: nuovo pannello `ETFPanel`, altezza fissa (dimensionata al
  contenuto, come gli altri pannelli `Panel`-based a sinistra).
- **In basso**: pannello Conversazione esistente, che occupa lo spazio
  rimanente e continua a scrollare internamente come già fa oggi (nessuna
  modifica al suo comportamento, solo meno spazio verticale disponibile).

Sinistra e centro (System Stats/Weather/Uptime, orb J.A.R.V.I.S) restano
invariati.

## Componente `ETFPanel`

Nuovo file `frontend/src/components/ETFPanel.jsx`, costruito sopra i
componenti condivisi esistenti in `Panel.jsx` (stesso `Panel` wrapper,
bordo/glow cyan coerente con gli altri pannelli).

Per ciascun ETF mostra su una riga:
- Ticker (es. `XDWD`)
- Prezzo attuale con valuta
- Variazione giornaliera in % (colore cyan/verde-cyan se positiva, ambra se
  negativa — niente verde/rosso standard, per restare nel tema)

Se un singolo ticker non è disponibile (vedi gestione errori), la riga mostra
`n/d` invece del prezzo, senza bloccare la visualizzazione degli altri.

Polling ogni 5 minuti tramite l'hook esistente `usePolling`, stesso pattern
già usato da `WeatherPanel`/`SystemStatsPanel`.

## Backend

Nuova route `GET /api/etf` in `server/src/routes/etf.js`, montata in
`server/src/index.js` come gli altri router.

- Ticker letti da `process.env.ETF_TICKERS` (lista separata da virgole, es.
  `ETF_TICKERS=XBAE,XMME,XDWD`), stesso pattern già usato per la città del
  meteo. Documentati in `.env.example`.
- Fonte dati: API pubblica e gratuita di Yahoo Finance
  (`query1.finance.yahoo.com/v8/finance/chart/<TICKER><SUFFIX>`), nessuna
  API key richiesta.
- Per ogni ticker il backend prova in sequenza i suffissi di borsa `.MI`
  (Borsa Italiana), `.DE` (Xetra), `.L` (Londra), e usa il primo che
  restituisce un prezzo valido. Il suffisso risolto viene tenuto in cache in
  memoria per le chiamate successive (evita di riprovare tutti i suffissi ad
  ogni refresh).
- Risposta: `{ etfs: [{ ticker, price, currency, changePercent, status }] }`
  dove `status` è `"ok"` oppure `"unavailable"`.

## Gestione errori

- Ticker singolo non risolvibile su nessuna borsa, o risposta Yahoo Finance
  non valida → quella riga ha `status: "unavailable"`, il frontend mostra
  `n/d` per quel ticker, il resto del pannello continua a funzionare
  normalmente.
- Backend irraggiungibile (rete/server down) → `ETFPanel` mostra lo stesso
  stato "offline" già usato da `WeatherPanel`/`SystemStatsPanel` quando
  `online` è `false`.

## Cosa è fuori scope

- Nessun valore di portafoglio reale (niente quote possedute, niente prezzo
  di carico, niente calcolo di guadagno/perdita).
- Nessun grafico storico, solo prezzo corrente e variazione giornaliera.
- Nessuna interazione conversazionale con JARVIS su questi dati (niente tool
  Claude dedicato, a differenza della funzionalità email) — è un widget di
  sola lettura nella dashboard.
