# fn-admin-import-leaders
**File:** `supabase/functions/admin-import-leaders/index.ts`
**Status:** New
**Prereqs:** migration-033-leaders

## Functionality
```pseudocode
CORS
AUTH (service-role gated)
BODY(records: LeaderRecord[])

// Wipe and replace (matches existing admin-import pattern)
delete ability_sources where source_type='leader'
delete leaders

for each record in records:
  insert leaders(name, leader_type, faction, text, unlock_criteria) → leader.id
  insert ability_definitions(effects|handler, exhausts_source, purges_source, trigger, source_type='leader') → def.id
  insert ability_sources(source_type='leader', source_id=leader.id, ability_definition_id=def.id)

OK({ imported: records.length })
```

Also updates `importSchemas.js` (add `leaders` schema entry) and `AdminDashboard.jsx` (add 'leaders' to table list, making it 13 tables).

## Tests
```pseudocode
STD_MOCKS
T401
T400(records missing)
it('imports 1 leader and creates ability rows') — mock delete+insert chains; assert OK 200 + imported count
```
