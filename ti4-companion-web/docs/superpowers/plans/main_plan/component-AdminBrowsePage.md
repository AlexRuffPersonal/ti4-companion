# component-AdminBrowsePage

**File:** `src/components/admin/AdminBrowsePage.jsx`
**Status:** New
**Prereqs:** lib-importSchemas-p23, client-edgeFunctions-p23

## Functionality

```jsx
// Props: none (reads :table from useParams)
// schema = importSchemas[table]  // { pgTable, fields }
// filterField = schema.fields[0].name

// On mount:
//   { data, error } = await supabase.from(schema.pgTable).select('*').order(filterField)
//   setRecords(data); setLoading(false)

// State: records[], filterText, selectedRecord, loading, error

// Render:
//   <Link to="/admin">← Back to Reference Data</Link>
//   <h1>BROWSE {label.toUpperCase()}</h1>
//   <input placeholder="Filter by {filterField}" value={filterText} onChange={...} />
//   filtered = records.filter(r => String(r[filterField]).toLowerCase().includes(filterText.toLowerCase()))
//   <table>
//     <thead> one <th> per schema field </thead>
//     <tbody>
//       {filtered.map(r => (
//         <tr onClick={() => setSelectedRecord(r)} className="cursor-pointer hover:bg-panel-inset">
//           {schema.fields.map(f => <td>{truncate(String(r[f.name] ?? ''), 40)}</td>)}
//         </tr>
//       ))}
//     </tbody>
//   </table>
//   loading → show spinner / "Loading..."
//   error → show error text
//   {selectedRecord && (
//     <AdminRecordModal
//       table={table}
//       record={selectedRecord}
//       onClose={() => setSelectedRecord(null)}
//       onSaved={() => { setSelectedRecord(null); refetch() }}
//     />
//   )}
```

## Tests

```js
// mocked supabase client returns array of records
// records render in table rows with field values truncated to 40 chars
// filter input narrows displayed rows by filterField substring (case-insensitive)
// clicking a row opens AdminRecordModal with that record
// onSaved callback clears selectedRecord and triggers refetch
// loading state shows loading indicator before data arrives
// error state shows error message if fetch fails
```
