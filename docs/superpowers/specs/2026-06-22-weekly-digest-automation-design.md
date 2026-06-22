# Weekly platform-engineering & AI digest — local automation design

## Goal

Sostituire la routine cloud "Email news" (che usa il connettore claude.ai Gmail, capace solo di creare bozze, non di inviare) con un piccolo servizio Node locale che invia davvero un'email settimanale di rassegna platform engineering / cloud / Kubernetes / SRE / DevOps / AI, ogni lunedì alle 6:00 ora di Roma.

Questo è anche il primo modulo di una serie più ampia ("orbit system": email, task, LinkedIn, articoli) e introduce due decisioni architetturali valide per tutti i moduli futuri:

1. Qualsiasi cosa richieda AI passa per il **claude CLI locale** (`claude -p`), non per l'SDK/API Anthropic a pagamento.
2. **Supabase** è il database condiviso per log, dedupe e stato dei futuri moduli.

## Architettura

Nuova cartella `automation/`, sorella di `frontend/` e `server/`, package Node indipendente con proprio `package.json` e `.env`. È un **processo persistente** (non uno script invocato da cron/launchd di sistema): la schedulazione vive nel codice tramite [`node-cron`](https://www.npmjs.com/package/node-cron), così il comportamento è identico su macOS/Linux/Windows.

```
automation/
  package.json
  .env                       # SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI
  index.js                   # entry point: registra il cron job, esegue il catch-up all'avvio, resta in esecuzione
  lib/
    claudeCli.js             # wrapper su `claude -p`
    gmailSender.js           # invio email reale via Gmail API
    supabaseClient.js        # client Supabase condiviso (riusabile dai moduli futuri)
  jobs/
    weeklyDigest.js          # orchestratore del job
  jobs/weeklyDigest.test.js
  lib/claudeCli.test.js
  lib/gmailSender.test.js
```

Il processo va lasciato in esecuzione (manualmente, con `pm2`, o come servizio): è una scelta operativa lasciata all'utente, fuori dallo scope di questo design — il codice non assume nulla sul meccanismo di avvio.

### Catch-up all'avvio

Ogni volta che `index.js` parte (incluso dopo un riavvio del Mac o un crash), prima di registrare il cron controlla se l'invio della settimana corrente è già avvenuto. Se non lo è (es. il processo era spento lunedì alle 6:00), lancia il job immediatamente invece di aspettare il lunedì successivo.

## Componenti

- **`lib/claudeCli.js`**
  - `run(prompt)`: esegue `claude -p "<prompt>" --output-format json --allowedTools WebSearch --json-schema '{"type":"object","properties":{"subject":{"type":"string"},"body":{"type":"string"}},"required":["subject","body"]}'` via `child_process.execFile`.
  - `parseClaudeOutput(rawJson)`: valida e fa il parse del JSON ritornato, lanciando un errore descrittivo se manca `subject` o `body`.

- **`lib/gmailSender.js`**
  - Riporta la logica rimossa da `server/src/gmailClient.js` in un commit precedente: `getOAuthClient()`, `loadSavedTokens()`, costruzione del messaggio MIME RFC 2822, `gmail.users.messages.send()`.
  - Punta allo stesso file di token già esistente, `server/vendor/gmail-token.json` — nessuna nuova autorizzazione OAuth richiesta.
  - `send({ subject, body })`: invia l'email al proprio indirizzo Gmail (quello autenticato), nessun parametro destinatario esposto.

- **`lib/supabaseClient.js`**
  - Wrapper minimo su `@supabase/supabase-js`, istanziato da `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
  - Pensato per essere riusato dai moduli futuri (task, LinkedIn, articoli), non solo da questo job.

- **`jobs/weeklyDigest.js`**
  - `isWithinCurrentWeek(sentAt, now, timezone)`: funzione pura, vero il lunedì 00:00 Europe/Rome della settimana di `now`.
  - `run({ force = false } = {})`: orchestratore.
    1. Se non `force`, interroga `digest_log` per l'ultimo invio `status: 'sent'` con `job_name = 'weekly-platform-engineering'`; se `isWithinCurrentWeek` è vero, esce loggando "già inviato, skip".
    2. Altrimenti chiama `claudeCli.run(PROMPT)` con il prompt della rassegna (vedi sotto).
    3. Chiama `gmailSender.send({ subject, body })`.
    4. Scrive su `digest_log` una riga `status: 'sent'`.
    5. In caso di errore in 2, 3, o nel write di 4: scrive (quando possibile) una riga `status: 'failed'` con l'errore e rilancia/loggua in console — nessun retry automatico nello stesso ciclo.

- **`index.js`**
  - Importa `jobs/weeklyDigest.js`, chiama `run()` una volta all'avvio (catch-up) e poi registra `cron.schedule('0 6 * * 1', () => run(), { timezone: 'Europe/Rome' })`.

### Prompt usato da `claudeCli.run`

Stesso contenuto già in uso nella routine cloud che questo modulo sostituisce:

> Cerca sul web le novità più recenti (ultimi 2-3 giorni) nel mondo platform engineering, cloud, Kubernetes, SRE, DevOps e AI (modelli, tool, paper, framework). Seleziona al massimo 6-8 novità con il maggior potenziale come spunto per un articolo (Medium o rivista scientifica). Componi una sola email di rassegna: oggetto "Rassegna platform engineering & AI – {data di oggi}"; per ciascuna novità selezionata, titolo, breve riassunto (2-3 frasi), link alla fonte, e una nota "💡 spunto articolo" sulle voci più promettenti. Rispondi solo con l'oggetto e il corpo dell'email, nessun altro testo.

## Schema Supabase

Tabella `digest_log`, da creare nel progetto Supabase (da creare separatamente dall'utente, non in scope qui):

| colonna | tipo | note |
|---|---|---|
| `id` | `uuid`, PK, default `gen_random_uuid()` | |
| `job_name` | `text` | `'weekly-platform-engineering'` — distingue i job futuri che useranno la stessa tabella |
| `sent_at` | `timestamptz` | quando è partito l'invio (o il tentativo, se `failed`) |
| `subject` | `text`, nullable | oggetto dell'email inviata (assente se il fallimento è avvenuto prima della composizione) |
| `status` | `text` | `'sent'` \| `'failed'` |
| `error` | `text`, nullable | messaggio errore se `status = 'failed'` |

Il dedupe/catch-up filtra su `job_name = 'weekly-platform-engineering' AND status = 'sent'` e prende la riga più recente per `sent_at`.

## Flusso dati

1. `index.js` si avvia → si connette a Supabase → esegue `weeklyDigest.run()` come catch-up check (che internamente decide se è davvero il caso di procedere o no) → registra il cron settimanale → resta in esecuzione.
2. Al trigger (cron o catch-up), `weeklyDigest.run()`:
   a. Dedupe check su Supabase (skip se già inviato questa settimana).
   b. `claudeCli.run(PROMPT)` → `{ subject, body }`.
   c. `gmailSender.send({ subject, body })` → invio reale.
   d. Scrittura riga `sent` su `digest_log`.
3. Qualsiasi fallimento in (b)/(c)/(d) → riga `failed` con l'errore (quando la scrittura su Supabase stessa è possibile) + log in console, nessun retry nello stesso ciclo.

## Error handling

- **`claude -p` fallisce o produce JSON non valido**: eccezione catturata, riga `failed` in `digest_log`, log console. Nessun retry automatico — il prossimo tentativo utile è il prossimo trigger (cron o un futuro riavvio/catch-up).
- **Invio Gmail fallisce** (token scaduto, rete assente): stessa gestione. Il token OAuth non viene mai rigenerato automaticamente — un fallimento di questo tipo richiede intervento manuale (ri-autorizzare), segnalato dal messaggio in `digest_log.error`.
- **Supabase irraggiungibile in lettura** (dedupe check fallisce): il job **salta il turno** invece di rischiare un invio duplicato — si preferisce un mancato invio occasionale a una rassegna doppia.
- **Supabase irraggiungibile in scrittura dopo un invio riuscito**: l'email è comunque partita; l'errore di scrittura va solo in console (non può andare in DB, ovviamente).
- **Processo Node terminato o Mac in sleep al momento del trigger**: nessuna gestione speciale necessaria — è lo scenario che il catch-up all'avvio risolve all'avvio successivo.

## Testing

**Unit test automatici (`node --test`, stile coerente con `server/src/usageStore.test.js`):**
- `isWithinCurrentWeek`: casi limite di fuso orario Europe/Rome, lunedì appena passato, settimana precedente.
- `parseClaudeOutput`: JSON valido, JSON con campi mancanti, JSON malformato.
- Costruzione del messaggio MIME in `gmailSender.js` (logica già esistente, portata da `gmailClient.js`).

**Verifica manuale (non automatizzabile in modo sensato, dato che tocca servizi esterni reali):**
- `node automation/jobs/weeklyDigest.js --force` per un giro end-to-end reale (claude cerca e compone, l'email arriva davvero, la riga compare su Supabase).
- Stop del processo, attesa che la finestra settimanale passi, restart di `index.js`: confermare che il catch-up scatta subito.
- Due esecuzioni nella stessa settimana: confermare che la seconda loggi "già inviato" senza richiamare claude/Gmail.

Nessun test automatico contro i servizi reali (Claude CLI, Gmail, Supabase) — coerente con l'assenza di test di rete per `gmailClient.js` nel resto del repo.

## Out of scope

- Creazione del progetto Supabase e della tabella `digest_log` — a carico dell'utente, fuori da questo lavoro di codice.
- Meccanismo di avvio/keep-alive del processo `automation/` (pm2, servizio di sistema, terminale aperto, ecc.) — scelta operativa dell'utente, il codice non assume nulla in merito.
- Disattivazione della routine cloud "Email news" (`trig_011oFJKbVRtguutRdrkUC8ZU`) — va disabilitata manualmente una volta verificato che il nuovo flusso locale funziona, non in scope di questo design.
- Retry automatico in caso di fallimento — deliberatamente escluso (vedi Error handling).
- Altri moduli dell'"orbit system" (task, LinkedIn, articoli) — `lib/supabaseClient.js` è scritto per essere riusato, ma il loro design è successivo e separato.
