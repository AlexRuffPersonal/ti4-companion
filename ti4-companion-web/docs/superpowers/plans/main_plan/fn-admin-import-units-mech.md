# fn-admin-import-units-mech
**File:** `supabase/functions/admin-import-units/index.ts`
**Status:** Modify
**Prereqs:** migration-050-mech-abilities

## Functionality
Row mapping block gains one new default:
```
effects: r.effects ?? []
```
`ability_text` and `deploy_trigger` are nullable — no default needed; spread `...r` already passes them through.

## Tests
- Import record with `ability_text`, `effects`, `deploy_trigger` → inserted row contains all three fields
- Import record without new fields → `effects` defaults to `[]`, others remain null
