// Stub for https://esm.sh/* imports used in Deno Edge Functions.
// Vitest cannot load CDN URLs; this stub provides no-op exports so that
// modules containing requireTurnAuth (and other pure functions) can be
// imported and tested without a real Supabase client.
export const createClient = () => ({})
export default {}
