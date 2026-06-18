# ETF Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "ETF" dashboard widget showing live price and daily % change for a configurable list of ETF tickers (XBAE, XMME, XDWD), placed above a now-compact Conversation panel in the right column.

**Architecture:** A new Express route (`GET /api/etf`) reads tickers from an env var, resolves each against Yahoo Finance's free chart API by trying exchange suffixes `.MI`/`.DE`/`.L` in order and caching whichever one works, and returns price/currency/% change per ticker (or `status: "unavailable"`). A new React panel component polls this route every 5 minutes (same `usePolling` hook already used by Weather/System Stats) and renders it above the existing Conversation panel, which moves into a `flex-1` sub-container so it keeps scrolling internally without growing the page.

**Tech Stack:** Node/Express (native `fetch`, no new dependencies), React 19 + Tailwind v4 (existing `Panel` component), no new third-party services or API keys.

## Global Constraints

- No portfolio value, no shares-owned/cost-basis tracking — price and daily % change only (per spec, "Cosa è fuori scope").
- No new npm dependencies — use native `fetch` like every other backend route in this project (`weather.js`, `tts.js`).
- No test framework exists in this project (no jest/vitest/mocha in either `package.json`). Verification throughout this plan uses `curl` for backend and a Playwright script + screenshot for frontend, matching how every other feature in this codebase has been verified — do not introduce a new test runner as part of this plan.
- Match existing visual theme: cyan for positive values, amber for negative/unavailable (no standard green/red), consistent with `Panel.jsx`'s existing color usage.
- `nvm use 20` is required before any `npm`/`node` command in this repo (system Node default is v16).

---

### Task 1: Backend — `/api/etf` route

**Files:**
- Modify: `server/.env`
- Modify: `server/.env.example`
- Create: `server/src/routes/etf.js`
- Modify: `server/src/index.js`

**Interfaces:**
- Produces: `GET /api/etf` → `{ "etfs": [{ "ticker": string, "status": "ok" | "unavailable", "price": number | null, "currency": string | null, "changePercent": number | null }] }`

- [ ] **Step 1: Add the ticker list to env config**

Append to `server/.env` (after the existing `GOOGLE_REDIRECT_URI=...` line):

```
# Comma-separated ETF tickers shown in the ETF dashboard widget.
ETF_TICKERS=XBAE,XMME,XDWD
```

Append the same block (without a value) to `server/.env.example`:

```
# Comma-separated ETF tickers shown in the ETF dashboard widget, e.g.
# ETF_TICKERS=XBAE,XMME,XDWD
ETF_TICKERS=
```

- [ ] **Step 2: Create the route file**

Create `server/src/routes/etf.js`:

```js
import { Router } from 'express'

const router = Router()

const EXCHANGE_SUFFIXES = ['.MI', '.DE', '.L']
const resolvedSuffixCache = new Map()

function getTickers() {
  return (process.env.ETF_TICKERS || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

async function fetchYahooQuote(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number') {
    throw new Error('No price data in response')
  }

  const price = meta.regularMarketPrice
  const previousClose = meta.chartPreviousClose ?? meta.previousClose
  const changePercent =
    typeof previousClose === 'number' && previousClose !== 0
      ? ((price - previousClose) / previousClose) * 100
      : null

  return { price, currency: meta.currency ?? null, changePercent }
}

async function fetchTicker(ticker) {
  const cachedSuffix = resolvedSuffixCache.get(ticker)
  const suffixesToTry = cachedSuffix ? [cachedSuffix] : EXCHANGE_SUFFIXES

  for (const suffix of suffixesToTry) {
    try {
      const quote = await fetchYahooQuote(`${ticker}${suffix}`)
      resolvedSuffixCache.set(ticker, suffix)
      return { ticker, status: 'ok', ...quote }
    } catch {
      // try the next exchange suffix
    }
  }

  return { ticker, status: 'unavailable', price: null, currency: null, changePercent: null }
}

router.get('/', async (req, res) => {
  const etfs = await Promise.all(getTickers().map(fetchTicker))
  res.json({ etfs })
})

export default router
```

- [ ] **Step 3: Mount the route**

In `server/src/index.js`, add the import after the existing `emailRouter` import (line 8):

```js
import emailRouter from './routes/email.js'
import etfRouter from './routes/etf.js'
```

And add the mount line after `app.use('/api/email', emailRouter)` (line 30):

```js
app.use('/api/email', emailRouter)
app.use('/api/etf', etfRouter)
```

- [ ] **Step 4: Verify with a live backend**

Restart the backend:

```bash
pkill -f "node src/index.js" 2>/dev/null; sleep 1
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20 >/dev/null
(cd /Users/pascucci.n/dev/jarvis/server && node src/index.js > /tmp/jarvis-server.log 2>&1 & echo $! > /tmp/jarvis-server.pid)
sleep 2
curl -s http://localhost:3001/api/etf
```

Expected: a JSON body with `"etfs"` containing 3 entries for `XBAE`, `XMME`, `XDWD`, each with `"status": "ok"` and a numeric `price`/`changePercent` (if Yahoo Finance is reachable and resolves at least one of the three suffixes — if a ticker truly can't be resolved on any of `.MI`/`.DE`/`.L`, that single entry will show `"status": "unavailable"`, which is correct fallback behavior, not a bug).

Also check `tail -5 /tmp/jarvis-server.log` to confirm no startup errors (e.g. import typos).

- [ ] **Step 5: Commit**

```bash
cd /Users/pascucci.n/dev/jarvis
git add server/.env.example server/src/routes/etf.js server/src/index.js
git commit -m "$(cat <<'EOF'
Add /api/etf route for ETF price tracking widget

Resolves tickers against Yahoo Finance by trying .MI/.DE/.L exchange
suffixes and caching whichever one works, per the approved design spec.
EOF
)"
```

(`server/.env` is gitignored and intentionally not staged.)

---

### Task 2: Frontend — ETF panel and layout

**Files:**
- Create: `frontend/src/components/ETFPanel.jsx`
- Modify: `frontend/src/App.jsx:1-11` (imports), `frontend/src/App.jsx:66-69` (polling hooks), `frontend/src/App.jsx:138-198` (right column JSX)

**Interfaces:**
- Consumes: `usePolling(url, { intervalMs }) → { data, online, loading, refresh }` (existing hook, `frontend/src/hooks/usePolling.js`); backend shape from Task 1: `{ etfs: [{ ticker, status, price, currency, changePercent }] }`
- Consumes: `Panel` component from `frontend/src/components/Panel.jsx` (`<Panel title action children>`)
- Consumes: `RefreshIcon` from `frontend/src/components/icons.jsx`

- [ ] **Step 1: Create the ETF panel component**

Create `frontend/src/components/ETFPanel.jsx`:

```jsx
import { Panel } from './Panel'
import { RefreshIcon } from './icons'

export function ETFPanel({ etfs, online, onRefresh }) {
  return (
    <Panel
      title="ETF"
      action={
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh ETF data"
          className="text-cyan-500/60 hover:text-cyan-200"
        >
          <RefreshIcon />
        </button>
      }
    >
      {!online || !etfs ? (
        <p className="text-xs text-cyan-500/50">Backend offline — no live data.</p>
      ) : (
        <div className="space-y-2">
          {etfs.map((etf) => (
            <div
              key={etf.ticker}
              className="flex items-center justify-between rounded-sm border border-cyan-500/10 bg-cyan-950/30 px-3 py-2"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-cyan-200">
                {etf.ticker}
              </span>
              {etf.status === 'ok' ? (
                <div className="text-right">
                  <div className="text-sm font-semibold text-cyan-50">
                    {etf.price.toFixed(2)} {etf.currency}
                  </div>
                  {typeof etf.changePercent === 'number' && (
                    <div className={`text-xs ${etf.changePercent >= 0 ? 'text-cyan-300' : 'text-amber-400'}`}>
                      {etf.changePercent >= 0 ? '+' : ''}
                      {etf.changePercent.toFixed(2)}%
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-cyan-500/40">n/d</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
```

- [ ] **Step 2: Wire it into `App.jsx`**

Add the import in `frontend/src/App.jsx`, after the `ConversationPanel` import (currently line 7):

```js
import { ConversationPanel } from './components/ConversationPanel'
import { ETFPanel } from './components/ETFPanel'
```

Add the polling hook after the existing `emailStatus` hook (currently line 69):

```js
const emailStatus = usePolling('/api/email/status', { intervalMs: 30000 })
const etf = usePolling('/api/etf', { intervalMs: 5 * 60 * 1000 })
```

Replace the right-column JSX (currently lines 186–197):

```jsx
        <div className="min-h-0 overflow-hidden rounded-md border border-cyan-500/20 bg-[#081627]/70 shadow-[0_0_20px_-4px_rgba(56,189,248,0.15)]">
          <ConversationPanel
            messages={messages}
            onSend={handleSend}
            onClear={handleClear}
            onExtract={handleExtract}
            isListening={speech.isListening}
            onMicClick={handleMicClick}
            micSupported={speech.supported}
            inputRef={inputRef}
          />
        </div>
```

with:

```jsx
        <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
          <ETFPanel etfs={etf.data?.etfs} online={etf.online} onRefresh={etf.refresh} />
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-cyan-500/20 bg-[#081627]/70 shadow-[0_0_20px_-4px_rgba(56,189,248,0.15)]">
            <ConversationPanel
              messages={messages}
              onSend={handleSend}
              onClear={handleClear}
              onExtract={handleExtract}
              isListening={speech.isListening}
              onMicClick={handleMicClick}
              micSupported={speech.supported}
              inputRef={inputRef}
            />
          </div>
        </div>
```

- [ ] **Step 3: Build the frontend**

```bash
cd /Users/pascucci.n/dev/jarvis/frontend
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20 >/dev/null
npm run build
```

Expected: `✓ built in <time>` with no errors.

- [ ] **Step 4: Verify in the running app**

Confirm the dev server is up (start it if not):

```bash
curl -sf http://localhost:5173 >/dev/null && echo "frontend OK" || echo "needs restart"
```

Save this Playwright script as `/tmp/jarvis-etf-check.mjs`:

```js
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const consoleErrors = []
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
await page.waitForSelector('text=ETF')
await page.waitForTimeout(1000)

const tickers = await page.locator('text=XBAE, text=XMME, text=XDWD').count()
await page.screenshot({ path: '/tmp/jarvis-etf.png', fullPage: false })
console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors))
await browser.close()
```

Run it:

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20 >/dev/null
NODE_PATH=/tmp/node_modules node /tmp/jarvis-etf-check.mjs
```

Expected: `CONSOLE_ERRORS: []`. Then view `/tmp/jarvis-etf.png` and confirm: the right column now shows a smaller "ETF" panel above a visibly shorter Conversation panel, with three rows (`XBAE`, `XMME`, `XDWD`) each showing either a price + % change or `n/d`, styled consistently with the other side panels (cyan border/glow, same font).

- [ ] **Step 5: Commit**

```bash
cd /Users/pascucci.n/dev/jarvis
git add frontend/src/components/ETFPanel.jsx frontend/src/App.jsx
git commit -m "$(cat <<'EOF'
Add ETF dashboard widget above the Conversation panel

Right column now shows live price/% change for the configured ETF
tickers, with the chat panel resized to fit below it.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Layout split (Task 2), widget content + colors (Task 2), data source + fallback suffixes (Task 1), env-based ticker config (Task 1), per-ticker `n/d` + whole-panel offline state (Task 1 response shape + Task 2 rendering) — all covered.
- **Type consistency:** `etf.data?.etfs` (App.jsx) matches the `{ etfs: [...] }` shape returned by Task 1's route; field names (`ticker`, `status`, `price`, `currency`, `changePercent`) match exactly between `etf.js` and `ETFPanel.jsx`.
- **No placeholders:** all steps contain complete, runnable code.
