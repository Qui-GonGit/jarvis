# Token Usage Widget + Notion Digest Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard widget showing estimated cumulative Anthropic token consumption, and replace the browser-`localStorage` "already sent today" check for the daily digest email with a server-side flag stored in a Notion database.

**Architecture:** A small local JSON file (`server/data/usage.json`) accumulates token counts read from every Anthropic API response; a new Notion-backed module checks/records "digest sent today" so the backend — not the browser — is the single source of truth for the once-a-day digest dedupe.

**Tech Stack:** Node.js (Express, ESM), `@notionhq/client` (official Notion SDK), Node's built-in `node:test` runner (no new test framework dependency), React (frontend, unchanged stack).

## Global Constraints

- The machine's default `node` resolves to v16.20.2, which does **not** have `node:test`. Every command in this plan that runs `node --test` or starts the server must use the v20.20.2 binary: `/Users/pascucci.n/.nvm/versions/node/v20.20.2/bin/node`. `npm install` and `npm test` (once the `test` script exists) also need this binary on `PATH` — prefix commands with `PATH="/Users/pascucci.n/.nvm/versions/node/v20.20.2/bin:$PATH"` if invoking through `npm`.
- `server/` is an ESM package (`"type": "module"` in `server/package.json`) — use `import`/`export`, never `require`.
- Match the existing code style exactly: no semicolons, single quotes, 2-space indentation (see `server/src/gmailClient.js`, `server/src/routes/chat.js`).
- Optional integrations that aren't configured must degrade silently (return `null`/`false`/no-op), never throw — this is the existing convention for `ANTHROPIC_API_KEY` (`chat.js`) and `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (`gmailClient.js`). The new Notion integration follows the same rule.
- Design doc: `docs/superpowers/specs/2026-06-21-token-usage-and-digest-flag-design.md` — re-read it if anything in this plan seems to contradict it.

---

### Task 1: Usage store module

**Files:**
- Create: `server/src/usageStore.js`
- Create: `server/src/usageStore.test.js`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: `mergeUsage(current, deltaInputTokens, deltaOutputTokens) -> { inputTokens, outputTokens }` (pure). `createUsageStore(filePath) -> { read, add }` where `read() -> Promise<{ inputTokens, outputTokens }>` and `add(deltaInputTokens, deltaOutputTokens) -> Promise<{ inputTokens, outputTokens }>` (the new totals after adding).

- [ ] **Step 1: Write the failing tests**

Create `server/src/usageStore.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { mergeUsage, createUsageStore } from './usageStore.js'

test('mergeUsage adds deltas to current totals', () => {
  const result = mergeUsage({ inputTokens: 10, outputTokens: 5 }, 3, 2)
  assert.deepEqual(result, { inputTokens: 13, outputTokens: 7 })
})

test('usageStore.read returns zeros when the file does not exist', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'usage-store-'))
  const store = createUsageStore(path.join(dir, 'usage.json'))

  const result = await store.read()

  assert.deepEqual(result, { inputTokens: 0, outputTokens: 0 })
  await rm(dir, { recursive: true, force: true })
})

test('usageStore.add persists accumulated totals across calls', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'usage-store-'))
  const filePath = path.join(dir, 'usage.json')
  const store = createUsageStore(filePath)

  await store.add(100, 20)
  const second = await store.add(50, 10)

  assert.deepEqual(second, { inputTokens: 150, outputTokens: 30 })
  const onDisk = JSON.parse(await readFile(filePath, 'utf-8'))
  assert.deepEqual(onDisk, { inputTokens: 150, outputTokens: 30 })
  await rm(dir, { recursive: true, force: true })
})

test('usageStore.read recovers from a corrupt file instead of throwing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'usage-store-'))
  const filePath = path.join(dir, 'usage.json')
  const store = createUsageStore(filePath)
  await store.add(5, 5) // creates a valid file first

  const { writeFile } = await import('node:fs/promises')
  await writeFile(filePath, 'not json{{{')

  const result = await store.read()

  assert.deepEqual(result, { inputTokens: 0, outputTokens: 0 })
  await rm(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/pascucci.n/dev/jarvis/server && /Users/pascucci.n/.nvm/versions/node/v20.20.2/bin/node --test src/usageStore.test.js`
Expected: FAIL — `Cannot find module './usageStore.js'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `server/src/usageStore.js`:

```js
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import path from 'node:path'

export function mergeUsage(current, deltaInputTokens, deltaOutputTokens) {
  return {
    inputTokens: current.inputTokens + deltaInputTokens,
    outputTokens: current.outputTokens + deltaOutputTokens,
  }
}

export function createUsageStore(filePath) {
  async function read() {
    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return {
        inputTokens: Number(parsed.inputTokens) || 0,
        outputTokens: Number(parsed.outputTokens) || 0,
      }
    } catch {
      return { inputTokens: 0, outputTokens: 0 }
    }
  }

  async function add(deltaInputTokens, deltaOutputTokens) {
    const current = await read()
    const next = mergeUsage(current, deltaInputTokens, deltaOutputTokens)
    await mkdir(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(next, null, 2))
    await rename(tmpPath, filePath)
    return next
  }

  return { read, add }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/pascucci.n/dev/jarvis/server && /Users/pascucci.n/.nvm/versions/node/v20.20.2/bin/node --test src/usageStore.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 5: Ignore the generated data file**

Add this line to `.gitignore` at the repo root (`/Users/pascucci.n/dev/jarvis/.gitignore`), after the existing `server/vendor/gmail-token.json` line:

```
server/data/
```

- [ ] **Step 6: Commit**

```bash
cd /Users/pascucci.n/dev/jarvis
git add server/src/usageStore.js server/src/usageStore.test.js .gitignore
git commit -m "Add local usage store for cumulative Anthropic token counts"
```

---

### Task 2: Add the Notion SDK dependency and a test script

**Files:**
- Modify: `server/package.json`

**Interfaces:**
- Produces: `@notionhq/client` available as an import in `server/src/`. `npm test` runs `node --test`.

- [ ] **Step 1: Install the dependency**

Run: `cd /Users/pascucci.n/dev/jarvis/server && PATH="/Users/pascucci.n/.nvm/versions/node/v20.20.2/bin:$PATH" npm install @notionhq/client`
Expected: `package.json` gains `@notionhq/client` under `dependencies`; `package-lock.json` is created/updated.

- [ ] **Step 2: Add the `test` script**

Open `server/package.json` and change the `"scripts"` block from:

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
```

to:

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "node --test"
  },
```

- [ ] **Step 3: Verify the script runs the existing tests**

Run: `cd /Users/pascucci.n/dev/jarvis/server && PATH="/Users/pascucci.n/.nvm/versions/node/v20.20.2/bin:$PATH" npm test`
Expected: PASS — the 4 tests from Task 1 run via `node --test` (auto-discovers `*.test.js`).

- [ ] **Step 4: Commit**

```bash
cd /Users/pascucci.n/dev/jarvis
git add server/package.json server/package-lock.json
git commit -m "Add @notionhq/client dependency and a test script"
```

---

### Task 3: Notion digest log module

**Files:**
- Create: `server/src/notionDigestLog.js`
- Create: `server/src/notionDigestLog.test.js`

**Interfaces:**
- Consumes: `@notionhq/client`'s `Client` class (`new Client({ auth })`, `client.databases.query({ database_id, filter })`, `client.pages.create({ parent, properties })`).
- Produces: `todayDateKey(date = new Date()) -> string` (pure, `'YYYY-MM-DD'`, local time). `hasDigestBeenSentToday() -> Promise<boolean>`. `logDigestSent() -> Promise<void>`. Both read `process.env.NOTION_API_KEY` and `process.env.NOTION_DIGEST_DB_ID` at call time and no-op/return `false` if either is missing.

- [ ] **Step 1: Write the failing tests**

Create `server/src/notionDigestLog.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { todayDateKey, hasDigestBeenSentToday, logDigestSent } from './notionDigestLog.js'

test('todayDateKey formats a date as YYYY-MM-DD', () => {
  const date = new Date(2026, 5, 21) // month is 0-indexed: 5 = June
  assert.equal(todayDateKey(date), '2026-06-21')
})

test('todayDateKey pads single-digit month and day', () => {
  const date = new Date(2026, 0, 3) // January 3rd
  assert.equal(todayDateKey(date), '2026-01-03')
})

test('hasDigestBeenSentToday returns false without network access when Notion is not configured', async () => {
  const originalKey = process.env.NOTION_API_KEY
  const originalDb = process.env.NOTION_DIGEST_DB_ID
  delete process.env.NOTION_API_KEY
  delete process.env.NOTION_DIGEST_DB_ID

  const result = await hasDigestBeenSentToday()
  assert.equal(result, false)

  if (originalKey !== undefined) process.env.NOTION_API_KEY = originalKey
  if (originalDb !== undefined) process.env.NOTION_DIGEST_DB_ID = originalDb
})

test('logDigestSent is a no-op without crashing when Notion is not configured', async () => {
  const originalKey = process.env.NOTION_API_KEY
  const originalDb = process.env.NOTION_DIGEST_DB_ID
  delete process.env.NOTION_API_KEY
  delete process.env.NOTION_DIGEST_DB_ID

  await assert.doesNotReject(() => logDigestSent())

  if (originalKey !== undefined) process.env.NOTION_API_KEY = originalKey
  if (originalDb !== undefined) process.env.NOTION_DIGEST_DB_ID = originalDb
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/pascucci.n/dev/jarvis/server && PATH="/Users/pascucci.n/.nvm/versions/node/v20.20.2/bin:$PATH" npm test`
Expected: FAIL on the 4 new tests — `Cannot find module './notionDigestLog.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/notionDigestLog.js`:

```js
import { Client } from '@notionhq/client'

export function todayDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getClient() {
  const { NOTION_API_KEY } = process.env
  if (!NOTION_API_KEY) return null
  return new Client({ auth: NOTION_API_KEY })
}

export async function hasDigestBeenSentToday() {
  const client = getClient()
  const databaseId = process.env.NOTION_DIGEST_DB_ID
  if (!client || !databaseId) return false

  const response = await client.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        { property: 'Date', date: { equals: todayDateKey() } },
        { property: 'Status', select: { equals: 'sent' } },
      ],
    },
  })
  return response.results.length > 0
}

export async function logDigestSent() {
  const client = getClient()
  const databaseId = process.env.NOTION_DIGEST_DB_ID
  if (!client || !databaseId) return

  const todayKey = todayDateKey()
  await client.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Day: { title: [{ text: { content: todayKey } }] },
      Date: { date: { start: todayKey } },
      'Sent At': { date: { start: new Date().toISOString() } },
      Status: { select: { name: 'sent' } },
    },
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/pascucci.n/dev/jarvis/server && PATH="/Users/pascucci.n/.nvm/versions/node/v20.20.2/bin:$PATH" npm test`
Expected: PASS — all 8 tests (4 from Task 1, 4 from this task), 0 failures. These tests never call the live Notion API (the "not configured" branch is what's covered); the live-credential path is verified manually in Task 6.

- [ ] **Step 5: Commit**

```bash
cd /Users/pascucci.n/dev/jarvis
git add server/src/notionDigestLog.js server/src/notionDigestLog.test.js
git commit -m "Add Notion-backed digest-sent flag module"
```

---

### Task 4: Wire usage tracking and the digest dedupe into the chat routes

**Files:**
- Modify: `server/src/routes/chat.js`
- Create: `server/src/routes/usage.js`
- Modify: `server/src/index.js`
- Modify: `server/.env.example`

**Interfaces:**
- Consumes: `createUsageStore` from `../usageStore.js` (Task 1); `hasDigestBeenSentToday`, `logDigestSent` from `../notionDigestLog.js` (Task 3).
- Produces: `GET /api/usage/tokens -> { inputTokens, outputTokens, totalTokens }`. `runAgentLoop` now returns `{ reply, usage: { inputTokens, outputTokens } }` instead of a bare string — both call sites in `chat.js` are updated together with this change.

- [ ] **Step 1: Update `chat.js` imports and add the usage store instance**

In `server/src/routes/chat.js`, replace:

```js
import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { listImportantUnread, getFullEmail, markEmailRead, trashEmail, sendDigestEmail } from '../gmailClient.js'

const router = Router()

const apiKey = process.env.ANTHROPIC_API_KEY
const anthropic = apiKey ? new Anthropic({ apiKey }) : null
```

with:

```js
import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listImportantUnread, getFullEmail, markEmailRead, trashEmail, sendDigestEmail } from '../gmailClient.js'
import { createUsageStore } from '../usageStore.js'
import { hasDigestBeenSentToday, logDigestSent } from '../notionDigestLog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const usageStore = createUsageStore(path.join(__dirname, '..', '..', 'data', 'usage.json'))

const router = Router()

const apiKey = process.env.ANTHROPIC_API_KEY
const anthropic = apiKey ? new Anthropic({ apiKey }) : null
```

- [ ] **Step 2: Track usage inside `runAgentLoop`**

Replace the whole `runAgentLoop` function:

```js
async function runAgentLoop(initialMessages) {
  let conversation = initialMessages

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools,
    messages: conversation,
  })

  let loopGuard = 0
  while ((response.stop_reason === 'tool_use' || response.stop_reason === 'pause_turn') && loopGuard < 10) {
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
      // web_search's dynamic filtering runs in a code-execution container; resuming a
      // pending tool use from it 400s without echoing that container id back.
      ...(response.container?.id ? { container: response.container.id } : {}),
    })
  }

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}
```

with (adds a `usage` accumulator updated after every `anthropic.messages.create` call, and returns it alongside the reply):

```js
function addResponseUsage(totals, response) {
  const usage = response.usage || {}
  totals.inputTokens +=
    (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0)
  totals.outputTokens += usage.output_tokens || 0
}

async function runAgentLoop(initialMessages) {
  let conversation = initialMessages
  const usage = { inputTokens: 0, outputTokens: 0 }

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools,
    messages: conversation,
  })
  addResponseUsage(usage, response)

  let loopGuard = 0
  while ((response.stop_reason === 'tool_use' || response.stop_reason === 'pause_turn') && loopGuard < 10) {
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
      // web_search's dynamic filtering runs in a code-execution container; resuming a
      // pending tool use from it 400s without echoing that container id back.
      ...(response.container?.id ? { container: response.container.id } : {}),
    })
    addResponseUsage(usage, response)
  }

  const reply = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  return { reply, usage }
}
```

- [ ] **Step 3: Update the `/` route to persist usage**

Replace:

```js
router.post('/', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' })
  }

  const { messages } = req.body
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  try {
    const conversation = messages.map(({ role, content }) => ({ role, content }))
    const reply = await runAgentLoop(conversation)
    res.json({ reply })
  } catch (err) {
    console.error('Anthropic API error:', err.message)
    res.status(502).json({ error: 'Failed to get a response from Claude.' })
  }
})
```

with:

```js
router.post('/', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' })
  }

  const { messages } = req.body
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  try {
    const conversation = messages.map(({ role, content }) => ({ role, content }))
    const { reply, usage } = await runAgentLoop(conversation)
    await usageStore.add(usage.inputTokens, usage.outputTokens)
    res.json({ reply })
  } catch (err) {
    console.error('Anthropic API error:', err.message)
    res.status(502).json({ error: 'Failed to get a response from Claude.' })
  }
})
```

- [ ] **Step 4: Update the `/digest` route to check and record the Notion flag**

Replace:

```js
// Fire-and-forget digest generation, kept off the main chat turn so it never delays the
// spoken reply (web_search + composing/sending the email can take the better part of a minute).
router.post('/digest', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' })
  }

  try {
    await runAgentLoop([{ role: 'user', content: DIGEST_INSTRUCTION }])
    res.json({ ok: true })
  } catch (err) {
    console.error('Digest generation error:', err.message)
    res.status(502).json({ error: 'Failed to generate the digest.' })
  }
})
```

with:

```js
// Fire-and-forget digest generation, kept off the main chat turn so it never delays the
// spoken reply (web_search + composing/sending the email can take the better part of a minute).
router.post('/digest', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' })
  }

  try {
    // A Notion failure here (bad token, network blip) must not block the digest
    // attempt — better an occasional duplicate email than none at all.
    let alreadySent = false
    try {
      alreadySent = await hasDigestBeenSentToday()
    } catch (err) {
      console.error('Notion digest-check failed, proceeding with send:', err.message)
    }
    if (alreadySent) {
      return res.json({ ok: true, skipped: true })
    }

    const { usage } = await runAgentLoop([{ role: 'user', content: DIGEST_INSTRUCTION }])
    await usageStore.add(usage.inputTokens, usage.outputTokens)

    try {
      await logDigestSent()
    } catch (err) {
      console.error('Failed to log digest send to Notion:', err.message)
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Digest generation error:', err.message)
    res.status(502).json({ error: 'Failed to generate the digest.' })
  }
})
```

- [ ] **Step 5: Create the token usage endpoint**

Create `server/src/routes/usage.js`:

```js
import { Router } from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUsageStore } from '../usageStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const usageStore = createUsageStore(path.join(__dirname, '..', '..', 'data', 'usage.json'))

const router = Router()

router.get('/tokens', async (req, res) => {
  const { inputTokens, outputTokens } = await usageStore.read()
  res.json({ inputTokens, outputTokens, totalTokens: inputTokens + outputTokens })
})

export default router
```

- [ ] **Step 6: Mount the new route and add a health check field**

In `server/src/index.js`, replace:

```js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import chatRouter from './routes/chat.js'
import systemStatsRouter from './routes/systemStats.js'
import weatherRouter from './routes/weather.js'
import ttsRouter from './routes/tts.js'
import emailRouter from './routes/email.js'
import etfRouter from './routes/etf.js'
```

with:

```js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import chatRouter from './routes/chat.js'
import systemStatsRouter from './routes/systemStats.js'
import weatherRouter from './routes/weather.js'
import ttsRouter from './routes/tts.js'
import emailRouter from './routes/email.js'
import etfRouter from './routes/etf.js'
import usageRouter from './routes/usage.js'
```

Then replace:

```js
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    elevenLabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    piperConfigured: true,
    gmailConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  })
})

app.use('/api/chat', chatRouter)
app.use('/api/system-stats', systemStatsRouter)
app.use('/api/weather', weatherRouter)
app.use('/api/tts', ttsRouter)
app.use('/api/email', emailRouter)
app.use('/api/etf', etfRouter)
```

with:

```js
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    elevenLabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    piperConfigured: true,
    gmailConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    notionConfigured: Boolean(process.env.NOTION_API_KEY && process.env.NOTION_DIGEST_DB_ID),
  })
})

app.use('/api/chat', chatRouter)
app.use('/api/system-stats', systemStatsRouter)
app.use('/api/weather', weatherRouter)
app.use('/api/tts', ttsRouter)
app.use('/api/email', emailRouter)
app.use('/api/etf', etfRouter)
app.use('/api/usage', usageRouter)
```

- [ ] **Step 7: Document the new env vars**

Append to `server/.env.example`, after the `ETF_TICKERS=` line:

```
# Optional: lets JARVIS check on Notion whether today's platform-engineering
# digest email has already been sent, instead of relying on browser
# localStorage. Create an internal integration at
# https://www.notion.so/my-integrations, then share the "Jarvis Digest Log"
# database with it (database "..." menu > Connections).
NOTION_API_KEY=
NOTION_DIGEST_DB_ID=
```

- [ ] **Step 8: Re-run the full test suite**

Run: `cd /Users/pascucci.n/dev/jarvis/server && PATH="/Users/pascucci.n/.nvm/versions/node/v20.20.2/bin:$PATH" npm test`
Expected: PASS — same 8 tests as Task 3, unaffected by this task's changes (no new automated tests here; `chat.js` and `usage.js` are verified manually in Task 6, consistent with how the rest of this router was verified earlier).

- [ ] **Step 9: Commit**

```bash
cd /Users/pascucci.n/dev/jarvis
git add server/src/routes/chat.js server/src/routes/usage.js server/src/index.js server/.env.example
git commit -m "Track token usage and gate the daily digest on a Notion flag"
```

---

### Task 5: Frontend token usage widget and digest trigger cleanup

**Files:**
- Create: `frontend/src/components/TokenUsagePanel.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/usage/tokens` (Task 4) via the existing `usePolling` hook; the existing `Panel` component from `./Panel.jsx`.
- Produces: `<TokenUsagePanel usage={{ inputTokens, outputTokens, totalTokens }} online={boolean} />`.

- [ ] **Step 1: Create the widget component**

Create `frontend/src/components/TokenUsagePanel.jsx`:

```jsx
import { Panel } from './Panel'

function formatTokens(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function TokenUsagePanel({ usage, online }) {
  return (
    <Panel title="Token Anthropic">
      {!online || !usage ? (
        <p className="text-xs text-cyan-500/50">Backend offline — no live data.</p>
      ) : (
        <div className="space-y-1">
          <div className="text-lg font-semibold text-cyan-50">{formatTokens(usage.totalTokens)} token</div>
          <div className="text-xs text-cyan-500/60">
            {formatTokens(usage.inputTokens)} input · {formatTokens(usage.outputTokens)} output
          </div>
        </div>
      )}
    </Panel>
  )
}
```

- [ ] **Step 2: Wire the widget and simplify the digest trigger in `App.jsx`**

Replace:

```js
import { ETFPanel } from './components/ETFPanel'
```

with:

```js
import { ETFPanel } from './components/ETFPanel'
import { TokenUsagePanel } from './components/TokenUsagePanel'
```

Replace:

```js
function triggerDailyDigest() {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (localStorage.getItem('jarvisLastDigestSentAt') === today) return
  localStorage.setItem('jarvisLastDigestSentAt', today)

  fetch('/api/chat/digest', { method: 'POST' }).catch((err) => {
    console.error('Digest request failed:', err)
  })
}
```

with:

```js
function triggerDailyDigest() {
  // The backend is the source of truth for "already sent today" (checked
  // against a Notion flag) — it no-ops quickly if so, so this can fire
  // unconditionally on every first message of a session.
  fetch('/api/chat/digest', { method: 'POST' }).catch((err) => {
    console.error('Digest request failed:', err)
  })
}
```

Replace:

```js
  const etf = usePolling('/api/etf', { intervalMs: 5 * 60 * 1000 })
```

with:

```js
  const etf = usePolling('/api/etf', { intervalMs: 5 * 60 * 1000 })
  const tokenUsage = usePolling('/api/usage/tokens', { intervalMs: 30 * 1000 })
```

Replace:

```jsx
          <ETFPanel etfs={etf.data?.etfs} online={etf.online} onRefresh={etf.refresh} />
```

with:

```jsx
          <ETFPanel etfs={etf.data?.etfs} online={etf.online} onRefresh={etf.refresh} />
          <TokenUsagePanel usage={tokenUsage.data} online={tokenUsage.online} />
```

- [ ] **Step 3: Build the frontend to catch syntax errors**

Run: `cd /Users/pascucci.n/dev/jarvis/frontend && /Users/pascucci.n/.nvm/versions/node/v20.20.2/bin/node /Users/pascucci.n/.nvm/versions/node/v20.20.2/lib/node_modules/npm/bin/npm-cli.js run build`

(Equivalently, with the v20 binary on `PATH`: `PATH="/Users/pascucci.n/.nvm/versions/node/v20.20.2/bin:$PATH" npm run build` — the default v16 `node` cannot run Vite, as established earlier in this project.)

Expected: PASS — `vite build` completes with no errors, producing `frontend/dist/`.

- [ ] **Step 4: Commit**

```bash
cd /Users/pascucci.n/dev/jarvis
git add frontend/src/components/TokenUsagePanel.jsx frontend/src/App.jsx
git commit -m "Add token usage widget and drop the localStorage digest dedupe"
```

---

### Task 6: Manual end-to-end verification

This task has no automated tests — it wires together two things (a live Notion integration, a long-running Anthropic call) that aren't worth mocking for a single-user local app. Follow the design doc's own reasoning: verify by running the real thing, the same way the digest endpoint itself was verified earlier in this project.

**Files:** none (verification only).

- [ ] **Step 1: Create and share the Notion integration**

In a browser: go to `https://www.notion.so/my-integrations`, create a new internal integration (any name, e.g. "Jarvis"), copy its secret token. Open the **Jarvis Digest Log** database in Notion, click `...` in the top right, go to **Connections**, and add the new integration. Copy the database ID from its URL (the 32-character hex string right after the workspace name and before any `?`).

- [ ] **Step 2: Set the new environment variables**

Edit `/Users/pascucci.n/dev/jarvis/server/.env` and set:

```
NOTION_API_KEY=<the secret token from Step 1>
NOTION_DIGEST_DB_ID=<the database id from Step 1>
```

- [ ] **Step 3: Start the backend with the correct Node version**

Run: `cd /Users/pascucci.n/dev/jarvis/server && /Users/pascucci.n/.nvm/versions/node/v20.20.2/bin/node src/index.js`
Expected: `JARVIS backend listening on http://localhost:3001` with no startup errors.

- [ ] **Step 4: Check the health endpoint reports Notion as configured**

Run (new terminal): `curl -s http://localhost:3001/api/health`
Expected: JSON includes `"notionConfigured":true`.

- [ ] **Step 5: Check the token usage endpoint**

Run: `curl -s http://localhost:3001/api/usage/tokens`
Expected: `{"inputTokens":0,"outputTokens":0,"totalTokens":0}` (no chat requests have happened yet against this fresh `usage.json`).

- [ ] **Step 6: Send one chat message and confirm the counter moves**

Run:

```bash
curl -s -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"ciao, che ore sono?"}]}'
```

Then: `curl -s http://localhost:3001/api/usage/tokens`
Expected: `inputTokens` and `outputTokens` are both greater than 0.

- [ ] **Step 7: Confirm the digest dedupe works against the live Notion database**

Run twice in a row:

```bash
curl -s -X POST http://localhost:3001/api/chat/digest
curl -s -X POST http://localhost:3001/api/chat/digest
```

Expected: the first call runs the full digest (takes up to a few minutes, returns `{"ok":true}`) and a new row appears in the **Jarvis Digest Log** Notion database with today's date and `Status: sent`. The second call returns immediately with `{"ok":true,"skipped":true}` — no second email, no second Notion row.

- [ ] **Step 8: Visual check of the widget**

Start the frontend dev server (`PATH="/Users/pascucci.n/.nvm/versions/node/v20.20.2/bin:$PATH" npm run dev` from `frontend/`), open it in a browser, and confirm the "Token Anthropic" panel appears directly under the ETF panel, showing the same totals as Step 6's curl check, and updates within 30 seconds after sending a message in the UI.

No commit for this task — it's verification only, not a code change.
