# component-GameHeader-p24

**File:** `src/components/game/GameHeader.jsx`
**Status:** Modify
**Prereqs:** component-RulesModal

## Changes

```jsx
// Add onOpenRules to props:
export default function GameHeader({ game, speaker, onOpenTradeLog, onOpenRules }) {

// Add Rules button alongside Trade Log button:
<button className="btn-ghost text-xs" onClick={onOpenRules}>
  RULES
</button>
```

## Tests

```js
// renders RULES button
// clicking RULES button calls onOpenRules
```
