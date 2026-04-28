# component-GameScreen-p24

**File:** `src/components/game/GameScreen.jsx`
**Status:** Modify
**Prereqs:** component-RulesModal, component-GameHeader-p24

## Changes

```jsx
// Add import:
import RulesModal from './RulesModal.jsx'

// Add state:
const [rulesModalOpen, setRulesModalOpen] = useState(false)

// Pass prop to GameHeader:
<GameHeader
  ..existing..
  onOpenRules={() => setRulesModalOpen(true)}
/>

// Add modal at bottom of return alongside other modals:
<RulesModal
  isOpen={rulesModalOpen}
  onClose={() => setRulesModalOpen(false)}
/>
```

## Tests

```js
// passes onOpenRules to GameHeader
// renders RulesModal when rulesModalOpen is true
// does not render RulesModal when rulesModalOpen is false
// onClose callback sets rulesModalOpen to false
```
