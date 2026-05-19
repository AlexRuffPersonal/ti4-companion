# shared-abilityDsl-p39
**File:** `supabase/functions/_shared/abilityDsl.ts`
**Status:** Modify
**Prereqs:** migration-051-exploration-fixes, shared-abilityDsl

## Functionality
Add three new ops to the `interpretOp` switch:

```pseudocode
case 'convert_all_commodities':
  count = player.commodities
  if count > 0:
    update player SET commodities=0, trade_goods=trade_goods+count

case 'spend_commodities':
  amount = op.amount as number
  if player.commodities < amount: ERR 'Insufficient commodities'
  update player SET commodities=commodities-amount

case 'gain_command_token_choice':
  bucket = context.selections?.command_token_bucket ?? 'tactic_total'
  if bucket NOT IN ['tactic_total','fleet','strategy']: ERR 'Invalid command token bucket'
  tokens[bucket] += 1
  update player SET command_tokens=tokens
```

## Tests
```pseudocode
// convert_all_commodities
it('converts all commodities to trade goods')
  player = { commodities:3, trade_goods:1 }
  result: commodities=0, trade_goods=4

it('no-ops when commodities=0')
  player = { commodities:0, trade_goods:2 }
  result: no update called

// spend_commodities
it('deducts commodities')
  player = { commodities:2 }; op.amount=1
  result: commodities=1

it('409 Insufficient commodities when player has fewer than amount')
  player = { commodities:0 }; op.amount=1

// gain_command_token_choice
it('adds 1 token to chosen bucket')
  context.selections.command_token_bucket='fleet'
  tokens before: {tactic_total:3,fleet:2,strategy:1}
  result: fleet=3

it('defaults to tactic_total when bucket not provided')
it('409 Invalid command token bucket for unknown bucket name')
```
