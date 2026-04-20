import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js'

const url = Deno.env.get('SUPABASE_URL')
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.')
}

/**
 * Supabase admin client — uses service role key, bypasses RLS.
 * Module-level singleton: one client per cold start.
 * Only use inside Edge Functions, never expose to the client.
 */
export const db: SupabaseClient = createClient(url, key)
