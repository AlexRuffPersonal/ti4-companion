# component-ObjectivesSection-p28
**File:** `src/components/game/ObjectivesSection.jsx`
**Status:** Modify
**Prereqs:** —

## Changes

```pseudocode
// Inside the revealed.map() block, below the existing name/stage/VP div:
<div>
  <span className="text-text text-sm">{ref?.name}</span>
  <span className="text-dim text-xs ml-2">
    Stage {ref?.stage} · {ref?.points ?? 1} VP
  </span>
  {ref?.condition && (
    <p data-testid="objective-condition" className="text-dim text-xs mt-0.5">
      {ref.condition}
    </p>
  )}
</div>
```

## Tests

```pseudocode
it('renders condition text when ref.condition is non-empty')
it('does not render condition paragraph when ref.condition is null')
it('condition text renders below name and VP line')
```
