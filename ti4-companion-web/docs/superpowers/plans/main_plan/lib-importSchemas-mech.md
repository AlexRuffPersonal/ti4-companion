# lib-importSchemas-mech
**File:** `src/lib/importSchemas.js`
**Status:** Modify
**Prereqs:** migration-050-mech-abilities

## Functionality
`units` entry gains three new field descriptors after the existing `abilities` entry:
- `ability_text` — text, optional, null for generic units
- `effects` — JSONB array, optional, default `[]`, DSL ops array
- `deploy_trigger` — text, optional, enum values listed

## Tests
- Schema panel (import UI) renders new field names for the `units` table
