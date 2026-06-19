# Morning platform-engineering digest design

## Goal

Quando l'utente apre una nuova sessione e invia il primo messaggio della giornata (lo stesso momento in cui oggi scattano già saluto + meteo + controllo email), Jarvis cerca sul web le novità più recenti nel mondo platform engineering/cloud/Kubernetes/SRE e invia all'utente un'unica email di rassegna — pensata anche come fonte di spunti per articoli (Medium o riviste scientifiche). A voce/nel log Jarvis menziona solo brevemente che la mail è stata inviata, senza elencare i contenuti.

Massimo un invio al giorno, anche se l'app viene riaperta più volte.

## Perché niente "voce breve, dettagli nel log"

Il pannello `ConversationPanel` (vedi `2026-06-19-readonly-conversation-log-design.md`) tronca ogni messaggio a una riga singola e non offre modo di leggere il resto. Inoltre il TTS (`useSpeech.speak`) legge **integralmente** il testo della risposta. Di conseguenza:

- I dettagli della rassegna (titoli, riassunti, link) vanno negli **argomenti del tool** `send_digest_email` (corpo dell'email), non nel testo di risposta del modello.
- Il testo di risposta visibile/parlato resta sempre breve per costruzione (istruzione di sistema), senza bisogno di logica di split lato client.

## Changes

### `server/src/gmailClient.js`

- Nuova funzione `getMyEmailAddress()`: chiama `gmail.users.getProfile({ userId: 'me' })` e ritorna `data.emailAddress`.
- Nuova funzione `sendDigestEmail({ subject, body })`:
  - Ottiene l'indirizzo via `getMyEmailAddress()`.
  - Costruisce un messaggio MIME RFC 2822 (header `To`, `Subject` con encoding RFC 2047 per UTF-8, `Content-Type: text/plain; charset=utf-8`, corpo `body`).
  - Lo invia con `gmail.users.messages.send({ userId: 'me', requestBody: { raw: <base64url> } })`.
  - **Il destinatario non è un parametro della funzione esposto al modello** — è sempre l'indirizzo dell'account autenticato. Questo elimina il rischio che un prompt-injection (via contenuto email o risultati di ricerca web, entrambi non fidati) induca il modello a inviare dati a un indirizzo arbitrario.
  - Usa lo scope OAuth già presente (`gmail.modify`), che include l'invio. Se in test risultasse insufficiente, va aggiunto `gmail.send` agli scope e l'utente deve re-autorizzare (non bloccante per l'implementazione, da verificare).

### `server/src/routes/chat.js`

- Aggiungo ai `tools`:
  - Tool server-side: `{ type: 'web_search_20260209', name: 'web_search' }` (eseguito interamente da Anthropic, nessun codice lato nostro).
  - Tool custom `send_digest_email`:
    ```js
    {
      name: 'send_digest_email',
      description:
        'Invia all\'utente (al suo stesso indirizzo Gmail) un\'email con la rassegna di novità richiesta. Usalo quando devi consegnare contenuto lungo o dettagliato che non deve essere letto ad alta voce per intero (es. la rassegna mattutina di platform engineering). Non specificare un destinatario: va sempre e solo all\'utente stesso.',
      input_schema: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Oggetto della mail.' },
          body: { type: 'string', description: 'Corpo testuale della mail (testo semplice).' },
        },
        required: ['subject', 'body'],
      },
    }
    ```
  - `executeTool` aggiunge il case `send_digest_email` → chiama `sendDigestEmail({ subject: input.subject, body: input.body })`.
- Aggiorno il loop di gestione dei tool: oltre a `stop_reason === 'tool_use'`, gestisco anche `stop_reason === 'pause_turn'` (può presentarsi quando il tool server-side `web_search` esaurisce il suo limite interno di iterazioni). In quel caso non ci sono `tool_use` blocks lato client da eseguire: si appende solo il turno assistant accumulato e si ri-invia la stessa conversazione per far riprendere il modello, senza aggiungere un messaggio utente.
- `max_tokens` passa da `1024` a `4096`, per lasciare spazio alla generazione del corpo email oltre alla risposta normale.

### `frontend/src/App.jsx`

- `buildFirstMessageContent(text, weatherData, emailAvailable, includeDigest)` riceve un nuovo parametro `includeDigest`. Quando `true`, l'istruzione di sistema aggiunge un blocco che chiede di:
  1. Cercare (via `web_search`) le novità più recenti (ultimi giorni) nel mondo platform engineering / cloud / Kubernetes / SRE / DevOps.
  2. Selezionare quelle con più potenziale come spunto per un articolo (Medium o rivista scientifica).
  3. Comporre **una sola** email di rassegna (titolo + breve riassunto + link per ciascuna novità selezionata, nota "spunto articolo" su quelle più promettenti) e inviarla con `send_digest_email`.
  4. Nella risposta visibile/parlata, menzionare solo in una frase breve che la mail è stata inviata e quante novità contiene — **niente elenco** nel testo di risposta, perché viene letto integralmente dal TTS.
- Dedup giornaliero via `localStorage`:
  - Chiave `jarvisLastDigestSentAt`, valore stringa data `YYYY-MM-DD` (fuso locale).
  - In `handleSend`, quando `isFirstMessage` è `true`: calcolo `today` e leggo il valore salvato; `includeDigest = stored !== today`.
  - Se `includeDigest` è `true`, scrivo immediatamente `localStorage.setItem('jarvisLastDigestSentAt', today)` **prima** di attendere la risposta del backend (per evitare doppi invii da click ravvicinati o richieste concorrenti), poi passo `includeDigest` a `buildFirstMessageContent`.

## Out of scope

- Nessun filtro per giorno della settimana (l'utente non l'ha richiesto: scatta ad ogni primo messaggio di sessione non ancora "fatto oggi", indipendentemente dal giorno).
- Nessuna UI per consultare lo storico delle rassegne inviate — restano solo nella casella di posta dell'utente.
- Nessun meccanismo di retry se l'invio dell'email fallisce: l'errore viene gestito come qualsiasi altro errore di tool (`{ error: err.message }` restituito al modello, che può segnalarlo nella risposta).
- Nessuna modifica al `ConversationPanel` o al formato del log (già definiti in `2026-06-19-readonly-conversation-log-design.md`).
