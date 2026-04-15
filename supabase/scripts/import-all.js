// Run from the project root: node supabase/scripts/import-all.js
//
// Runs each import script only if the corresponding JSON exists in supabase/jsons/.
// Stops on the first failure.

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const SCRIPTS_DIR = path.resolve(__dirname)
const JSONS_DIR = path.resolve(__dirname, '../jsons')

const IMPORTS = [
  { script: 'import-tiles.js',              json: 'tiles.json' },
  { script: 'import-factions.js',           json: 'factions.json' },
  { script: 'import-agendas.js',            json: 'agendas.json' },
  { script: 'import-technologies.js',       json: 'technologies.json' },
  { script: 'import-units.js',              json: 'units.json' },
  { script: 'import-public-objectives.js',  json: 'public-objectives.json' },
  { script: 'import-secret-objectives.js',  json: 'secret-objectives.json' },
  { script: 'import-action-cards.js',       json: 'action-cards.json' },
  { script: 'import-relics.js',             json: 'relics.json' },
  { script: 'import-exploration-cards.js',  json: 'exploration-cards.json' },
  { script: 'import-attachments.js',        json: 'attachments.json' },
  { script: 'import-promissory-notes.js',   json: 'promissory-notes.json' },
]

for (const { script, json } of IMPORTS) {
  const jsonPath = path.join(JSONS_DIR, json)
  if (!fs.existsSync(jsonPath)) {
    console.log(`Skipping ${script} — ${json} not found`)
    continue
  }

  let records
  try {
    records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  } catch {
    console.log(`Skipping ${script} — ${json} is not valid JSON`)
    continue
  }
  if (!Array.isArray(records) || records.length === 0) {
    console.log(`Skipping ${script} — ${json} is empty`)
    continue
  }

  console.log(`\nRunning ${script}...`)
  const result = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, script)], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`\n${script} failed (exit code ${result.status})`)
    process.exit(result.status)
  }
}

console.log('\nAll imports complete.')
