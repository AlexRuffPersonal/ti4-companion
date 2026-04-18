import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ResolveContext } from './abilityDsl.ts'

type HandlerFn = (context: ResolveContext, db: SupabaseClient) => Promise<void>

/**
 * Registry of named effect handlers for abilities that cannot be expressed
 * as composable DSL ops. Add new handlers here as complex abilities are encoded.
 *
 * Each handler receives the full resolve context and the service-role db client.
 * Throw an Error to signal resolution failure — the caller will return 500.
 */
const handlers: Record<string, HandlerFn> = {
  // Example (add real handlers here as cards are encoded):
  // confounding_legal_text: async (context, db) => { ... },
}

export function getHandler(name: string): HandlerFn {
  const handler = handlers[name]
  if (!handler) throw new Error(`No handler registered for: ${name}`)
  return handler
}
