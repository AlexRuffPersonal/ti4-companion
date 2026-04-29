# lib-importSchemas-p29a
**File:** `src/lib/importSchemas.js`
**Status:** Modify
**Prereqs:** migration-041-action-card-effects

## Changes

```js
// In the 'action-cards' schema entry, add to the fields array:
{ name: 'ability', type: 'jsonb', required: false,
  description: 'DSL op array for server-enforced effect resolution. null = not yet authored.' }
```

`admin-import-action-cards` Edge Function requires no changes — it stores all provided fields generically.

## Tests

```pseudocode
it('action-cards schema includes ability field with type jsonb and required=false')
```
