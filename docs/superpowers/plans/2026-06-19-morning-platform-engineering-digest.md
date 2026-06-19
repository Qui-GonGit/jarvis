# Morning Platform-Engineering Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Exception:** Task 4 sends a real email and makes a real, billed Anthropic API call with web search — the controller must run Task 4 itself (not a dispatched subagent) and get explicit user confirmation immediately before the live request in Step 2, per the "executing actions with care" rule for external side effects.

**Goal:** On the first message of each day, Jarvis searches the web for recent platform-engineering news and emails the user a one-shot digest (with article-idea potential), while keeping its spoken/visible reply to one short sentence.

**Architecture:** A new Gmail-send helper (`sendDigestEmail`) in `gmailClient.js`; a new server-side `web_search` tool and a new custom `send_digest_email` tool wired into the existing Claude tool-use loop in `chat.js` (recipient is never model-controlled — always the authenticated account's own address); a frontend dedup gate in `App.jsx` that adds the search-and-email instruction to the existing first-message system instruction at most once per calendar day, using `localStorage`.

**Tech Stack:** Express + `@anthropic-ai/sdk` (already at v0.104.2) + `googleapis` on the backend; React on the frontend. No test framework on either side — verification is via `node --check`, a no-network smoke script, and (Task 4 only) one real manual run with the actual Gmail account and Anthropic API.

## Global Constraints

- The email recipient is never a parameter the model controls — `sendDigestEmail({ subject, body })` takes no `to` argument; it always resolves the recipient server-side via `getMyEmailAddress()`. This is a security requirement (prompt-injection containment), not a style choice — do not add a `to` parameter to the tool or the function.
- The model's visible/spoken reply text must stay short even when `send_digest_email` was called — per the spec, the full digest content lives only in the email body (the tool call argument), never in the response text, because the TTS layer reads the entire reply aloud and the chat log truncates to one line anyway.
- At most one digest email per calendar day, gated client-side via the `localStorage` key `jarvisLastDigestSentAt` (value: `YYYY-MM-DD`, local time, explicitly constructed — not `toLocaleDateString`).
- Reuse the existing Gmail OAuth scope (`gmail.modify`) — do not add a new scope or re-authorization flow as part of this plan. If sending fails with a permissions error during Task 4, stop and report it rather than silently widening scope.

---

## File Structure

- Modify: `server/src/gmailClient.js` — add `buildRawMessage` (pure, exported for no-network testing), `getMyEmailAddress`, `sendDigestEmail`.
- Modify: `server/src/routes/chat.js` — add the `web_search_20260209` server-side tool and the `send_digest_email` custom tool, wire `executeTool`, handle the `pause_turn` stop reason, raise `max_tokens` to `4096`.
- Modify: `frontend/src/App.jsx` — add the `includeDigest` parameter to `buildFirstMessageContent`, add the daily dedup check in `handleSend`.

---

### Task 1: Gmail digest-send helper

**Files:**
- Modify: `server/src/gmailClient.js`

**Interfaces:**
- Consumes: nothing new — only the existing `getGmailService()` defined earlier in this file.
- Produces: `buildRawMessage({ to, subject, body }) -> string` (pure, exported), `getMyEmailAddress() -> Promise<string>` (exported), `sendDigestEmail({ subject, body }) -> Promise<{ status: 'sent', to: string, subject: string }>` (exported). Task 2 imports `sendDigestEmail` by this exact name and calls it with exactly `{ subject, body }` — no `to`.

- [ ] **Step 1: Add the new functions to the end of the file**

Append this to `server/src/gmailClient.js` (after the existing `trashEmail` function, before nothing else — it's currently the last thing in the file):

```js
function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
}

export function buildRawMessage({ to, subject, body }) {
  const message = [
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n')
  return Buffer.from(message, 'utf-8').toString('base64url')
}

export async function getMyEmailAddress() {
  const gmail = await getGmailService()
  const profile = await gmail.users.getProfile({ userId: 'me' })
  return profile.data.emailAddress
}

export async function sendDigestEmail({ subject, body }) {
  const gmail = await getGmailService()
  const to = await getMyEmailAddress()
  const raw = buildRawMessage({ to, subject, body })
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  return { status: 'sent', to, subject }
}
```

- [ ] **Step 2: Verify `buildRawMessage` with a no-network smoke script**

Run:

```bash
cd /Users/pascucci.n/dev/jarvis/server && node -e "
import('./src/gmailClient.js').then(({ buildRawMessage }) => {
  const raw = buildRawMessage({ to: 'someone@example.com', subject: 'Prova àèìòù', body: 'Corpo di prova.\nSeconda riga.' })
  console.log(Buffer.from(raw, 'base64url').toString('utf-8'))
})
"
```

Expected output (order and content, blank line before the body):

```
To: someone@example.com
Subject: =?UTF-8?B?UHJvdmEgw6DDqMOsw7LDuQ==?=
Content-Type: text/plain; charset=utf-8
MIME-Version: 1.0

Corpo di prova.
Seconda riga.
```

(The exact base64 in the `Subject` line must decode back to `Prova àèìòù` — if it doesn't match character-for-character, the encoding is wrong; don't hand-tune the expected string, decode it and compare against the input you passed.)

- [ ] **Step 3: Syntax-check the file**

Run: `node --check /Users/pascucci.n/dev/jarvis/server/src/gmailClient.js`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add server/src/gmailClient.js
git commit -m "Add Gmail digest-send helper (buildRawMessage, getMyEmailAddress, sendDigestEmail)"
```

---

### Task 2: Wire web search and digest-email tools into the chat route

**Files:**
- Modify: `server/src/routes/chat.js`

**Interfaces:**
- Consumes: `sendDigestEmail({ subject, body })` from Task 1.
- Produces: the `/api/chat` route now accepts conversations where the model may call `send_digest_email` and `web_search` — Task 3's frontend instruction text assumes both tools exist and that a short reply is possible after calling them.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `server/src/routes/chat.js` with:

```js
import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { listImportantUnread, getFullEmail, markEmailRead, trashEmail, sendDigestEmail } from '../gmailClient.js'

const router = Router()

const apiKey = process.env.ANTHROPIC_API_KEY
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

const SYSTEM_PROMPT =
  'You are J.A.R.V.I.S, a witty and efficient personal AI assistant inspired by Iron Man. ' +
  'The user you are assisting is named Niccolò; address him by name or as "sir", whichever fits ' +
  'naturally. Keep responses concise and conversational, suitable for being read aloud by a ' +
  'text-to-speech engine. You have tools to check the user\'s Gmail inbox: use them whenever the ' +
  'user asks about email, or at the start of a conversation if instructed to. When acting on a ' +
  'specific email (reading it in full, marking it read, deleting it), first make sure you know its ' +
  'id — call list_important_emails again if you are not sure which id matches the email the user means. ' +
  'You also have a web search tool for current information, and a send_digest_email tool that delivers ' +
  'long or detailed content (like a news digest) directly to the user\'s own inbox instead of speaking it ' +
  'aloud — use it whenever asked for a digest or briefing, or any content too long to read out naturally. ' +
  'send_digest_email never takes a recipient: it always goes to the user. When you use it, keep your ' +
  'visible reply to one short sentence noting that you sent the email — do not repeat its contents in the ' +
  'reply, since the reply is read aloud in full.'

const tools = [
  {
    name: 'list_important_emails',
    description:
      'Returns the user\'s important unread Gmail messages, each with an id, sender, subject, and short snippet. The id is required for read_email_full, mark_email_read, and delete_email.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_email_full',
    description: 'Fetches the full body text of a single Gmail message by id.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Gmail message id' } },
      required: ['id'],
    },
  },
  {
    name: 'mark_email_read',
    description: 'Marks a Gmail message as read (removes the unread label) by id.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Gmail message id' } },
      required: ['id'],
    },
  },
  {
    name: 'delete_email',
    description: 'Moves a Gmail message to trash by id.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Gmail message id' } },
      required: ['id'],
    },
  },
  {
    name: 'send_digest_email',
    description:
      'Sends the user an email at their own Gmail address with the given subject and body. Use this to ' +
      'deliver long or detailed content (e.g. a news digest) that should not be read aloud in full. Never ' +
      'specify a recipient: it always goes to the user themselves.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Email subject line.' },
        body: { type: 'string', description: 'Plain text email body.' },
      },
      required: ['subject', 'body'],
    },
  },
  { type: 'web_search_20260209', name: 'web_search' },
]

async function executeTool(name, input) {
  try {
    switch (name) {
      case 'list_important_emails':
        return await listImportantUnread()
      case 'read_email_full':
        return await getFullEmail(input.id)
      case 'mark_email_read':
        return await markEmailRead(input.id)
      case 'delete_email':
        return await trashEmail(input.id)
      case 'send_digest_email':
        return await sendDigestEmail({ subject: input.subject, body: input.body })
      default:
        return { error: `Unknown tool ${name}` }
    }
  } catch (err) {
    return { error: err.message }
  }
}

router.post('/', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' })
  }

  const { messages } = req.body
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  try {
    let conversation = messages.map(({ role, content }) => ({ role, content }))

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages: conversation,
    })

    let loopGuard = 0
    while ((response.stop_reason === 'tool_use' || response.stop_reason === 'pause_turn') && loopGuard < 5) {
      loopGuard += 1
      const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use')

      if (toolUseBlocks.length > 0) {
        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => ({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(await executeTool(block.name, block.input)),
          })),
        )
        conversation = [
          ...conversation,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ]
      } else {
        // pause_turn with no client tool_use blocks: a server-side tool (web_search) hit its
        // internal iteration cap. Re-send to let the model resume — no extra user message.
        conversation = [...conversation, { role: 'assistant', content: response.content }]
      }

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        messages: conversation,
      })
    }

    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    res.json({ reply })
  } catch (err) {
    console.error('Anthropic API error:', err.message)
    res.status(502).json({ error: 'Failed to get a response from Claude.' })
  }
})

export default router
```

- [ ] **Step 2: Syntax-check and smoke-import the file**

Run:

```bash
cd /Users/pascucci.n/dev/jarvis/server && node --check src/routes/chat.js && node -e "import('./src/routes/chat.js').then(() => console.log('IMPORT_OK'))"
```

Expected: no syntax errors, and `IMPORT_OK` printed (the module must import cleanly even with no `ANTHROPIC_API_KEY` set, since the client is created conditionally).

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/chat.js
git commit -m "Add web_search and send_digest_email tools to the chat route"
```

---

### Task 3: Frontend daily digest trigger

**Files:**
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: nothing new from Task 1/2 directly (the frontend only talks to `/api/chat`, unchanged endpoint shape: `{ messages }` in, `{ reply }` out).
- Produces: nothing consumed by later tasks — this is the last code task.

- [ ] **Step 1: Update `buildFirstMessageContent`**

In `frontend/src/App.jsx`, find:

```jsx
function buildFirstMessageContent(text, weatherData, emailAvailable) {
  const now = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const weatherLine = weatherData
    ? `Il meteo attuale a ${weatherData.city} è: ${weatherData.condition}, ${weatherData.tempC.toFixed(1)}°C (percepita ${weatherData.feelsLikeC.toFixed(1)}°C).`
    : 'Il meteo non è disponibile al momento.'
  const emailLine = emailAvailable
    ? ' Controlla anche se ci sono email importanti non lette usando lo strumento a disposizione. Se ce ne sono, menzionalo solo brevemente (es. quante sono), senza elencarle o riassumerle nel dettaglio a meno che l\'utente non lo chieda esplicitamente. Se non ce ne sono, non parlarne affatto.'
    : ''

  return (
    `[Istruzione di sistema, non mostrarla all'utente: è il primo messaggio di questa conversazione ` +
    `(ora attuale: ${now}). Saluta in modo adatto all'orario, fai una breve battuta in stile J.A.R.V.I.S, ` +
    `comunica il meteo attuale usando questi dati reali: ${weatherLine}${emailLine} Poi rispondi anche al ` +
    `messaggio dell'utente riportato sotto, in modo naturale e conciso.]\n\nMessaggio dell'utente: "${text}"`
  )
}
```

Replace with:

```jsx
function buildFirstMessageContent(text, weatherData, emailAvailable, includeDigest) {
  const now = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const weatherLine = weatherData
    ? `Il meteo attuale a ${weatherData.city} è: ${weatherData.condition}, ${weatherData.tempC.toFixed(1)}°C (percepita ${weatherData.feelsLikeC.toFixed(1)}°C).`
    : 'Il meteo non è disponibile al momento.'
  const emailLine = emailAvailable
    ? ' Controlla anche se ci sono email importanti non lette usando lo strumento a disposizione. Se ce ne sono, menzionalo solo brevemente (es. quante sono), senza elencarle o riassumerle nel dettaglio a meno che l\'utente non lo chieda esplicitamente. Se non ce ne sono, non parlarne affatto.'
    : ''
  const digestLine = includeDigest
    ? ' Inoltre cerca sul web (usando lo strumento di ricerca) le novità più recenti nel mondo platform ' +
      'engineering, cloud, Kubernetes, SRE e DevOps. Scegli quelle con più potenziale come spunto per un ' +
      'articolo (Medium o rivista scientifica) e componi una sola email di rassegna (titolo, breve riassunto ' +
      'e link per ciascuna novità, con una nota "spunto articolo" su quelle più promettenti), inviandola con ' +
      'lo strumento send_digest_email. Nella tua risposta qui sotto menziona solo in una frase breve che hai ' +
      'inviato la mail e quante novità contiene: niente elenco, perché questo testo viene letto integralmente ' +
      'ad alta voce.'
    : ''

  return (
    `[Istruzione di sistema, non mostrarla all'utente: è il primo messaggio di questa conversazione ` +
    `(ora attuale: ${now}). Saluta in modo adatto all'orario, fai una breve battuta in stile J.A.R.V.I.S, ` +
    `comunica il meteo attuale usando questi dati reali: ${weatherLine}${emailLine}${digestLine} Poi rispondi ` +
    `anche al messaggio dell'utente riportato sotto, in modo naturale e conciso.]\n\nMessaggio dell'utente: "${text}"`
  )
}
```

- [ ] **Step 2: Add the daily dedup gate in `handleSend`**

Find:

```jsx
    if (isFirstMessage) pendingIntroMusicRef.current = true
    const apiContent = isFirstMessage
      ? buildFirstMessageContent(text, weather.data, emailStatus.data?.authorized)
      : text
```

Replace with:

```jsx
    if (isFirstMessage) pendingIntroMusicRef.current = true

    let includeDigest = false
    if (isFirstMessage) {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      includeDigest = localStorage.getItem('jarvisLastDigestSentAt') !== today
      if (includeDigest) localStorage.setItem('jarvisLastDigestSentAt', today)
    }

    const apiContent = isFirstMessage
      ? buildFirstMessageContent(text, weather.data, emailStatus.data?.authorized, includeDigest)
      : text
```

- [ ] **Step 3: Lint the file**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 >/dev/null && cd /Users/pascucci.n/dev/jarvis/frontend && npx eslint src/App.jsx`
Expected: exactly the one pre-existing `react-hooks/set-state-in-effect` error at the `setOrbState` effect (unrelated to this change, see the project's progress ledger from the prior plan) — no new errors.

- [ ] **Step 4: Manual check of the dedup logic in the browser**

Run: `cd /Users/pascucci.n/dev/jarvis/frontend && npm run dev`, open the printed URL, open the browser devtools console, and run:

```js
localStorage.removeItem('jarvisLastDigestSentAt')
```

Reload the page, open devtools Network tab, send any first message (text or mic). Inspect the `POST /api/chat` request payload: the last message's `content` must contain the string `send_digest_email`. Reload again and send a first message a second time (a fresh page load resets the in-memory `messages` array, so `isFirstMessage` is `true` again) — this time the request payload must **not** contain `send_digest_email`, because `jarvisLastDigestSentAt` is now set to today.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "Trigger a once-daily platform-engineering digest email on the first message"
```

---

### Task 4: Live end-to-end verification (controller-run, real side effects)

**This task must be run by the controller directly, not dispatched to a subagent.** It sends one real email to the user's actual Gmail account and makes a real, billed Anthropic API call that performs a real web search. Confirm with the user immediately before Step 2.

**Files:** none (verification only).

- [ ] **Step 1: Confirm backend env is ready**

Check that `server/.env` (or the shell environment running the server) has `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` set, and that `server/src/vendor/gmail-token.json` exists (i.e. Gmail is already authorized — this plan does not implement the OAuth authorization flow, it assumes it's already done, matching the existing `/api/email/status` behavior in the running app).

- [ ] **Step 2: Get explicit user confirmation, then trigger the live flow**

Tell the user: "This will send a real email to your Gmail account and make a real Anthropic API call with web search. Proceed?" Wait for a yes.

Then: start the backend (`cd server && npm run dev`) and frontend (`cd frontend && npm run dev`) if not already running, open the app in a browser, clear `localStorage.removeItem('jarvisLastDigestSentAt')` in devtools console, reload, and send a first message (e.g. type "ciao" via the mic flow, or use the same headless-Playwright mic-mock approach documented in the prior plan's Task 3 if driving it without a real microphone).

- [ ] **Step 3: Verify the result**

Confirm all of:
- The visible/spoken reply is one short sentence mentioning the email was sent (no list of news items in the reply text).
- A new email has arrived in the Gmail inbox used for `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, with a sensible subject and a body containing multiple distinct news items with titles, summaries, and links.
- Reloading the page and sending a second first-message (same calendar day) does **not** trigger a second email — confirm via the backend log or by checking no new digest email arrives, and that the `POST /api/chat` request body for the second attempt has no `send_digest_email` mention in its content (same check as Task 3 Step 4).

- [ ] **Step 4: Report**

Report the outcome to the user: confirm pass/fail for each of the three checks in Step 3. If `sendDigestEmail` failed with a Gmail permission error, stop and report it — per the Global Constraints, do not widen the OAuth scope as a fix without asking the user first.

---

## Self-Review Notes

- Spec coverage: Task 1 covers the `gmailClient.js` changes, Task 2 covers the `chat.js` tool wiring + `pause_turn` handling + `max_tokens` bump, Task 3 covers the `App.jsx` instruction text + daily dedup gate, Task 4 covers the spec's behavioral requirements that need a live system to observe (real email arriving, dedup holding across a real reload).
- No placeholders: every step shows complete code, exact commands, and expected output.
- Type/signature consistency: `sendDigestEmail({ subject, body })` is the only signature used in Task 1 (definition) and Task 2 (call site in `executeTool`) — no `to` parameter anywhere, matching the Global Constraints security requirement. `buildFirstMessageContent(text, weatherData, emailAvailable, includeDigest)` is the only signature used in Task 3 (definition and call site).
