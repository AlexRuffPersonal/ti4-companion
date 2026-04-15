// Run from the project root: node supabase/scripts/import-units.js
//
// Reads SUPABASE_SERVICE_ROLE_KEY from ti4-companion-web/.env automatically.

const fs = require('fs')
const path = require('path')

const ENV_FILE = path.resolve(__dirname, '../../ti4-companion-web/.env')
const JSON_FILE = path.resolve(__dirname, '../jsons/units.json')
const FUNCTION_URL = 'https://mgbagajfrfielqrjpuvi.supabase.co/functions/v1/admin-import-units'

function loadEnv(envPath) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  const env = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

async function main() {
  const env = loadEnv(ENV_FILE)
  const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
  if (!SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found in ti4-companion-web/.env')
    process.exit(1)
  }

  const records = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'))
  console.log(`Importing ${records.length} units...`)

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ records }),
  })

  const data = await res.json()

  if (!res.ok) {
    console.error(`Error ${res.status}:`, data)
    process.exit(1)
  }

  console.log('Success:', data)
}

main()
