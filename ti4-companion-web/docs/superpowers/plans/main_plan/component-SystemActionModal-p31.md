# component-SystemActionModal-p31
**File:** `src/components/game/SystemActionModal.jsx`
**Status:** Modify
**Prereqs:** —

## Changes

Add `onInfo` prop and an INFO button in the modal header area.

```pseudocode
props: { ...existing..., onInfo }

// In the modal header, alongside the system label:
<div className="flex items-center justify-between mb-4">
  LABEL('SYSTEM ' + systemKey)
  <button className="btn-ghost text-xs" onClick={onInfo}>INFO</button>
</div>
```

All existing action content (ACTIVATE SYSTEM, LAND ON, planet ownership rows) is unchanged.

## Tests

```pseudocode
GIVEN onInfo prop provided
  EXPECT INFO button rendered
  clicking INFO button calls onInfo
```
