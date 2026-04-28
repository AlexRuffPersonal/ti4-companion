# Phase 23 — Admin: Read Views + Editing

## Overview

Adds browse and edit capabilities to the admin UI. Admins can view all records in any reference table, filter by the primary display field, and edit individual records in a modal without re-importing the whole table.

---

## Architecture

Three new pieces on top of the existing import flow:

1. **`/admin/browse/:table` route** — `AdminBrowsePage.jsx` fetches all records directly via the Supabase JS client (`supabase.from(pgTable).select('*')`). Reference tables are public reads; the admin gate is enforced at the route level by `AdminRoute`.

2. **`AdminRecordModal.jsx`** — edit form driven by `importSchemas[table].fields`. Save calls a new generic `admin-update-record` Edge Function.

3. **`admin-update-record` Edge Function** — takes `{ table, record }`, validates admin auth and table allowlist, then upserts by `id`. One function covers all 14 reference tables.

Supporting changes:
- `AdminDashboard.jsx` — "Browse" button alongside each "Import" button
- `App.jsx` — new `/admin/browse/:table` route
- `edgeFunctions.js` — `updateRecord(table, record)` export
- `importSchemas.js` — `pgTable` field added per entry (slug → postgres table name mapping)

---

## Components

### `AdminDashboard.jsx` (modify)

For each table entry, render two `btn-ghost` buttons side by side:
- **Import** — existing behaviour, navigates to `/admin/import/:table`
- **Browse** — navigates to `/admin/browse/:table`

### `AdminBrowsePage.jsx` (new)

- On mount: `supabase.from(schema.pgTable).select('*').order(firstField)` where `firstField` is `importSchemas[table].fields[0].name`
- One text `<input>` filters rows by `firstField` value (case-insensitive substring, client-side)
- Scrollable table with one column per schema field; values truncated to ~40 chars
- Row click → opens `AdminRecordModal` with that record
- Loading and error states follow existing admin page patterns

### `AdminRecordModal.jsx` (new)

Props: `table` (slug), `record` (full DB row including `id`), `onClose`, `onSaved`

- `id` shown as a read-only label at top (not editable)
- Each `importSchemas[table].fields` entry rendered with a control matched to its type:
  - `values` list → `<select>` with enumerated options
  - `boolean` → `<select>` with `true` / `false`
  - `integer` / `numeric` → `<input type="number">`
  - `JSONB` / array types (`JSONB array`, `JSONB`, `text array`, `TEXT array`, `object`) → `<textarea>` (JSON-stringified on open, parsed on save)
  - all other types → `<input type="text">`
- Save: parse textarea JSON fields, call `updateRecord(schema.pgTable, { id, ...fields })`, show success/error inline, call `onSaved()` and close on success
- Cancel: closes without saving

---

## Edge Function: `admin-update-record`

**Input:** `{ table: string, record: object }`

**Auth:** read caller `user_id` from JWT → check `profiles.is_admin = true` → 403 if not admin

**Validation:**
- `table` must be present → 400
- `record` must be present and an object → 400
- `table` must be in the allowlist of 14 valid pg table names → 400 if not:
  ```
  tiles, factions, agendas, technologies, units,
  public_objectives, secret_objectives, action_cards,
  relics, exploration_cards, attachments, promissory_notes,
  ability_definitions, ability_sources
  ```

**Action:** `db.from(table).upsert(record, { onConflict: 'id' })`

**Response:** `{ updated: 1 }`

---

## `importSchemas.js` — `pgTable` mapping

Add a `pgTable` string to each entry in `importSchemas`:

| slug | pgTable |
|------|---------|
| `tiles` | `tiles` |
| `factions` | `factions` |
| `agendas` | `agendas` |
| `technologies` | `technologies` |
| `units` | `units` |
| `public-objectives` | `public_objectives` |
| `secret-objectives` | `secret_objectives` |
| `action-cards` | `action_cards` |
| `relics` | `relics` |
| `exploration-cards` | `exploration_cards` |
| `attachments` | `attachments` |
| `promissory-notes` | `promissory_notes` |
| `ability-definitions` | `ability_definitions` |
| `ability-sources` | `ability_sources` |

---

## `edgeFunctions.js` — new export

```js
export const updateRecord = (table, record) =>
  callFunction('admin-update-record', { table, record })
```

---

## `App.jsx` — new route

Add inside the admin-gated section:
```jsx
<Route path="/admin/browse/:table" element={<AdminRoute><AdminBrowsePage /></AdminRoute>} />
```

---

## Testing

### `AdminDashboard`
- Browse buttons present for all table groups
- Browse button navigates to `/admin/browse/:table`

### `AdminBrowsePage`
- Mocked Supabase client returns records; assert they render in the table
- Filter input narrows displayed rows by first-field substring
- Row click opens `AdminRecordModal` with correct record

### `AdminRecordModal`
- Fields pre-populated from record values
- JSONB/array fields stringified on open
- `values`-constrained fields render as `<select>`
- Save parses JSON fields and calls `updateRecord` with `{ id, ...fields }`
- Success triggers `onSaved` and closes modal
- Error shows inline message without closing

### Edge Function `admin-update-record`
- Non-admin caller → 403
- Missing `table` or `record` → 400
- Table not in allowlist → 400
- Valid call → upsert called, returns `{ updated: 1 }`
