# client-edgeFunctions-p23

**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-admin-update-record

## Functionality

```js
// Add export:
export const updateRecord = (table, record) =>
  callFunction('admin-update-record', { table, record })
```

## Tests

```js
// updateRecord('tiles', { id: 'uuid', name: 'foo' }) calls callFunction
//   with 'admin-update-record' and { table: 'tiles', record: { id: 'uuid', name: 'foo' } }
```
