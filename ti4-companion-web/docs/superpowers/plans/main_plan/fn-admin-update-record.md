# fn-admin-update-record

**File:** `supabase/functions/admin-update-record/index.ts`
**Status:** New
**Prereqs:** —

## Functionality

```ts
CORS
AUTH
BODY(table: string, record: object)

ADMIN_ALLOWLIST = [
  'tiles','factions','agendas','technologies','units',
  'public_objectives','secret_objectives','action_cards',
  'relics','exploration_cards','attachments','promissory_notes',
  'ability_definitions','ability_sources'
]

if table NOT IN ADMIN_ALLOWLIST → ERR('Invalid table', 400)

// Verify admin
adminCheck = await db.from('profiles').select('is_admin').eq('id', userId).single()
if !adminCheck.is_admin → ERR('Forbidden', 403)

await db.from(table).upsert(record, { onConflict: 'id' })

OK({ updated: 1 })
```

## Tests

```js
STD_MOCKS
// mockDb builds: profiles select (is_admin), table upsert

TCORS
T401

// 400 missing table
// 400 missing record
// 400 table not in allowlist → ERR 400 'Invalid table'
// 403 non-admin caller → profiles returns { is_admin: false }
// 200 valid call → upsert called with record; returns { updated: 1 }
```
