# fn-admin-import-promissory-notes-p45
**File:** `supabase/functions/admin-import-promissory-notes/index.ts`
**Status:** Modify
**Prereqs:** migration-054-promissory-state

## Functionality

After the current delete+insert of `promissory_notes`, also re-seed `ability_definitions` and `ability_sources`.

Static name→handler_key map (29 entries embedded in the function):
```
Ceasefire → ceasefire
Political Secret → politicalSecret
Trade Convoys → tradeConvoys
Promise Of Protection → promiseOfProtection
Blood Pact → bloodPact
Dark Pact → darkPact
Stymie → stymie
Antivirus → antivirus
Gift Of Prescience → giftOfPrescience
Trade Agreement → tradeAgreement
Alliance → alliance
Support For The Throne → supportForThrone
Political Favor → politicalFavor
Acquisecence → acquiescence
Fires Of The Gashlai → firesOfTheGashlai
Cybernetic Enhancements → cyberneticEnhancements
Military Support → militarySupport
Ragh's Call → raghsCall
War Funding → warFunding
Research Agreement → researchAgreement
Greyfire Mutagen → greyfireMutagen
The Cavalry → theCavalry
Tekklar Legion → tekklarLegion
Creuss Iff → creussIff
Spy Net → spyNet
Strike Wing Ambuscade → strikeWingAmbuscade
Crucible → crucible
Scepter Of Dominion → scepterOfDominion
Black Market Forgery → blackMarketForgery
```

After inserting promissory notes:

1. **Upsert ability_definitions** — for each entry in the map, upsert `(ability_key, ability_name, trigger='{"type":"play"}', handler=handlerKey, exhausts_source=false, purges_source=false)` with `ON CONFLICT (ability_key) DO UPDATE`. Use `ability_name = ability_key` (or the note name — use the handler key as name for simplicity).

2. **Delete existing ability_sources** for `source_type='promissory_note'`.

3. **Re-insert ability_sources** — for each entry in the map, SELECT the just-inserted `promissory_notes` row by name, SELECT the `ability_definitions` row by `ability_key`, INSERT `(ability_id, source_type='promissory_note', source_id=note.id)`.

Return `{ imported: count, abilitiesLinked: mapSize }` in `okResponse`.

## Tests (`tests/functions/admin-import-promissory-notes.test.js`)

- After successful import, verify `db.from('ability_definitions').upsert(...)` was called
- After successful import, verify `db.from('ability_sources').delete()` was called for `source_type='promissory_note'`
- After successful import, verify `db.from('ability_sources').insert(...)` was called for each note
- Existing import tests (validates records, returns imported count) still pass
