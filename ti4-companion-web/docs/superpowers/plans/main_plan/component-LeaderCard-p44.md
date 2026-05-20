# component-LeaderCard-p44

**File:** `src/components/game/LeaderCard.jsx`
**Status:** Modify
**Prereqs:** —

## Functionality

Add `'attached'` as a valid hero status:

```
statusChip: add case status === 'attached' → 'bg-gold/20 text-gold'
  (status.toUpperCase() → 'ATTACHED' badge in gold tone)

isPurged check: unchanged (status === 'purged' only)
  Attached card does NOT get opacity-40 — it is consumed but still in play

Hero action button branch: no additional case needed
  'attached' falls through with actionButton = null (no button shown)
```

## Tests

Create `tests/components/game/LeaderCard.test.jsx`:

- `status='attached'` → renders ATTACHED badge with `text-gold` class
- `status='attached'` → outer div does NOT have `opacity-40` class
- `status='attached'` → no action button rendered
- `status='purged'` → outer div still has `opacity-40` (regression check)
