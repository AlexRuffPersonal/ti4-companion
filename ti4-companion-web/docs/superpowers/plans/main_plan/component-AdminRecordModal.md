# component-AdminRecordModal

**File:** `src/components/admin/AdminRecordModal.jsx`
**Status:** New
**Prereqs:** client-edgeFunctions-p23, lib-importSchemas-p23

## Functionality

```jsx
// Props: table (slug), record (full DB row incl. id), onClose, onSaved
// schema = importSchemas[table]
// JSON_TYPES = ['JSONB', 'JSONB array', 'text array', 'TEXT array', 'object', 'array']

// State: fields (object keyed by field name), submitting, status

// On open: initialise fields from record:
//   JSON_TYPES → JSON.stringify(record[f.name], null, 2)
//   boolean → String(record[f.name])    // 'true' / 'false'
//   others  → String(record[f.name] ?? '')

// renderControl(field):
//   if field.values → <select> with field.values options
//   if field.type === 'boolean' → <select> with 'true' / 'false'
//   if field.type in ['integer','numeric'] → <input type="number">
//   if field.type in JSON_TYPES → <textarea rows=4>
//   else → <input type="text">

// handleSave:
//   parse JSON_TYPES fields with JSON.parse; ERR inline if invalid JSON
//   coerce integer/numeric fields with Number()
//   coerce boolean fields ('true'→true, 'false'→false)
//   payload = { id: record.id, ...parsedFields }
//   call updateRecord(schema.pgTable, payload)
//   on success: setStatus({ type:'success', message:'Saved.' }); onSaved()
//   on error: setStatus({ type:'error', message: err.message })

// Render:
//   MODAL_WRAPPER
//     PANEL(lg)
//       <p className="label">EDIT {schema.fields[0].name.toUpperCase()}: {record[schema.fields[0].name]}</p>
//       MUTED('id: ' + record.id)
//       {schema.fields.map(f => (
//         <div key={f.name}>
//           LABEL(f.name + (f.required ? ' *' : ''))
//           {renderControl(f)}
//           MUTED(f.description)
//         </div>
//       ))}
//       {status && <div className={status.type==='success' ? 'text-success' : 'text-danger'}>{status.message}</div>}
//       <div className="flex justify-end gap-3">
//         <button className="btn-ghost" onClick={onClose}>Cancel</button>
//         <button className="btn-primary" onClick={handleSave} disabled={submitting}>
//           {submitting ? 'Saving...' : 'Save'}
//         </button>
//       </div>
```

## Tests

```js
// fields pre-populated from record values on open
// JSONB field stringified with JSON.stringify on open
// boolean field rendered as <select> with current value selected
// values-constrained field rendered as <select> with enumerated options
// Save: JSON fields parsed; updateRecord called with { id, ...parsedFields }
// Save: invalid JSON in textarea → shows inline error, does not call updateRecord
// Save success → onSaved() called, success message shown
// Save error → error message shown, modal stays open
// Cancel → onClose() called
```
