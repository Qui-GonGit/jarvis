# Weekly Digest Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, OS-agnostic Node process (`automation/`) that sends a real weekly platform-engineering & AI digest email every Monday at 06:00 Europe/Rome, using the local `claude` CLI instead of the Anthropic API, sending via Gmail directly (not a draft), and using Supabase for dedupe/logging.

**Architecture:** A persistent Node process (`automation/index.js`) schedules a job in-process with `node-cron` and also runs it once at startup (catch-up). The job (`jobs/weeklyDigest.js`) checks Supabase for "already sent this week", composes the digest via `claude -p --json-schema` (`lib/claudeCli.js`), sends it via Gmail API reusing the existing OAuth token (`lib/gmailSender.js`), and logs the outcome (`lib/supabaseClient.js`).

**Tech Stack:** Node 20+ (ESM), `node-cron`, `@supabase/supabase-js`, `googleapis`, `luxon`, `dotenv`, `node:test` + `node:assert/strict`.

## Global Constraints

- Node 20+ (repo-wide `.nvmrc` requirement).
- ESM modules (`"type": "module"` in `package.json`), matching `server/` and `frontend/`.
- Tests use `node:test` + `node:assert/strict`, colocated as `*.test.js` next to the source file — same convention as `server/src/usageStore.test.js`.
- No automated tests against real external services (Gmail, Supabase, claude CLI) — only pure-logic unit tests with injected fakes, consistent with the spec's Testing section.
- No automatic retries on failure anywhere in this module (spec's explicit Error Handling decision).
- Scheduling lives in JS (`node-cron`), never in an OS-level scheduler (cron/launchd) — the whole point is OS-agnosticism.
- The `claude` CLI must be reachable on `PATH` for whatever shell/session runs `automation/index.js`.
- Reuse the existing Gmail OAuth token at `server/vendor/gmail-token.json` — no new authorization flow.

---

## Prerequisites (manual, before Task 1)

These are operator steps, not code — do them before running anything in `automation/`:

1. Create a Supabase project at https://supabase.com (already planned by the user — "da creare").
2. In the Supabase SQL editor, run:
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
3. Note the project's `URL` and `service_role` key (Project Settings → API) — needed for `automation/.env` in Task 1.

---

### Task 1: Scaffold the `automation` package

**Files:**
- Create: `automation/package.json`
- Create: `automation/.env.example`

**Interfaces:**
- Produces: an installable Node ESM package at `automation/` that later tasks add files into.

- [ ] **Step 1: Create `automation/package.json`**

```json
{
  "name": "automation",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "test": "node --test"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "dotenv": "^17.4.2",
    "googleapis": "^173.0.0",
    "luxon": "^3.5.0",
    "node-cron": "^3.0.3"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && npm install`
Expected: completes without errors, creates `automation/node_modules/` and `automation/package-lock.json`.

- [ ] **Step 3: Create `automation/.env.example`**

```
# Stesso Google OAuth client già usato da server/.env (stesso token salvato in
# server/vendor/gmail-token.json — non serve una nuova autorizzazione).
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/api/email/oauth/callback

# Da Project Settings -> API del progetto Supabase creato nei prerequisiti.
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

- [ ] **Step 4: Copy to a real `.env` and fill in values**

Run: `cp automation/.env.example automation/.env`
Then edit `automation/.env`: copy `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` from `server/.env`, and paste the Supabase `URL`/`service_role key` from the prerequisites step. (`automation/.env` is already covered by the repo's root `.gitignore` `.env` pattern — verify with `git check-ignore -v automation/.env`, expected output: `.gitignore:3:.env	automation/.env`.)

- [ ] **Step 5: Verify the package runs the test runner cleanly**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test`
Expected: exits 0, reports `# tests 0` (no test files yet).

- [ ] **Step 6: Commit**

```bash
git add automation/package.json automation/package-lock.json automation/.env.example
git commit -m "Scaffold automation package for local weekly digest"
```

---

### Task 2: `lib/claudeCli.js` — invoke claude CLI and parse structured output

**Files:**
- Create: `automation/lib/claudeCli.js`
- Test: `automation/lib/claudeCli.test.js`

**Interfaces:**
- Produces: `parseClaudeOutput(rawStdout: string) -> { subject: string, body: string }` (throws on error), `run(prompt: string) -> Promise<{ subject: string, body: string }>`.

This task is grounded in actually invoking the local `claude` CLI to observe the real output shape (verified manually before writing this plan):

```
$ claude -p "..." --output-format json --json-schema '{"type":"object","properties":{"subject":{"type":"string"},"body":{"type":"string"}},"required":["subject","body"]}'
{"type":"result","is_error":false,...,"result":"Done.","structured_output":{"subject":"Test","body":"Hello world"},...}
```

So `result` is the model's free-text reply (not useful here), and `structured_output` holds the schema-conformant object — that's what we parse.

- [ ] **Step 1: Write the failing tests**

```js
// automation/lib/claudeCli.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseClaudeOutput } from './claudeCli.js'

test('parseClaudeOutput extracts subject/body from structured_output', () => {
  const raw = JSON.stringify({
    is_error: false,
    result: 'Done.',
    structured_output: { subject: 'Rassegna', body: 'Contenuto della rassegna.' },
  })

  const result = parseClaudeOutput(raw)

  assert.deepEqual(result, { subject: 'Rassegna', body: 'Contenuto della rassegna.' })
})

test('parseClaudeOutput throws when claude reports is_error', () => {
  const raw = JSON.stringify({ is_error: true, result: 'something went wrong' })

  assert.throws(() => parseClaudeOutput(raw), /something went wrong/)
})

test('parseClaudeOutput throws when structured_output is missing', () => {
  const raw = JSON.stringify({ is_error: false, result: 'Done.' })

  assert.throws(() => parseClaudeOutput(raw), /missing structured subject\/body/)
})

test('parseClaudeOutput throws when stdout is not valid JSON', () => {
  assert.throws(() => parseClaudeOutput('not json'), /invalid JSON/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test lib/claudeCli.test.js`
Expected: FAIL — `claudeCli.js` does not exist yet (`Cannot find module`).

- [ ] **Step 3: Write `automation/lib/claudeCli.js`**

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SUBJECT_BODY_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['subject', 'body'],
})

export function parseClaudeOutput(rawStdout) {
  let parsed
  try {
    parsed = JSON.parse(rawStdout)
  } catch (err) {
    throw new Error(`claude CLI returned invalid JSON: ${err.message}`)
  }

  if (parsed.is_error) {
    throw new Error(`claude CLI reported an error: ${parsed.result ?? 'unknown error'}`)
  }

  const output = parsed.structured_output
  if (!output || typeof output.subject !== 'string' || typeof output.body !== 'string') {
    throw new Error('claude CLI output is missing structured subject/body')
  }

  return { subject: output.subject, body: output.body }
}

export async function run(prompt) {
  let stdout
  try {
    ;({ stdout } = await execFileAsync(
      'claude',
      ['-p', prompt, '--output-format', 'json', '--allowedTools', 'WebSearch', '--json-schema', SUBJECT_BODY_SCHEMA],
      { maxBuffer: 10 * 1024 * 1024, timeout: 5 * 60 * 1000 },
    ))
  } catch (err) {
    throw new Error(`claude CLI exited with an error: ${err.stderr || err.message}`)
  }
  return parseClaudeOutput(stdout)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test lib/claudeCli.test.js`
Expected: PASS, 4/4.

- [ ] **Step 5: Manually verify `run()` against the real CLI**

Run:
```bash
cd /Users/pascucci.n/dev/jarvis/automation
node -e "import('./lib/claudeCli.js').then(m => m.run('Reply with subject \"Test\" and body \"Hello\".')).then(console.log)"
```
Expected: prints `{ subject: 'Test', body: 'Hello' }` (or similar) within ~10-30s.

- [ ] **Step 6: Commit**

```bash
git add automation/lib/claudeCli.js automation/lib/claudeCli.test.js
git commit -m "Add claude CLI wrapper for digest composition"
```

---

### Task 3: `lib/gmailSender.js` — send the digest email via Gmail API

**Files:**
- Create: `automation/lib/gmailSender.js`
- Test: `automation/lib/gmailSender.test.js`

**Interfaces:**
- Consumes: `server/vendor/gmail-token.json` (existing OAuth token, read-only), `process.env.GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI`.
- Produces: `buildRawMessage({ to, subject, body }) -> string` (base64url MIME message), `send({ subject, body }) -> Promise<{ status: 'sent', to: string, subject: string }>`.

This restores logic removed from `server/src/gmailClient.js` in an earlier commit, pointed at the same token file.

- [ ] **Step 1: Write the failing tests**

```js
// automation/lib/gmailSender.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRawMessage } from './gmailSender.js'

function decodeRaw(raw) {
  return Buffer.from(raw, 'base64url').toString('utf-8')
}

test('buildRawMessage includes To, Subject and body as plain text MIME', () => {
  const raw = buildRawMessage({ to: 'me@example.com', subject: 'Hello', body: 'Body text.' })
  const decoded = decodeRaw(raw)

  assert.match(decoded, /^To: me@example\.com\r\n/)
  assert.match(decoded, /Content-Type: text\/plain; charset=utf-8\r\n/)
  assert.match(decoded, /\r\n\r\nBody text\.$/)
})

test('buildRawMessage RFC2047-encodes a UTF-8 subject and round-trips correctly', () => {
  const subject = 'Rassegna è qui 💡'
  const raw = buildRawMessage({ to: 'me@example.com', subject, body: 'x' })
  const decoded = decodeRaw(raw)

  const match = decoded.match(/^Subject: =\?UTF-8\?B\?(.+)\?=\r\n/m)
  assert.ok(match, 'expected an RFC 2047 encoded Subject header')
  const decodedSubject = Buffer.from(match[1], 'base64').toString('utf-8')
  assert.equal(decodedSubject, subject)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test lib/gmailSender.test.js`
Expected: FAIL — `gmailSender.js` does not exist yet.

- [ ] **Step 3: Write `automation/lib/gmailSender.js`**

```js
import { google } from 'googleapis'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tokenPath = path.join(__dirname, '..', '..', 'server', 'vendor', 'gmail-token.json')

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_CLIENT_ID/SECRET not configured')
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
}

async function loadSavedTokens() {
  const raw = await readFile(tokenPath, 'utf-8')
  return JSON.parse(raw)
}

async function getGmailService() {
  const oauth2Client = getOAuthClient()
  const tokens = await loadSavedTokens()
  oauth2Client.setCredentials(tokens)
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

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

export async function send({ subject, body }) {
  const gmail = await getGmailService()
  const profile = await gmail.users.getProfile({ userId: 'me' })
  const to = profile.data.emailAddress
  const raw = buildRawMessage({ to, subject, body })
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  return { status: 'sent', to, subject }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test lib/gmailSender.test.js`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add automation/lib/gmailSender.js automation/lib/gmailSender.test.js
git commit -m "Add Gmail sender reusing the existing OAuth token"
```

(`send()` itself is verified end-to-end in Task 6, once `.env` is filled in — it needs real Gmail credentials and network access, so it is not unit tested here.)

---

### Task 4: `lib/supabaseClient.js` — Supabase client factory

**Files:**
- Create: `automation/lib/supabaseClient.js`
- Test: `automation/lib/supabaseClient.test.js`

**Interfaces:**
- Consumes: `process.env.SUPABASE_URL`, `process.env.SUPABASE_SERVICE_KEY`.
- Produces: `createSupabaseClient() -> SupabaseClient` (throws if env vars missing).

- [ ] **Step 1: Write the failing tests**

```js
// automation/lib/supabaseClient.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSupabaseClient } from './supabaseClient.js'

test('createSupabaseClient throws when SUPABASE_URL is missing', () => {
  const original = { ...process.env }
  delete process.env.SUPABASE_URL
  process.env.SUPABASE_SERVICE_KEY = 'fake-key'

  assert.throws(() => createSupabaseClient(), /SUPABASE_URL/)

  process.env = original
})

test('createSupabaseClient throws when SUPABASE_SERVICE_KEY is missing', () => {
  const original = { ...process.env }
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  delete process.env.SUPABASE_SERVICE_KEY

  assert.throws(() => createSupabaseClient(), /SUPABASE_SERVICE_KEY/)

  process.env = original
})

test('createSupabaseClient returns a client when both env vars are set', () => {
  const original = { ...process.env }
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'fake-key'

  const client = createSupabaseClient()

  assert.equal(typeof client.from, 'function')

  process.env = original
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test lib/supabaseClient.test.js`
Expected: FAIL — `supabaseClient.js` does not exist yet.

- [ ] **Step 3: Write `automation/lib/supabaseClient.js`**

```js
import { createClient } from '@supabase/supabase-js'

export function createSupabaseClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not configured')
  if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY is not configured')
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test lib/supabaseClient.test.js`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add automation/lib/supabaseClient.js automation/lib/supabaseClient.test.js
git commit -m "Add Supabase client factory"
```

---

### Task 5: `jobs/weeklyDigest.js` — dedupe, orchestration, catch-up logic

**Files:**
- Create: `automation/jobs/weeklyDigest.js`
- Test: `automation/jobs/weeklyDigest.test.js`

**Interfaces:**
- Consumes: `claudeCli.run(prompt) -> Promise<{subject, body}>` (Task 2), `gmailSender.send({subject, body}) -> Promise<{status, to, subject}>` (Task 3), `createSupabaseClient()` (Task 4) — a Supabase client exposing `.from(table).select(...).eq(...).order(...).limit(...)` (thenable, resolves `{data, error}`) and `.from(table).insert(row)` (thenable, resolves `{error}`).
- Produces: `isWithinCurrentWeek(sentAtIso: string, nowIso: string, timezone: string) -> boolean`, `run({ force, now, supabase, claudeCli, gmailSender } = {}) -> Promise<{ status: 'sent'|'failed'|'skipped', subject?, error?, reason? }>`.

- [ ] **Step 1: Write the failing tests for `isWithinCurrentWeek`**

```js
// automation/jobs/weeklyDigest.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isWithinCurrentWeek } from './weeklyDigest.js'

test('isWithinCurrentWeek is true for a timestamp earlier this same week', () => {
  // Monday 2026-06-22 is the start of this week; Wednesday is later in the same week.
  const now = '2026-06-24T10:00:00+02:00'
  const sentAt = '2026-06-22T06:05:00+02:00'

  assert.equal(isWithinCurrentWeek(sentAt, now, 'Europe/Rome'), true)
})

test('isWithinCurrentWeek is false for a timestamp from the previous week', () => {
  const now = '2026-06-24T10:00:00+02:00'
  const sentAt = '2026-06-15T06:05:00+02:00'

  assert.equal(isWithinCurrentWeek(sentAt, now, 'Europe/Rome'), false)
})

test('isWithinCurrentWeek is true exactly at the Monday 00:00 boundary', () => {
  const now = '2026-06-22T23:59:00+02:00'
  const sentAt = '2026-06-22T00:00:00+02:00'

  assert.equal(isWithinCurrentWeek(sentAt, now, 'Europe/Rome'), true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test jobs/weeklyDigest.test.js`
Expected: FAIL — `weeklyDigest.js` does not exist yet.

- [ ] **Step 3: Write `isWithinCurrentWeek` in `automation/jobs/weeklyDigest.js`**

```js
import { DateTime } from 'luxon'
import { createSupabaseClient } from '../lib/supabaseClient.js'
import * as claudeCli from '../lib/claudeCli.js'
import * as gmailSender from '../lib/gmailSender.js'

export const JOB_NAME = 'weekly-platform-engineering'
const TIMEZONE = 'Europe/Rome'

export const PROMPT =
  'Cerca sul web le novità più recenti (ultimi 2-3 giorni) nel mondo platform engineering, cloud, ' +
  'Kubernetes, SRE, DevOps e AI (modelli, tool, paper, framework). Seleziona al massimo 6-8 novità con ' +
  'il maggior potenziale come spunto per un articolo (Medium o rivista scientifica). Componi una sola ' +
  'email di rassegna: oggetto "Rassegna platform engineering & AI – {data di oggi}"; per ciascuna ' +
  'novità selezionata, titolo, breve riassunto (2-3 frasi), link alla fonte, e una nota "💡 spunto ' +
  'articolo" sulle voci più promettenti. Rispondi solo con l\'oggetto e il corpo dell\'email, nessun ' +
  'altro testo.'

export function isWithinCurrentWeek(sentAtIso, nowIso, timezone) {
  const now = DateTime.fromISO(nowIso, { zone: timezone })
  const weekStart = now.startOf('day').minus({ days: now.weekday - 1 })
  const sentAt = DateTime.fromISO(sentAtIso, { zone: timezone })
  return sentAt >= weekStart && sentAt <= now
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test jobs/weeklyDigest.test.js`
Expected: PASS, 3/3.

- [ ] **Step 5: Write the failing tests for `run()`**

First, update the import line at the top of `automation/jobs/weeklyDigest.test.js` to also bring in `run`:

```js
import { isWithinCurrentWeek, run } from './weeklyDigest.js'
```

Then append the following to the same file:

```js
function fakeSupabase({ selectResult = { data: [], error: null }, insertError = null, inserts = [] } = {}) {
  return {
    from() {
      return {
        select() { return this },
        eq() { return this },
        order() { return this },
        limit() { return Promise.resolve(selectResult) },
        insert(row) {
          inserts.push(row)
          return Promise.resolve({ error: insertError })
        },
      }
    },
  }
}

test('run() skips and does not call claude/gmail when already sent this week', async () => {
  const now = new Date('2026-06-24T10:00:00+02:00')
  const supabase = fakeSupabase({
    selectResult: { data: [{ sent_at: '2026-06-22T06:05:00+02:00' }], error: null },
  })
  let claudeCalled = false
  let gmailCalled = false

  const result = await run({
    now,
    supabase,
    claudeCli: { run: async () => { claudeCalled = true; return { subject: 'S', body: 'B' } } },
    gmailSender: { send: async () => { gmailCalled = true } },
  })

  assert.deepEqual(result, { status: 'skipped', reason: 'already_sent' })
  assert.equal(claudeCalled, false)
  assert.equal(gmailCalled, false)
})

test('run() composes, sends, and logs sent when nothing was sent this week', async () => {
  const inserts = []
  const supabase = fakeSupabase({ inserts })

  const result = await run({
    now: new Date('2026-06-24T10:00:00+02:00'),
    supabase,
    claudeCli: { run: async () => ({ subject: 'Rassegna', body: 'Contenuto' }) },
    gmailSender: { send: async () => ({ status: 'sent' }) },
  })

  assert.deepEqual(result, { status: 'sent', subject: 'Rassegna' })
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].status, 'sent')
  assert.equal(inserts[0].subject, 'Rassegna')
})

test('run() logs failed and returns failed when claude composition throws', async () => {
  const inserts = []
  const supabase = fakeSupabase({ inserts })

  const result = await run({
    now: new Date('2026-06-24T10:00:00+02:00'),
    supabase,
    claudeCli: { run: async () => { throw new Error('claude exploded') } },
    gmailSender: { send: async () => { throw new Error('should not be called') } },
  })

  assert.deepEqual(result, { status: 'failed', error: 'claude exploded' })
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].status, 'failed')
  assert.equal(inserts[0].error, 'claude exploded')
})

test('run() skips without calling claude/gmail when the dedupe check itself fails', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        order() { return this },
        limit() { return Promise.resolve({ data: null, error: new Error('network down') }) },
      }
    },
  }
  let claudeCalled = false

  const result = await run({
    now: new Date('2026-06-24T10:00:00+02:00'),
    supabase,
    claudeCli: { run: async () => { claudeCalled = true; return { subject: 'S', body: 'B' } } },
    gmailSender: { send: async () => {} },
  })

  assert.deepEqual(result, { status: 'skipped', reason: 'dedupe_check_failed' })
  assert.equal(claudeCalled, false)
})

test('run() with force:true ignores dedupe even when already sent this week', async () => {
  const inserts = []
  const supabase = fakeSupabase({
    selectResult: { data: [{ sent_at: '2026-06-22T06:05:00+02:00' }], error: null },
    inserts,
  })

  const result = await run({
    force: true,
    now: new Date('2026-06-24T10:00:00+02:00'),
    supabase,
    claudeCli: { run: async () => ({ subject: 'Rassegna', body: 'Contenuto' }) },
    gmailSender: { send: async () => ({ status: 'sent' }) },
  })

  assert.deepEqual(result, { status: 'sent', subject: 'Rassegna' })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test jobs/weeklyDigest.test.js`
Expected: FAIL — `weeklyDigest.js` does not export `run` yet, so the whole file fails to load (`SyntaxError: The requested module './weeklyDigest.js' does not provide an export named 'run'`). That counts as the expected failure for this step.

- [ ] **Step 7: Implement `run()` in `automation/jobs/weeklyDigest.js`**

Append to the file (after `isWithinCurrentWeek`):

```js
async function alreadySentThisWeek(supabase, now) {
  const { data, error } = await supabase
    .from('digest_log')
    .select('sent_at')
    .eq('job_name', JOB_NAME)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)

  if (error) throw error
  if (!data || data.length === 0) return false
  return isWithinCurrentWeek(data[0].sent_at, now.toISOString(), TIMEZONE)
}

async function logResult(supabase, { status, subject, error }) {
  const { error: insertError } = await supabase.from('digest_log').insert({
    job_name: JOB_NAME,
    sent_at: new Date().toISOString(),
    subject: subject ?? null,
    status,
    error: error ?? null,
  })
  if (insertError) throw insertError
}

export async function run({
  force = false,
  now = new Date(),
  supabase,
  claudeCli: claudeCliDep = claudeCli,
  gmailSender: gmailSenderDep = gmailSender,
} = {}) {
  if (!force) {
    let skip
    try {
      skip = await alreadySentThisWeek(supabase, now)
    } catch (err) {
      console.error('digest: dedupe check failed, skipping this turn:', err.message)
      return { status: 'skipped', reason: 'dedupe_check_failed' }
    }
    if (skip) {
      console.log('digest: already sent this week, skipping')
      return { status: 'skipped', reason: 'already_sent' }
    }
  }

  let composed
  try {
    composed = await claudeCliDep.run(PROMPT)
    await gmailSenderDep.send(composed)
  } catch (err) {
    console.error('digest: failed:', err.message)
    try {
      await logResult(supabase, { status: 'failed', subject: composed?.subject, error: err.message })
    } catch (logErr) {
      console.error('digest: failed to log failure to Supabase:', logErr.message)
    }
    return { status: 'failed', error: err.message }
  }

  try {
    await logResult(supabase, { status: 'sent', subject: composed.subject })
  } catch (logErr) {
    console.error('digest: email sent but failed to log to Supabase:', logErr.message)
  }

  return { status: 'sent', subject: composed.subject }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force')
  const supabase = createSupabaseClient()
  run({ force, supabase }).then((result) => {
    console.log('digest job result:', result)
    process.exit(result.status === 'failed' ? 1 : 0)
  })
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node --test jobs/weeklyDigest.test.js`
Expected: PASS, 8/8 (3 from Step 1 + 5 from Step 5).

- [ ] **Step 9: Commit**

```bash
git add automation/jobs/weeklyDigest.js automation/jobs/weeklyDigest.test.js
git commit -m "Add weekly digest job orchestration with dedupe and catch-up support"
```

---

### Task 6: `index.js` — wire the cron schedule and catch-up, verify end-to-end

**Files:**
- Create: `automation/index.js`

**Interfaces:**
- Consumes: `createSupabaseClient()` (Task 4), `run()` (Task 5).

This task has no automated test (it's a thin wiring file whose only behaviors are "register a cron job" and "call `run()` once at startup" — both already covered by Task 5's tests). It's verified manually instead, as planned in the spec's Testing section.

- [ ] **Step 1: Write `automation/index.js`**

```js
import 'dotenv/config'
import cron from 'node-cron'
import { createSupabaseClient } from './lib/supabaseClient.js'
import { run } from './jobs/weeklyDigest.js'

const TIMEZONE = 'Europe/Rome'
const supabase = createSupabaseClient()

async function runJob() {
  const result = await run({ supabase })
  console.log('digest job result:', result)
}

cron.schedule('0 6 * * 1', runJob, { timezone: TIMEZONE })

console.log('automation: weekly digest scheduler running (Mon 06:00 Europe/Rome)')

// Catch-up: if the process starts after a missed Monday run (e.g. the Mac was
// off or asleep), run() applies the same dedupe check and fires immediately
// instead of waiting for next Monday.
runJob()
```

- [ ] **Step 2: Verify `automation/.env` is filled in (from Task 1, Step 4)**

Confirm `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` are all non-empty in `automation/.env`.

- [ ] **Step 3: Manually verify the forced one-off run**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node jobs/weeklyDigest.js --force`
Expected: within a couple of minutes, prints `digest job result: { status: 'sent', subject: '...' }`, a new digest email actually arrives in the Gmail inbox, and a new row with `status: 'sent'` appears in the Supabase `digest_log` table.

- [ ] **Step 4: Manually verify the dedupe skip**

Run again immediately: `cd /Users/pascucci.n/dev/jarvis/automation && node jobs/weeklyDigest.js`
Expected: prints `digest job result: { status: 'skipped', reason: 'already_sent' }`, no second email, no new Supabase row.

- [ ] **Step 5: Manually verify the persistent process and catch-up**

Run: `cd /Users/pascucci.n/dev/jarvis/automation && node index.js`
Expected: prints the "scheduler running" line, then immediately prints a `digest job result: { status: 'skipped', reason: 'already_sent' }` (catch-up ran, found this week's send from Step 3, skipped correctly). Leave it running — it will fire for real next Monday at 06:00 Europe/Rome. Stop with Ctrl-C when done verifying.

- [ ] **Step 6: Commit**

```bash
git add automation/index.js
git commit -m "Wire up cron schedule and startup catch-up for the weekly digest"
```

---

## After implementation (manual, not code)

Once Task 6's manual verification confirms a real email arrives and dedupe/catch-up behave correctly:

- Disable the cloud routine "Email news" (`trig_011oFJKbVRtguutRdrkUC8ZU`) via `RemoteTrigger update` (`enabled: false`) or at https://claude.ai/code/routines — it's superseded by this local automation and only ever produced unsendable drafts.
- Decide how to keep `automation/index.js` running continuously (terminal, `pm2`, a system service) — deliberately left as an operator choice, not part of this plan (see spec's Out of Scope).
