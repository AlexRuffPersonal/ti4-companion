# Admin Selective Re-Import

**Date:** 2026-05-18
**Status:** Approved

## Problem

All 15 `admin-import-*` edge functions perform a full table replacement (DELETE all → INSERT new). This makes it impossible to patch a single record or add records from a new expansion without re-importing the entire dataset.

## Goal

Support two import modes side-by-side in the admin UI:
- **Replace All** — existing behaviour, deletes all rows then inserts the provided records
- **Upsert Only** — inserts new records and fully replaces existing ones by `id`; does not delete unmatched rows

## Approach

Add a `mode` field to each edge function's request body and a radio toggle to the UI. No new edge functions or shared handlers required.

---

## Edge Functions (all 15 `admin-import-*`)

**Request body:**
```
{ records: [...], mode: 'replace' | 'upsert' }
```
`mode` defaults to `'replace'` when absent.

**Branching logic (after validate + field-default mapping):**
- `replace`: existing DELETE-then-INSERT flow, unchanged
- `upsert`: `db.from(table).upsert(rows, { onConflict: 'id' })`

**Response:** `{ imported: N }` for both modes — no change to the response shape.

**Assumption:** All 15 reference tables use `id` (UUID) as primary key, which is the conflict column for upsert. This is consistent across all current table definitions.

---

## `edgeFunctions.js`

```
importTable(table, records, mode = 'replace')
  → callFunction(`admin-import-${table}`, { records, mode })
```

Single-argument addition; `'replace'` default preserves all existing call sites.

---

## `AdminImportPage.jsx`

**New state:** `mode` — `'replace' | 'upsert'`, default `'replace'`

**Radio toggle** (above textarea):
- Option 1: "Replace All"
- Option 2: "Upsert Only"

**Subtitle under heading** (switches on mode):
- Replace All: `"Replaces all existing {label} records."` (unchanged)
- Upsert Only: `"Adds new records and updates existing ones by ID. Does not remove any records."`

**Submit button label:**
- Replace All: `"Import {label}"`
- Upsert Only: `"Upsert {label}"`

**Success message:**
- Replace All: `"{N} records imported. All existing {label} records replaced."`
- Upsert Only: `"{N} records upserted."`

---

## Testing

**Edge functions (per function; test one representative function, verify pattern holds):**
- `mode: 'upsert'` calls `.upsert()`, not `.delete()`
- Absent `mode` field defaults to `'replace'`
- Upsert with a record whose `id` already exists fully replaces that row
- Upsert with a new `id` inserts the row

**`edgeFunctions.js`:**
- `importTable` forwards `mode` in the request body
- Omitting `mode` sends `'replace'`

**`AdminImportPage`:**
- Radio toggle changes subtitle text and button label
- Submit passes correct `mode` value to `importTable`
- Success message reflects mode

---

## Out of Scope

- Partial field merge (patch only supplied fields) — upsert fully replaces the matched row
- Dry-run / preview mode
- Per-record conflict reporting
