# component-LeaderCard-icon-integration
**File:** `src/components/game/LeaderCard.jsx`
**Status:** Modify
**Prereqs:** component-GameIcon

## Functionality
```
typeBadge: when leader.leader_type exists:
  <span className="label uppercase text-xs px-1 py-0.5 border border-border rounded flex items-center gap-1">
    <GameIcon category="leaders" name={leader.leader_type} size={12} alt={leader.leader_type} />
    {leader.leader_type}
  </span>
isMech path unchanged (no typeBadge rendered there)
```

## Tests
```
renders agent icon img (src="/icons/leaders/agent.svg") in typeBadge
renders commander icon img (src="/icons/leaders/commander.svg") in typeBadge
renders hero icon img (src="/icons/leaders/hero.svg") in typeBadge
type label text still visible alongside icon
status chip still renders (UNLOCKED/LOCKED/EXHAUSTED)
action buttons still render
isMech=true path renders no type badge
```
