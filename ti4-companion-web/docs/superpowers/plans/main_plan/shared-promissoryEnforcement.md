# shared-promissoryEnforcement
**File:** `supabase/functions/_shared/promissoryEnforcement.ts`
**Status:** New
**Prereqs:** migration-032-promissory-effects

## Functionality
```pseudocode
interface NoteEntry { instanceId: string; holderPlayerId: string; ownerPlayerId: string }
interface ActiveNotes {
  supportForThrone: NoteEntry[]
  alliance: NoteEntry[]
  tradeConvoys: NoteEntry[]
  promiseOfProtection: NoteEntry[]
  bloodPact: NoteEntry[]
  darkPact: NoteEntry[]
  stymie: NoteEntry[]
  antivirus: NoteEntry[]
  giftOfPrescience: NoteEntry[]
}

export getActiveNotes(gameId, db) → ActiveNotes
  query game_player_promissory_notes where game_id=gameId AND state='in_play'
  join promissory_notes on note_id for name
  group by name slug (camelCase) → NoteEntry[]

export returnNote(instanceId, ownerPlayerId, db) → void
  update game_player_promissory_notes set state='held', held_by_player_id=ownerPlayerId where id=instanceId
```

## Tests
None standalone — covered by edge function tests that mock this module.
