import { okResponse } from '../_shared/errors.ts'

Deno.serve(async (_req: Request) => {
  return okResponse({ status: 'ok', timestamp: new Date().toISOString() })
})
