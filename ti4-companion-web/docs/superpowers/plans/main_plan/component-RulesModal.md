# component-RulesModal

**File:** `src/components/game/RulesModal.jsx`
**Status:** New
**Prereqs:** script-parse-lrr

## Functionality

```jsx
// Import lrr-sections.json statically
import sections from '../../data/lrr-sections.json'

// Export tokenizeBody(text, sections) — used internally and in tests
// Scans text for substrings matching any section title (case-insensitive, longest match first)
// Returns token array: { type: 'text', value } | { type: 'ref', number, title, value }

// Props: { isOpen, onClose }
// State: query='', expandedSection=null, popupStack=[]

// On open: autofocus search input; clear query and popupStack

// Render when isOpen:
//   MODAL_WRAPPER (z-40 so pop-up stack renders above at z-50+)
//     PANEL(lg) — main modal
//       header row: "RULES REFERENCE" + × close button
//       <input className="input" placeholder="Search rules…" value={query} onChange=setQuery autoFocus />
//       filtered = query
//         ? sections.filter(s => (s.title + ' ' + s.body).toLowerCase().includes(query.toLowerCase()))
//         : sections
//       scrollable list (panel-inset, max-h-[60vh] overflow-y-auto):
//         if query && filtered.length === 0:
//           MUTED("No results for '{query}'")
//         else each section in filtered:
//           <button className="btn-ghost w-full text-left" onClick={() => toggleExpanded(s.number)}>
//             {s.number} — {s.title}
//           </button>
//           if expandedSection === s.number:
//             <div className="font-mono text-xs text-text p-2">
//               {tokenizeBody(s.body, sections).map(t =>
//                 t.type === 'text'
//                   ? <span>{t.value}</span>
//                   : <span className="text-gold underline cursor-pointer" onClick={() => pushPopup(t)}>
//                       {t.value}
//                     </span>
//               )}
//             </div>

//   Pop-up stack (rendered outside main panel, inside MODAL_WRAPPER):
//     if popupStack.length > 0:
//       backdrop div (fixed inset-0 z-49) onClick → setPopupStack([])
//       {popupStack.map((entry, i) =>
//         <div className="panel fixed max-w-[480px] shadow-lg z-[{50+i}]"
//              style={{ top: `${8 + i*16}px`, left: `${8 + i*16}px` }}>
//           header: "{entry.number} — {entry.title}" + × button onClick={() => removeFromStack(i)}
//           <div className="font-mono text-xs text-text p-2 max-h-[50vh] overflow-y-auto">
//             {tokenizeBody(entry.body, sections).map(t => ...same ref rendering...)}
//           </div>
//         </div>
//       )}

// Escape key: remove topmost pop-up card; if stack empty, close modal
// toggleExpanded: set expandedSection to s.number if not already, else null
// pushPopup: setPopupStack(prev => [...prev, matchingSection])
// removeFromStack(i): setPopupStack(prev => prev.filter((_, idx) => idx !== i))
```

## Tests

```js
// modal not rendered when isOpen=false
// search input present and autofocused when isOpen=true
// typing a query filters section list to matching titles only (case-insensitive)
// empty query shows all sections
// no-match query shows "No results for '...'" message
// clicking a section title expands its body; clicking again collapses it
// only one section expanded at a time (clicking second collapses first)
// clicking a ref token in body text pushes a pop-up card onto the stack
// clicking a ref token inside a pop-up card pushes another card
// clicking × on a pop-up card removes only that card from the stack
// pressing Escape removes the topmost pop-up card
// clicking the backdrop closes the entire pop-up stack

// tokenizeBody:
// body containing a known section title → ref token at correct position
// body with no known titles → single text token
// matching is case-insensitive
```
