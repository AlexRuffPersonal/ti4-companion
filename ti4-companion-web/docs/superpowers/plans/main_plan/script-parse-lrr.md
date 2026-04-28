# script-parse-lrr

**File:** `ti4-companion-web/scripts/parse-lrr.js`
**Status:** New
**Prereqs:** —

## Functionality

```js
// One-off Node script. Run from ti4-companion-web/ via `npm run parse-lrr`.
// Reads docs/ti4-lrr.md, splits on section headers, writes src/data/lrr-sections.json.

// Export parseLrr(text) for unit testing:
export function parseLrr(text) {
  // Split lines; scan for header pattern /^## ([\d.]+) (.+)$/
  // Everything before the first matching header is preamble → excluded
  // Each header starts a new section: { number, title, body }
  // Body = all lines between this header and the next, joined and trimmed
  // Return sections[]
}

// Main (ESM top-level or __filename check):
//   const text = fs.readFileSync('docs/ti4-lrr.md', 'utf8')
//   const sections = parseLrr(text)
//   fs.writeFileSync('src/data/lrr-sections.json', JSON.stringify(sections, null, 2))
//   console.log(`Wrote ${sections.length} sections`)
```

## Tests

```js
// parseLrr with two-section markdown → returns 2 objects
// each object has correct number, title, body
// header line is not included in body; bodies are whitespace-trimmed
// subsection '## 1.10 COSTS' → { number: '1.10', title: 'COSTS', ... }
// preamble before first ## N TITLE heading is excluded from output
```
