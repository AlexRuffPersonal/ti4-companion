# component-AdminDashboard-p23

**File:** `src/components/admin/AdminDashboard.jsx`
**Status:** Modify
**Prereqs:** lib-importSchemas-p23

## Functionality

```jsx
// For each table entry, render two btn-ghost buttons side by side:
//   <button onClick={() => navigate(`/admin/import/${key}`)}>Import</button>
//   <button onClick={() => navigate(`/admin/browse/${key}`)}>Browse</button>

// Also: add route in App.jsx:
//   <Route path="/admin/browse/:table" element={<AdminRoute><AdminBrowsePage /></AdminRoute>} />
```

## Tests

```js
// renders Import and Browse buttons for each table in each group
// Browse button navigates to /admin/browse/:key
// Import button navigates to /admin/import/:key (existing behaviour preserved)
```
