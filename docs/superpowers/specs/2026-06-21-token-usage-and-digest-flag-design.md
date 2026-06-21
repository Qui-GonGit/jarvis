# Consumo token stimato + flag invio digest su Notion — Design

## Contesto

JARVIS mostra già un pannello ETF nella colonna destra della dashboard
(`frontend/src/App.jsx`). L'utente vuole, subito sotto, un widget con il
consumo token stimato dell'API Anthropic. Un vero "credito residuo" non è
disponibile via API (richiede una Admin API key non utilizzabile su account
individuali, e comunque non esporrebbe il credito acquistato) — il widget
mostra quindi i token effettivamente consumati, letti da `usage` nelle
risposte di Anthropic già ricevute dal backend.

In parallelo, il digest giornaliero di platform engineering (introdotto in
`2026-06-19-morning-platform-engineering-digest-design.md`) oggi usa
`localStorage` nel browser per evitare di inviarlo due volte lo stesso
giorno. È fragile: cambiare browser o svuotare lo storage fa ripartire
l'invio. L'utente vuole sostituire questo controllo con un flag persistito
su Notion, controllabile anche da remoto — non un log delle conversazioni,
solo "ho già inviato l'email oggi sì/no".

## Obiettivo

1. Widget "Token" sotto l'ETF panel con il totale di token consumati
   (input + output) da quando il backend ha iniziato a tracciarli.
2. Il backend, non più il browser, decide se il digest giornaliero va
   inviato, controllando un flag su un database Notion dedicato.

## Contatore token — niente nuovo motore di DB

Il contatore è solo due numeri che devono sopravvivere a un riavvio del
server: non serve un database vero. Nuovo modulo
`server/src/usageStore.js` che legge/scrive un file
`server/data/usage.json` (`{ "inputTokens": 0, "outputTokens": 0 }`),
creato al primo avvio se assente. Scrittura atomica (file temporaneo +
rename) per evitare corruzione in caso di crash a metà scrittura.

`runAgentLoop` in `server/src/routes/chat.js` somma `response.usage` di
**ogni** chiamata `anthropic.messages.create` fatta durante il loop (sia per
la chat normale che per l'endpoint digest) e chiama
`usageStore.addUsage(inputTokens, outputTokens)` una volta alla fine del
loop. Per `inputTokens` si usa `input_tokens + cache_creation_input_tokens +
cache_read_input_tokens` (il totale realmente processato, non solo i token
non cachati).

Nuovo endpoint `GET /api/usage/tokens` → `{ inputTokens, outputTokens,
totalTokens }`, montato in `server/src/index.js`.

Nuovo componente `frontend/src/components/TokenUsagePanel.jsx`, stesso
pattern `Panel` + `usePolling` degli altri widget (polling ogni 30s, non
serve tempo reale). Mostra il totale e, in piccolo, lo split input/output.
Stato offline coerente con gli altri pannelli se il backend non risponde.

## Flag digest su Notion

Database Notion già creato: **Jarvis Digest Log**
(`https://app.notion.com/p/34639eca66ca4a1bb0432a7440a69e1f`), colonne
`Day` (titolo), `Date`, `Sent At`, `Status` (`sent`/`failed`), `Note`.
Contiene **solo** una riga per ogni invio riuscito del digest — mai il
contenuto della chat o del digest stesso.

Nuovo modulo `server/src/notionClient.js`, usa l'SDK ufficiale
`@notionhq/client`, autenticato con `NOTION_API_KEY` (nuova variabile in
`.env`, da creare su notion.so/my-integrations e condividere con il
database). Database ID anch'esso in `.env` come `NOTION_DIGEST_DB_ID`.

Due funzioni:
- `hasDigestBeenSentToday()`: query sul database filtrando `Date` = oggi e
  `Status` = `sent`. Ritorna `true`/`false`.
- `logDigestSent()`: crea una riga con `Day` = data odierna (es.
  `2026-06-21`), `Date` = oggi, `Sent At` = adesso, `Status` = `sent`.

Le colonne `Note` e l'opzione `failed` di `Status` esistono già nel
database ma questo design non le popola (nessun percorso di codice scrive
`failed` o `Note`): sono headroom per un eventuale logging dei fallimenti,
fuori scope qui.

`POST /api/chat/digest` in `chat.js` cambia ordine di lavoro:
1. Se `NOTION_API_KEY`/`NOTION_DIGEST_DB_ID` sono configurate, chiama
   `hasDigestBeenSentToday()`. Se `true`, risponde subito con
   `{ ok: true, skipped: true }` senza chiamare Anthropic.
2. Altrimenti esegue `runAgentLoop` come oggi (ricerca web + invio email).
3. Dopo un invio riuscito, chiama `logDigestSent()` (fire-and-forget: un
   errore qui non deve far fallire la risposta all'endpoint, solo loggare
   in console).

## Frontend: rimozione della logica `localStorage`

`triggerDailyDigest()` in `App.jsx` perde il controllo su
`localStorage.jarvisLastDigestSentAt`: diventa una chiamata incondizionata
a `POST /api/chat/digest` ad ogni primo messaggio della sessione,
fire-and-forget come già oggi. Il backend è l'unica fonte di verità su "è
già partito oggi" — l'endpoint risponde in millisecondi nel caso comune
(digest già inviato), quindi non c'è bisogno di un'ottimizzazione lato
client.

## Gestione errori

- `NOTION_API_KEY` o `NOTION_DIGEST_DB_ID` non configurate → il controllo
  duplicato viene saltato, il digest si comporta come prima di questa
  modifica (un tentativo di invio ad ogni primo messaggio della giornata,
  senza garanzia di unicità). Non deve bloccare l'app se l'utente non ha
  ancora configurato l'integrazione Notion.
- Query Notion che fallisce per altri motivi (rete, token scaduto) → si
  procede comunque con l'invio del digest (un'email doppia occasionale è
  preferibile a nessuna email).
- `usage.json` illeggibile o assente → trattato come `{inputTokens: 0,
  outputTokens: 0}`, non un errore fatale.
- Backend irraggiungibile → `TokenUsagePanel` mostra lo stato offline come
  gli altri widget.

## Cosa è fuori scope

- Nessun log storico dei singoli turni di chat, né su Notion né altrove —
  solo il totale cumulativo dei token e il flag giornaliero del digest.
- Nessuna stima di costo in euro/dollari (richiederebbe mantenere a mano
  una tabella prezzi per modello): solo conteggio token grezzo.
- Nessun reset automatico del contatore token (cresce indefinitamente; un
  riavvio del server non lo azzera, a differenza di prima quando viveva
  solo in memoria).
