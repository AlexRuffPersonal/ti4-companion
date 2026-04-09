# Phase 1: Admin UI — Design Spec

**Date:** 2026-04-09
**Status:** Approved for implementation planning

---

## Overview

Build a protected admin UI for bulk-importing the 12 reference data tables required before any game UI can function. Reference data (tiles, factions, technologies, etc.) is entered by an admin via JSON import. The admin UI is gated by `profiles.is_admin` at both the client and server level.

---

## 1. Pre-Work (Before Phase 1 Code)

1. Consolidate the two git repos into one: remove `ti4-companion-web/.git`, add the directory to the root repo, commit.
2. Update `CLAUDE.md` tech stack section: React 19, react-router-dom v7, Vitest 4.

---

## 2. Architecture

### Routing

- `/admin` — Admin dashboard (grouped import buttons)
- `/admin/import/:table` — Dedicated import page, shared across all 12 tables

### New React Components

| Component | Path | Purpose |
|---|---|---|
| `AdminRoute` | `src/components/admin/AdminRoute.jsx` | Wraps all `/admin/*` routes; redirects non-admins to `/`, unauthenticated users to `/login` |
| `AdminDashboard` | `src/components/admin/AdminDashboard.jsx` | Grouped grid of 12 import buttons (4 categories) |
| `AdminImportPage` | `src/components/admin/AdminImportPage.jsx` | Shared import page: textarea, submit, success/error banner |

### Component Tree

```
App
 ├── /login          → LoginScreen
 ├── /verify         → VerifyScreen
 ├── AdminRoute (checks isAdmin)
 │    ├── /admin                    → AdminDashboard
 │    └── /admin/import/:table      → AdminImportPage
 └── ProtectedRoute (checks session)
      └── /          → [future game UI]
```

### New Edge Functions (12)

One per reference table, all following the same pattern:

- `admin-import-tiles`
- `admin-import-factions`
- `admin-import-agendas`
- `admin-import-action-cards`
- `admin-import-technologies`
- `admin-import-units`
- `admin-import-public-objectives`
- `admin-import-secret-objectives`
- `admin-import-relics`
- `admin-import-exploration-cards`
- `admin-import-attachments`
- `admin-import-promissory-notes`

Each function: verify JWT → check `is_admin` → validate payload → `DELETE` existing rows + `INSERT` new rows in a single transaction → return `{imported: N}` or structured error.

---

## 3. Authentication & Admin Check

### `useAuth` changes

When a session is established, `useAuth` fetches the user's `profiles` row and exposes:

```js
{ session, user, isAdmin, loading }
```

`isAdmin` is available immediately after session resolution — no secondary fetch when navigating to `/admin`.

### `AdminRoute` behaviour

| State | Action |
|---|---|
| `loading === true` | Render nothing (no flash) |
| No session | Redirect to `/login` |
| Session, `isAdmin === false` | Redirect to `/` |
| Session, `isAdmin === true` | Render children |

### Edge Function guard

`_shared/auth.ts` extended with `requireAdmin(req)` — checks JWT validity and `profiles.is_admin`. Returns 401 (unauthenticated) or 403 (authenticated but not admin). This is the real security boundary; the client check is UX only.

---

## 4. Admin Dashboard Layout

Four category groups displayed as labelled sections with import buttons:

| Group | Tables |
|---|---|
| Map & Units | Tiles, Units, Attachments |
| Factions | Factions, Technologies, Promissory Notes |
| Cards & Agendas | Agendas, Action Cards, Exploration Cards, Relics |
| Objectives | Public Objectives, Secret Objectives |

Each button navigates to `/admin/import/:table`.

---

## 5. Import Flow

1. Admin clicks a table button on the dashboard → navigates to `/admin/import/tiles` (for example)
2. Page shows: table name, brief description ("Replaces all existing Tiles records"), textarea, Import button, and a "← Back to Reference Data" link
3. Admin pastes a JSON array → clicks Import
4. Client checks `JSON.parse` succeeds and result is an array — if not, shows inline error without network call
5. Client calls `callFunction('admin-import-tiles', { records: parsedArray })`
6. Edge Function validates, truncates, inserts in transaction
7. On success: green banner — "47 records imported. All existing Tiles records replaced." Textarea clears; page stays on import screen
8. On failure: red banner — specific validation error or raw server error (admin-only screen, full detail is appropriate)

### JSON Format

An array of flat objects. Field names match the table column names. JSONB columns are passed as nested JSON objects/arrays. The `id` field is omitted — the Edge Function generates UUIDs.

Example (`tiles`):
```json
[
  {
    "tile_number": "001",
    "name": "Mecatol Rex",
    "type": "blue",
    "expansion": "base",
    "planets": [
      {"name": "Mecatol Rex", "resources": 1, "influence": 6, "trait": null, "legendary": false}
    ],
    "anomaly": null,
    "wormhole": null
  }
]
```

### Validation Rules (per Edge Function)

- Required fields presence check
- Type checks on numeric fields
- Enum validation where applicable (e.g., `type` must be one of `blue/red/home/hyperlane/frontier` for tiles)
- Any violation rejects the entire batch; error message identifies the first offending record and field

---

## 6. Error Handling & Feedback

| Outcome | UI |
|---|---|
| Invalid JSON (client-side) | Inline error below textarea: "Invalid JSON: unexpected token at position 42" |
| Validation failure | Red banner: "Record 12: missing required field 'tile_number'" |
| Unexpected server error | Red banner: "Import failed. [raw error message]" |
| Success | Green banner: "47 records imported. All existing Tiles records replaced." Textarea clears. |

---

## 7. Testing

### Edge Function tests (Vitest, one file per function)

- Unauthenticated request → 401
- Authenticated non-admin → 403
- Missing required field → 400 with offending record + field name
- Wrong type/enum value → 400
- Valid payload → 200 `{imported: N}`
- DB error mid-insert → nothing committed, original data intact

### React component tests

- `AdminRoute`: non-admin session → redirects to `/`
- `AdminRoute`: no session → redirects to `/login`
- `AdminRoute`: admin session → renders children

### `useAuth` tests (extended)

- Session with admin profile → `isAdmin: true`
- Session with non-admin profile → `isAdmin: false`
