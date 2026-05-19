# component-LeaderAbilityModal-p43b
**File:** `src/components/game/LeaderAbilityModal.jsx`
**Status:** Modify
**Prereqs:** component-LeaderAbilityModal, lib-leaderConstants

## Changes
Extend `LEADER_SELECTION_CONFIG` entries (in `lib-leaderConstants.js`) for hero abilities that require system selection or multi-player targeting. The modal component itself needs no structural changes — the new config entries drive the existing selection UI.

New config entries needed for heroes:
```pseudocode
'The Ghosts Of Creuss': {
  hero: { needs_system:true, count:2, system_filter:'has_wormhole_or_your_units',
          exclude:['creuss_home','wormhole_nexus'] },
}
'The Mahact Gene-Sorcerers': {
  hero: { needs_system:true, count:2, label:['Source system','Destination system'],
          needs_target_player:true },
}
'The Winnu': {
  hero: { needs_strategy_card:true },
}
'The Naalu Collective': {
  hero: { needs_target_player:true, multi:true, label:'Force each player to give a promissory note' },
}
'The Yssaril Tribes': {
  hero: { auto_multi_player:true, label:'Each player reveals 1 action card' },
}
// ... remaining heroes that need selections
```

## Tests
No automated tests — verified manually per faction hero flow.
