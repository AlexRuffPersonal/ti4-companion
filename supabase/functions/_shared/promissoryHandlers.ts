import { dslError } from './abilityDsl.ts'
import type { ResolveContext } from './abilityDsl.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function resolvePromissoryHandler(
  key: string,
  ctx: ResolveContext,
  db: SupabaseClient
): Promise<void> {
  switch (key) {
    case 'ceasefire':
    case 'politicalSecret':
    case 'politicalFavor':
    case 'acquiescence':
    case 'firesOfTheGashlai':
    case 'creussIff':
    case 'terraform':
    case 'warFunding':
    case 'tekklarLegion':
    case 'theCavalry':
    case 'researchAgreement':
    case 'cyberneticEnhancements':
    case 'militarySupport':
    case 'raghsCall':
    case 'greyfireMutagen':
    case 'spyNet':
    case 'scepterOfDominion':
    case 'strikeWingAmbuscade':
    case 'crucible':
    case 'tradeConvoys':
    case 'promiseOfProtection':
    case 'bloodPact':
    case 'darkPact':
    case 'stymie':
    case 'antivirus':
    case 'giftOfPrescience':
      throw dslError(`Promissory handler ${key} not yet implemented`, 501)
    default:
      throw dslError(`Unknown promissory handler: ${key}`, 400)
  }
}
