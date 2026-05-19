# fn-game-resolve-commander-reroll
**File:** `supabase/functions/game-resolve-commander-reroll/index.ts`
**Status:** New
**Prereqs:** shared-leaderEffects-p43c, migration-052-leader-abilities

## Functionality
```pseudocode
CORS
AUTH
BODY(game_id, combat_id, reroll_indices: number[])
PLAYER(id, leaders, faction)

ERR 409 'Commander not unlocked' if player.leaders?.commander !== 'unlocked'
ERR 400 'Only Jol-Nar can use this endpoint' if player.faction !== 'The Universities Of Jol-Nar'
COMBAT  // fetch game_combats row

// Determine which side the caller is on
side = combat.attacker_player_id === player.id ? 'attacker' : 'defender'
diceCol = side === 'attacker' ? 'attacker_dice' : 'defender_dice'
currentDice = combat[diceCol]

ERR 400 'Invalid reroll indices' if any index >= currentDice.length
ERR 400 'No dice to reroll' if reroll_indices.length === 0

// Reroll chosen dice
newDice = currentDice.map((die, i) =>
  reroll_indices.includes(i)
    ? { ...die, roll: Math.floor(Math.random()*10)+1, rerolled:true }
    : die
)
// Recompute hit_on and hits
newDice = newDice.map(d => ({ ...d, hit: d.roll >= d.hit_on }))
newHits = newDice.filter(d => d.hit).length

hitsCol = side === 'attacker' ? 'attacker_hits' : 'defender_hits'
UPDATE game_combats
  SET [diceCol] = newDice, [hitsCol] = newHits
  WHERE id=combat.id

OK({ dice: newDice, hits: newHits })
```

## Tests
```pseudocode
STD_MOCKS
T401
T400('game_id missing')
T400('combat_id missing')
T400('reroll_indices missing')
T404_PLAYER
T404_COMBAT
it('409 commander not unlocked')
it('400 not Jol-Nar faction')
it('400 invalid reroll index')
it('200 rerolls chosen dice and updates combat row')
  mock combat with attacker_dice=[{roll:3,hit_on:7,hit:false},{roll:8,hit_on:7,hit:true}]
  reroll_indices=[0]
  EXPECT first die rerolled, second unchanged
  EXPECT attacker_hits recalculated
```
