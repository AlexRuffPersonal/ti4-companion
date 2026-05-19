# shared-promissoryHandlers-p39a
**File:** `supabase/functions/_shared/promissoryHandlers.ts`
**Status:** New
**Prereqs:** shared-abilityDsl-p39a

## Functionality
- Export: `resolvePromissoryHandler(key: string, ctx: ResolveContext, db: SupabaseClient): Promise<void>`
- Dispatches on key via switch statement
- 39a: ALL 26 handler keys fall through to `throw dslError('Promissory handler X not yet implemented', 501)`
  - Keys: ceasefire, politicalSecret, politicalFavor, acquiescence, firesOfTheGashlai, creussIff, terraform, warFunding, tekklarLegion, theCavalry, researchAgreement, cyberneticEnhancements, militarySupport, raghsCall, greyfireMutagen, spyNet, scepterOfDominion, strikeWingAmbuscade, crucible, tradeConvoys, promiseOfProtection, bloodPact, darkPact, stymie, antivirus, giftOfPrescience
- `default:` throws dslError('Unknown promissory handler X', 400)

## Tests
- Called with any known key → throws dslError status 501
- Called with unknown key → throws dslError status 400
