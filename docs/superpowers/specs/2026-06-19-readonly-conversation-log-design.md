# Readonly conversation log design

## Goal

Trasformare il pannello `ConversationPanel` (colonna in basso a destra) in un log di sola lettura, in stile terminale/diagnostica sci-fi, coerente con il resto dell'interfaccia JARVIS. L'invio di messaggi resta possibile solo via microfono.

## Riferimento visivo

Lo stile target è un feed diagnostico monospace, una riga per evento, troncata con ellissi se troppo lunga:

```
10:23:17 ingest qdrant · 1.2k vettori
10:23:24 domanda · "Ehi mi sai dire un attim...
```

## Changes

### `ConversationPanel.jsx`

- Diventa puramente di visualizzazione. Unica prop: `messages`.
- Rimuovi: `onSend`, `onClear`, `onExtract`, `isListening`, `onMicClick`, `micSupported`, `inputRef` e tutto lo stato/markup collegato (form di input, mic button, text-box, pulsanti Clear/Extract).
- Header: resta solo il titolo "Conversation" con la barretta verticale ciano (stesso pattern usato in `Panel.jsx`), nessuna action a destra.
- Ogni messaggio è una riga singola, font monospace, ~11px (`text-[11px] font-mono`), troncata con ellissi (`overflow-hidden whitespace-nowrap text-ellipsis`):
  - Formato: `HH:MM:SS  domanda · <contenuto>` per i messaggi utente, `HH:MM:SS  risposta · <contenuto>` per quelli assistente.
  - Colori: timestamp ciano spento (es. `text-cyan-500/60`), tag ruolo ciano chiaro (`text-cyan-200`), separatore `·` molto dimmer (`text-cyan-500/40`), contenuto ciano/grigio chiaro (`text-cyan-300/80`).
  - Spaziatura tra righe ridotta rispetto alle bolle attuali (es. `space-y-1` invece di `space-y-3`).
- Mantieni l'auto-scroll verso il fondo quando arrivano nuovi messaggi.

### `App.jsx`

- Rimuovi il pulsante "tastiera" (`KeyboardIcon`) vicino all'orb: resta solo il pulsante mic per inviare messaggi via voce.
- Rimuovi `handleClear`, `handleExtract`, `inputRef` (non più usati da nessuna parte).
- Rimuovi gli import ora inutilizzati: `KeyboardIcon`, `TrashIcon`, `DownloadIcon`.
- `timeNow()` produce `HH:MM:SS` (aggiunta dei secondi) invece di `HH:MM`, per coerenza con lo stile diagnostico di riferimento.
- `ConversationPanel` viene invocato passando solo `messages`.

## Out of scope

- Nessuna modifica al backend (`/api/chat`, `/api/etf`, ecc.).
- Nessuna modifica alla logica di invio messaggi via voce (`useSpeech`, `handleSend`).
- Nessun meccanismo per leggere il testo troncato per intero (es. tooltip) — esplicitamente escluso in questa fase.
