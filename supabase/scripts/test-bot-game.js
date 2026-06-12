// Integration test: create a game, add bots, start it, play through 1 round.
// Run from project root: node supabase/scripts/test-bot-game.js
//
// Prerequisites:
//   - Apply supabase/migrations/055_bot_players.sql to the DB
//   - Deploy game-add-bot: supabase functions deploy game-add-bot --no-verify-jwt
//   - Deploy game-remove-bot: supabase functions deploy game-remove-bot --no-verify-jwt (if exists)

const fs = require('fs')
const path = require('path')

const ENV_FILE = path.resolve(__dirname, '../../ti4-companion-web/.env')
const BASE_URL = 'https://mgbagajfrfielqrjpuvi.supabase.co'

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

const env = loadEnv(ENV_FILE)
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const TEST_EMAIL = 'test-bot-runner@example.com'
const TEST_PASSWORD = 'TestBotRunner999!'

let passed = 0
let failed = 0
let warnings = 0

function ok(label) {
  console.log(`  ✅ ${label}`)
  passed++
}

function fail(label, detail) {
  console.log(`  ❌ ${label}`)
  if (detail) console.log(`     ${detail}`)
  failed++
}

function warn(label, detail) {
  console.log(`  ⚠️  ${label}`)
  if (detail) console.log(`     ${detail}`)
  warnings++
}

async function authFetch(url, token, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function getToken() {
  const res = await fetch(`${BASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Login failed: ${JSON.stringify(data)}`)
  return data.access_token
}

async function ensureTestUser() {
  // Try to create; ignore if already exists
  const res = await fetch(`${BASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  })
  const data = await res.json()
  if (res.status === 200 || res.status === 422) return // 422 = already exists
  if (!data.id) throw new Error(`Could not create test user: ${JSON.stringify(data)}`)
}

async function deleteTestGame(gameId, token) {
  // Clean up via service role - direct DB delete
  await fetch(`${BASE_URL}/rest/v1/game_events?game_id=eq.${gameId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
  })
  await fetch(`${BASE_URL}/rest/v1/game_players?game_id=eq.${gameId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
  })
  await fetch(`${BASE_URL}/rest/v1/games?id=eq.${gameId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
  })
}

async function fn(name, token, body) {
  return authFetch(`${BASE_URL}/functions/v1/${name}`, token, body)
}

async function getGame(gameId) {
  const res = await fetch(
    `${BASE_URL}/rest/v1/games?id=eq.${gameId}&select=*`,
    { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } }
  )
  const data = await res.json()
  return data[0]
}

async function getPlayers(gameId) {
  const res = await fetch(
    `${BASE_URL}/rest/v1/game_players?game_id=eq.${gameId}&select=*`,
    { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } }
  )
  return res.json()
}

async function main() {
  console.log('\n🎲 TI4 Companion — Bot Game Integration Test\n')

  // Setup
  await ensureTestUser()
  const token = await getToken()

  // --- Phase: Create game ---
  console.log('📋 Game Setup')
  const createRes = await fn('game-create', token, {
    vp_goal: 10,
    expansions: { base: true, pok: false, te: false },
  })
  if (createRes.status !== 200 || !createRes.data.game_id) {
    fail('game-create', JSON.stringify(createRes.data))
    process.exit(1)
  }
  const gameId = createRes.data.game_id
  ok(`game-create → ${createRes.data.code}`)

  // Host picks faction
  const pickRes = await fn('game-pick-faction-color', token, {
    game_id: gameId, faction: 'The Federation of Sol', colour: 'blue',
  })
  pickRes.status === 200 ? ok('host picks faction/colour') : fail('game-pick-faction-color', JSON.stringify(pickRes.data))

  // Add bot 1
  const bot1Res = await fn('game-add-bot', token, {
    game_id: gameId, display_name: 'BotAlpha', faction: 'The Emirates of Hacan',
    color: 'red', bot_strategy: 'scripted',
  })
  if (bot1Res.status === 200) {
    ok('game-add-bot (scripted) → BotAlpha/Hacan')
  } else {
    fail('game-add-bot', JSON.stringify(bot1Res.data))
    if (JSON.stringify(bot1Res.data).includes('does not exist') || bot1Res.status === 500) {
      console.log('\n  ⛔ Migration 055_bot_players.sql has not been applied.')
      console.log('     Run this SQL in the Supabase dashboard SQL editor:')
      console.log('     ALTER TABLE public.game_players')
      console.log('       ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false,')
      console.log('       ADD COLUMN IF NOT EXISTS bot_strategy TEXT CHECK (bot_strategy IN (\'random\', \'scripted\'));')
      console.log('\n     Then re-run this script.\n')
    }
    await deleteTestGame(gameId, token)
    process.exit(1)
  }

  // Add bot 2
  const bot2Res = await fn('game-add-bot', token, {
    game_id: gameId, display_name: 'BotBeta', faction: 'The L1Z1X Mindnet',
    color: 'green', bot_strategy: 'random',
  })
  bot2Res.status === 200 ? ok('game-add-bot (random) → BotBeta/L1Z1X') : fail('game-add-bot #2', JSON.stringify(bot2Res.data))

  // Set speaker
  const players = await getPlayers(gameId)
  const hostPlayer = players.find(p => !p.is_bot)
  const setSpkRes = await fn('game-set-speaker', token, { game_id: gameId, speaker_player_id: hostPlayer.id })
  setSpkRes.status === 200 ? ok('game-set-speaker') : fail('game-set-speaker', JSON.stringify(setSpkRes.data))

  // Set map
  const mapRes = await fn('game-update-settings', token, {
    game_id: gameId,
    map_string: '18 36 30 34 35 33 17',
  })
  mapRes.status === 200 ? ok('game-update-settings (map)') : warn('game-update-settings', JSON.stringify(mapRes.data))

  // Start game
  console.log('\n🚀 Starting Game')
  const startRes = await fn('game-start', token, { game_id: gameId })
  if (startRes.status === 200) {
    ok('game-start')
  } else {
    fail('game-start', JSON.stringify(startRes.data))
    await deleteTestGame(gameId, token)
    process.exit(1)
  }

  let game = await getGame(gameId)
  ok(`Game phase: ${game.phase}, round: ${game.round}`)

  // --- Phase: Strategy ---
  console.log('\n🃏 Strategy Phase')
  const freshPlayers = await getPlayers(gameId)
  for (const p of freshPlayers) {
    const label = p.is_bot ? `bot ${p.display_name}` : 'host'

    // Get current game state to find available strategy cards
    const currentGame = await getGame(gameId)
    if (currentGame.phase !== 'strategy') {
      warn(`Strategy phase ended early (phase=${currentGame.phase})`)
      break
    }

    const strat = currentGame.strategy_cards || []
    const picked = new Set(freshPlayers.map(x => x.strategy_card).filter(Boolean))
    const available = strat.filter(c => !picked.has(c.name))
    if (available.length === 0) break
    // Pick lowest initiative card
    const pick = available.sort((a, b) => (a.initiative ?? 99) - (b.initiative ?? 99))[0]
    if (!pick) { warn(`No strategy cards available for ${label}`); break }

    // Need per-player tokens; use the same host token for simplicity (host is host)
    const playRes = await fn('game-play-strategy-card', token, {
      game_id: gameId, strategy_card: pick.name,
    })
    playRes.status === 200
      ? ok(`${label} picks ${pick.name}`)
      : fail(`${label} picks strategy card`, JSON.stringify(playRes.data))
  }

  // --- Phase: Action (simulate passing) ---
  console.log('\n⚔️  Action Phase — bots pass')
  let actionRounds = 0
  while (actionRounds < 20) {
    const currentGame = await getGame(gameId)
    if (currentGame.phase !== 'action') break
    actionRounds++
    const passRes = await fn('game-player-pass', token, { game_id: gameId })
    if (passRes.status === 200) {
      ok(`host passes (action round ${actionRounds})`)
    } else {
      warn(`game-player-pass`, JSON.stringify(passRes.data))
      break
    }
  }

  // --- Phase: Status ---
  console.log('\n📊 Status Phase')
  const statusGame = await getGame(gameId)
  if (statusGame.phase === 'status') {
    ok(`Reached status phase`)
    const statusPassRes = await fn('game-player-pass', token, { game_id: gameId })
    statusPassRes.status === 200 ? ok('host passes status phase') : fail('status pass', JSON.stringify(statusPassRes.data))
  } else {
    warn(`Expected status phase, got: ${statusGame.phase}`)
  }

  // --- Summary ---
  console.log('\n─────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed, ${warnings} warnings`)
  if (failed === 0) console.log('✅ All checks passed!')
  else console.log('❌ Some checks failed — see above.')

  // Cleanup
  await deleteTestGame(gameId, token)
  console.log(`🧹 Cleaned up game ${gameId}`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Fatal error:', e.message)
  process.exit(1)
})
