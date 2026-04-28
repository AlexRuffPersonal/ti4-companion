# Phase 24 — Rule Lookup Design

**Date:** 2026-04-28  
**Phase:** 24  
**Feature Area:** Rule Lookup  
**Status:** planned

---

## Overview

An in-app searchable rules reference. Players type a keyword and see matching sections from the TI4 Living Rules Reference (LRR) without leaving the app. Cross-references within rule text render as clickable inline links that open CK3-style stackable pop-up cards.

---

## Data Pipeline

### Parse script

`scripts/parse-lrr.js` — a one-off Node script inside `ti4-companion-web/scripts/` (not part of the app bundle). Run from within `ti4-companion-web/`.

- Reads `docs/ti4-lrr.md` (relative to `ti4-companion-web/`)
- Splits on `## NUMBER TITLE` headers (regex `^## ([\d.]+) (.+)$`)
- Emits `src/data/lrr-sections.json` (relative to `ti4-companion-web/`) — an array of objects:

```json
[
  { "number": "1", "title": "ABILITIES", "body": "..." },
  { "number": "1.10", "title": "COSTS", "body": "..." },
  ...
]
```

- Changelog preamble before the first `## N TITLE` heading is excluded
- Body is trimmed of leading/trailing whitespace
- Run via `npm run parse-lrr` (added to `package.json` scripts)
- Output is committed to the repo; the script is re-run manually if the LRR file changes

---

## Component Architecture

### New files

| File | Purpose |
|------|---------|
| `scripts/parse-lrr.js` | One-off parse script |
| `src/data/lrr-sections.json` | Generated static data |
| `src/components/game/RulesModal.jsx` | Modal UI — search, accordion list, pop-up stack |

### Modified files

| File | Change |
|------|--------|
| `src/components/game/GameHeader.jsx` | Add "Rules" button; accepts `onOpenRules` prop |
| `src/components/game/GameScreen.jsx` | Add `rulesModalOpen` state; mount `RulesModal`; pass `onOpenRules` to `GameHeader` |

---

## Body Text Cross-References

### tokenizeBody(text, sectionTitles)

Exported from `RulesModal.jsx`.

- Accepts body text string and the full sections array
- Scans for substrings matching any known section title (case-insensitive)
- Returns an array of tokens: `{ type: 'text', value }` or `{ type: 'ref', title, number, value }`
- Ref tokens render as styled inline links (`text-gold underline cursor-pointer`)
- Plain tokens render as text spans

---

## RulesModal State

| State | Type | Description |
|-------|------|-------------|
| `query` | string | Controlled search input value |
| `expandedSection` | string \| null | `number` of the currently expanded accordion row |
| `popupStack` | section[] | Stack of sections opened via cross-reference links |

### Filtering

`sections.filter(s => (s.title + ' ' + s.body).toLowerCase().includes(query.toLowerCase()))`

Run on every keystroke. No debouncing needed (106 sections, simple string ops).

Empty query → show all 106 section titles collapsed.

---

## UI / UX

### Main modal

- Header: "Rules Reference" title + close (`×`) button
- Search input: `.input` class, placeholder `"Search rules…"`, autofocused on open, cleared on close
- Results list: scrollable fixed-height area below the search bar
- Each row: section number + title as a button; clicking toggles body text below (only one expanded at a time)
- Body text rendered via `tokenizeBody` — ref tokens are inline gold underlined links
- Empty state: if query non-empty and no matches → `"No results for '[query]'"`
- Styling: `.panel` wrapper, `.panel-inset` for results area, `.btn-ghost` for section rows

### Pop-up stack (CK3-style)

- Clicking a ref token pushes that section onto `popupStack`
- Each pop-up card renders as a floating `.panel` card, fixed max-width ~480px
- Cards cascade: each card is offset `+16px top` and `+16px left` relative to the previous, `z-index` increasing per depth
- Pop-up card contains: section number + title header, body text rendered via `tokenizeBody` (refs inside are also clickable, pushing further cards), close (`×`) button
- Closing a card removes only that card from the stack (not the full stack)
- `Escape` key closes the topmost card
- Clicking the backdrop behind all pop-up cards closes the entire stack
- Drop shadow (`shadow-lg`) conveys layering; title uses `font-display`, body uses `font-mono`

---

## Testing

### scripts/parse-lrr.js (exported parse function)

- Two-section markdown → returns 2 objects with correct `number`, `title`, `body`
- Header line is not included in `body`; bodies are whitespace-trimmed
- Subsection `## 1.10 COSTS` → `{ number: "1.10", title: "COSTS", ... }`
- Changelog preamble before first `## N TITLE` heading is excluded

### tokenizeBody

- Body containing a known section title mid-sentence → returns a `ref` token at correct position
- Body with no known titles → returns single `{ type: 'text' }` token
- Matching is case-insensitive

### RulesModal

- Search input renders on open; autofocused
- Typing a query filters the section list to matching titles only
- Clicking a section title expands its body; clicking again collapses it
- Only one section expanded at a time
- Clicking a ref token adds a card to the pop-up stack
- Clicking close on a pop-up card removes only that card
- Pressing Escape removes the topmost pop-up card
- Clicking the backdrop closes the entire pop-up stack
- Empty-state message shown when query has no matches
