# Readonly Conversation Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the `ConversationPanel` (bottom-right column of the JARVIS frontend) into a readonly, sci-fi diagnostic-style log: small monospace text, one truncated line per message, no input/mic/Clear/Extract controls in that panel. Sending messages remains possible only via the existing mic button next to the orb.

**Architecture:** `ConversationPanel.jsx` becomes a pure display component (`messages` prop only — no callbacks, no internal input state). `App.jsx` drops the now-unused keyboard-focus button and the handlers/imports that only existed to support the removed Clear/Extract/text-input controls. `timeNow()` gains seconds so timestamps match the `HH:MM:SS` diagnostic format.

**Tech Stack:** React 19 + Vite, Tailwind utility classes (no CSS modules), no test runner configured in this project (`frontend/package.json` has no Jest/Vitest) — verification is via `npm run lint` and manual browser check with the dev server, per project convention.

## Global Constraints

- No automated test framework exists in `frontend/` — do not introduce one for this change. Verify via lint + manual visual check (see Task 3).
- Match existing visual language exactly: cyan color palette, `<span className="inline-block h-3 w-1 bg-cyan-400/80" />` header accent bar, uppercase tracking-wider header labels — these patterns are already used in `Panel.jsx` and the current `ConversationPanel.jsx` header.
- Message format: `HH:MM:SS  domanda · <content>` for user messages, `HH:MM:SS  risposta · <content>` for assistant messages, single line, truncated with ellipsis (no wrapping, no "read more").
- Sending messages must remain possible via voice (mic) only — no text input, no keyboard-focus button.

---

## File Structure

- Modify: `frontend/src/components/ConversationPanel.jsx` — strip to a pure display component (drop all input/action props and markup, add the log-row rendering).
- Modify: `frontend/src/App.jsx` — drop the keyboard button, `handleClear`, `handleExtract`, `inputRef`, the now-unused icon imports, and update `timeNow()` to include seconds.

---

### Task 1: Convert `ConversationPanel.jsx` to a readonly log

**Files:**
- Modify: `frontend/src/components/ConversationPanel.jsx`

**Interfaces:**
- Consumes: nothing new — only the existing `messages` array shape `{ id, role: 'user' | 'assistant', content: string, time: string }` (already produced by `App.jsx`'s `handleSend`).
- Produces: `ConversationPanel({ messages })` — a component taking exactly one prop, `messages`. Task 2 will update the call site in `App.jsx` to match this new signature.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `frontend/src/components/ConversationPanel.jsx` with:

```jsx
import { useEffect, useRef } from 'react'

export function ConversationPanel({ messages }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-cyan-500/20 px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-cyan-200">
          <span className="inline-block h-3 w-1 bg-cyan-400/80" />
          Conversation
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="flex items-baseline gap-2 overflow-hidden whitespace-nowrap font-mono text-[11px]"
          >
            <span className="shrink-0 text-cyan-500/60">{msg.time}</span>
            <span className="shrink-0 text-cyan-200">
              {msg.role === 'user' ? 'domanda' : 'risposta'}
            </span>
            <span className="shrink-0 text-cyan-500/40">·</span>
            <span className="overflow-hidden text-ellipsis text-cyan-300/80">{msg.content}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Lint the file**

Run: `cd frontend && npx eslint src/components/ConversationPanel.jsx`
Expected: no output (no errors/warnings).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ConversationPanel.jsx
git commit -m "Convert ConversationPanel to a readonly diagnostic-style log"
```

---

### Task 2: Clean up `App.jsx` call site and remove dead controls

**Files:**
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `ConversationPanel({ messages })` from Task 1.
- Produces: nothing consumed by later tasks (this is the last code task).

- [ ] **Step 1: Update the icon import**

In `frontend/src/App.jsx`, find:

```jsx
import { KeyboardIcon, MicIcon } from './components/icons'
```

Replace with:

```jsx
import { MicIcon } from './components/icons'
```

- [ ] **Step 2: Update `timeNow()` to include seconds**

Find:

```jsx
function timeNow() {
  return new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}
```

Replace with:

```jsx
function timeNow() {
  return new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
```

- [ ] **Step 3: Remove `inputRef` and the dead handlers**

Find:

```jsx
export default function App() {
  const [messages, setMessages] = useState([])
  const [commandCount, setCommandCount] = useState(0)
  const [orbState, setOrbState] = useState('idle')
  const inputRef = useRef(null)
```

Replace with:

```jsx
export default function App() {
  const [messages, setMessages] = useState([])
  const [commandCount, setCommandCount] = useState(0)
  const [orbState, setOrbState] = useState('idle')
```

Find:

```jsx
  function handleClear() {
    setMessages([])
  }

  function handleExtract() {
    const text = messages.map((m) => `[${m.time}] ${m.role}: ${m.content}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'jarvis-conversation.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

```

Delete this block entirely (replace with nothing — the next line in the file, `function handleMicClick() {`, becomes adjacent to `handleSend`'s closing brace).

- [ ] **Step 4: Remove the keyboard-focus button**

Find:

```jsx
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              aria-label="Focus text input"
              className="rounded-full border border-cyan-500/20 p-3 text-cyan-300/70 hover:text-cyan-100"
            >
              <KeyboardIcon />
            </button>
```

Delete this block entirely.

- [ ] **Step 5: Simplify the `ConversationPanel` call site**

Find:

```jsx
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
```

Replace with:

```jsx
            <ConversationPanel messages={messages} />
```

- [ ] **Step 6: Lint the file**

Run: `cd frontend && npx eslint src/App.jsx`
Expected: no output (no errors/warnings). This will catch any leftover unused imports/vars from the edits above.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "Remove text-input/Clear/Extract controls now that the conversation log is readonly"
```

---

### Task 3: Manual visual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `cd frontend && npm run dev`
Expected: Vite prints a local URL (e.g. `http://localhost:5173`).

- [ ] **Step 2: Open the app in a browser and check the conversation panel**

Open the printed URL. Send a message via the mic button (or, if mic permission isn't available in the test environment, temporarily call `handleSend` from the browser console: `window.__sendTest?.('test')` — skip this if not wired up, and instead just inspect the empty-state layout).

Confirm:
- The bottom-right panel header still reads "Conversation" with the cyan accent bar, no Clear/Extract buttons.
- There is no text input box and no mic button inside that panel.
- Each message renders as a single small monospace line formatted `HH:MM:SS domanda · ...` or `HH:MM:SS risposta · ...`.
- A long message is truncated with an ellipsis rather than wrapping to multiple lines.
- Near the orb in the center column, only the mic button remains (no keyboard icon button).

- [ ] **Step 3: Stop the dev server**

Stop the `npm run dev` process (Ctrl+C) once verification is complete.

---

## Self-Review Notes

- Spec coverage: `ConversationPanel.jsx` changes (Task 1) and `App.jsx` cleanup (Task 2) both map directly to the two file-level changes called out in the design spec (`docs/superpowers/specs/2026-06-19-readonly-conversation-log-design.md`). Manual check (Task 3) covers the spec's visual/behavioral requirements that have no automated test to assert them.
- No placeholders: every step shows complete code, exact commands, and expected output.
- Type/signature consistency: `ConversationPanel({ messages })` is the only signature used across Task 1 (definition) and Task 2 (call site) — no mismatch.
