import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../../../src/hooks/useGame.js', () => ({
  useGame: vi.fn(),
}))

vi.mock('../../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { edgeFunctionStubs } from '../../helpers/edgeFunctionMocks.js'

vi.mock('../../../src/lib/edgeFunctions.js', () => ({ ...edgeFunctionStubs }))

// Mock MapPreviewSection so it doesn't depend on SVG/canvas
vi.mock('../../../src/components/game/MapPreviewSection.jsx', () => ({
  default: () => <div data-testid="map-preview" />,
}))

import { useGame } from '../../../src/hooks/useGame.js'
import { supabase } from '../../../src/lib/supabase.js'
import { updateGameSettings, addBot, removeBot } from '../../../src/lib/edgeFunctions.js'
import LobbyScreen from '../../../src/components/game/LobbyScreen.jsx'

const FACTIONS = [
  { name: 'Arborec', expansion: 'base' },
  { name: 'Letnev', expansion: 'base' },
]

const TILES = [
  { id: 'tile-18', tile_number: '18', wormholes: [], anomalies: [] },
  { id: 'tile-30', tile_number: '30', wormholes: [], anomalies: [] },
  { id: 'tile-36', tile_number: '36', wormholes: [], anomalies: [] },
]

function makeSelectResult(data) {
  const result = Promise.resolve({ data, error: null })
  // Make it both thenable (for .then() chain) and chainable (for .order())
  result.order = vi.fn().mockResolvedValue({ data, error: null })
  return result
}

function mockSupabase() {
  supabase.from.mockImplementation((table) => ({
    select: vi.fn().mockReturnValue(
      makeSelectResult(table === 'factions' ? FACTIONS : TILES)
    ),
  }))
}

function mockGame(overrides = {}) {
  const defaults = {
    game: {
      id: 'game-uuid',
      code: 'ABC123',
      host_user_id: 'host-uuid',
      status: 'lobby',
      vp_goal: 10,
      permissions_mode: 'host',
      expansions: { base: true, pok: false, te: false },
      speaker_player_id: 'p1',
      map_tiles: null,
      map_layout: null,
    },
    players: [
      { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: 'Arborec', colour: 'green' },
      { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Letnev', colour: 'red' },
    ],
    currentPlayer: { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: 'Arborec', colour: 'green' },
    isHost: true,
    loading: false,
    error: null,
    updateSettings: vi.fn(),
    pickFaction: vi.fn(),
    setGameSpeaker: vi.fn(),
    startTheGame: vi.fn(),
  }
  useGame.mockReturnValue({ ...defaults, ...overrides })
}

function renderLobby(userId = 'host-uuid') {
  return render(
    <MemoryRouter initialEntries={['/lobby/ABC123']}>
      <Routes>
        <Route path="/lobby/:code" element={<LobbyScreen userId={userId} />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LobbyScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase()
  })

  it('shows the room code', () => {
    mockGame()
    renderLobby()
    // Code appears in both header and invite link; check at least one is present
    expect(screen.getAllByText(/ABC123/)[0]).toBeInTheDocument()
  })

  it('shows all player names', () => {
    mockGame()
    renderLobby()
    // Names appear in player list and speaker dropdown; check at least one instance each
    expect(screen.getAllByText('Alice')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Bob')[0]).toBeInTheDocument()
  })

  it('host sees the settings panel', () => {
    mockGame({ isHost: true })
    renderLobby('host-uuid')
    expect(screen.getByLabelText(/vp goal/i)).toBeInTheDocument()
  })

  it('non-host does not see the settings panel', () => {
    mockGame({
      isHost: false,
      currentPlayer: { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Letnev', colour: 'red' },
    })
    renderLobby('other-uuid')
    expect(screen.queryByLabelText(/vp goal/i)).not.toBeInTheDocument()
  })

  it('Start Game button is disabled when not all players have picked faction/color', () => {
    mockGame({
      players: [
        { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: null, colour: null },
      ],
      isHost: true,
    })
    renderLobby()
    expect(screen.getByRole('button', { name: /start game/i })).toBeDisabled()
  })

  it('Start Game button is disabled when no speaker is set', () => {
    mockGame({
      game: {
        id: 'game-uuid', code: 'ABC123', host_user_id: 'host-uuid',
        status: 'lobby', vp_goal: 10, permissions_mode: 'host',
        expansions: { base: true, pok: false, te: false },
        speaker_player_id: null,
      },
      isHost: true,
    })
    renderLobby()
    expect(screen.getByRole('button', { name: /start game/i })).toBeDisabled()
  })

  it('Start Game button is enabled when all players are ready and speaker is set', () => {
    mockGame({ isHost: true })
    renderLobby()
    expect(screen.getByRole('button', { name: /start game/i })).not.toBeDisabled()
  })

  it('non-host does not see Start Game button', () => {
    mockGame({
      isHost: false,
      currentPlayer: { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Letnev', colour: 'red' },
    })
    renderLobby('other-uuid')
    expect(screen.queryByRole('button', { name: /start game/i })).not.toBeInTheDocument()
  })

  it('shows inline error and reverts when pickFaction fails with conflict', async () => {
    const pickFaction = vi.fn().mockRejectedValue(new Error('Faction already taken by another player'))
    mockGame({ isHost: true, pickFaction })

    // Wrap render in act so the async factions useEffect flushes before we interact
    await act(async () => { renderLobby() })

    const select = screen.getByLabelText(/faction/i)
    await act(async () => {
      fireEvent.change(select, { target: { value: 'Letnev' } })
    })

    expect(screen.getByText(/already taken/i)).toBeInTheDocument()
  })

  it('calls startTheGame when Start Game is clicked', async () => {
    const startTheGame = vi.fn().mockResolvedValue({ started: true })
    mockGame({ isHost: true, startTheGame })
    renderLobby()
    fireEvent.click(screen.getByRole('button', { name: /start game/i }))
    await waitFor(() => expect(startTheGame).toHaveBeenCalled())
  })
})

describe('LobbyScreen — map builder (host only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase()
    mockGame({ isHost: true })
  })

  it('non-host does not see player count selector', () => {
    mockGame({ isHost: false })
    renderLobby('other-uuid')
    expect(screen.queryByLabelText(/player count/i)).not.toBeInTheDocument()
  })

  it('non-host does not see Save Map button', () => {
    mockGame({ isHost: false })
    renderLobby('other-uuid')
    expect(screen.queryByRole('button', { name: /save map/i })).not.toBeInTheDocument()
  })

  it('all players see MapPreviewSection', () => {
    mockGame({ isHost: false })
    renderLobby('other-uuid')
    expect(screen.getByTestId('map-preview')).toBeInTheDocument()
  })

  it('host sees player count selector', () => {
    renderLobby()
    expect(screen.getByLabelText(/player count/i)).toBeInTheDocument()
  })

  it('host sees preset dropdown', () => {
    renderLobby()
    expect(screen.getByLabelText(/preset map/i)).toBeInTheDocument()
  })

  it('host sees milty string textarea', () => {
    renderLobby()
    expect(screen.getByPlaceholderText(/milty string/i)).toBeInTheDocument()
  })

  it('host sees Save Map button', () => {
    renderLobby()
    expect(screen.getByRole('button', { name: /save map/i })).toBeInTheDocument()
  })

  it('Save Map button disabled when mapString is empty', () => {
    renderLobby()
    expect(screen.getByRole('button', { name: /save map/i })).toBeDisabled()
  })

  it('Save Map button disabled when parse error present', () => {
    renderLobby()
    const textarea = screen.getByPlaceholderText(/milty string/i)
    fireEvent.change(textarea, { target: { value: '18 abc 30' } })
    expect(screen.getByText(/invalid tile numbers/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save map/i })).toBeDisabled()
  })

  it('Save Map button enabled with valid map string', async () => {
    renderLobby()
    await act(async () => {}) // flush tile-loading useEffect
    const textarea = screen.getByPlaceholderText(/milty string/i)
    fireEvent.change(textarea, { target: { value: '18 36 30' } })
    expect(screen.getByRole('button', { name: /save map/i })).not.toBeDisabled()
  })

  it('clicking Save Map calls updateGameSettings', async () => {
    renderLobby()
    await act(async () => {}) // flush tile-loading useEffect
    const textarea = screen.getByPlaceholderText(/milty string/i)
    fireEvent.change(textarea, { target: { value: '18 36 30' } })
    fireEvent.click(screen.getByRole('button', { name: /save map/i }))
    await waitFor(() => expect(updateGameSettings).toHaveBeenCalled())
    const [gameId, payload] = updateGameSettings.mock.calls[0]
    expect(gameId).toBe('game-uuid')
    expect(payload).toHaveProperty('map_tiles')
    expect(payload).toHaveProperty('map_layout')
  })

  it('PoK preset is disabled when pok expansion is off', () => {
    renderLobby()
    const presetSelect = screen.getByLabelText(/preset map/i)
    // Ensure player count = 6 to see PoK 6P option
    const playerCountSelect = screen.getByLabelText(/player count/i)
    fireEvent.change(playerCountSelect, { target: { value: '6' } })
    const pokOption = Array.from(presetSelect.querySelectorAll('option')).find(o =>
      o.textContent.toLowerCase().includes('pok')
    )
    if (pokOption) {
      expect(pokOption.disabled).toBe(true)
    }
  })
})

describe('LobbyScreen — bot add/remove', () => {
  const botPlayer = {
    id: 'bot-1',
    user_id: null,
    display_name: 'Bot 1',
    faction: 'Arborec',
    colour: 'purple',
    is_bot: true,
    bot_strategy: 'scripted',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase()
  })

  it('AddBotSection renders only for host', () => {
    mockGame({ isHost: true })
    renderLobby('host-uuid')
    expect(screen.getByRole('button', { name: /add bot/i })).toBeInTheDocument()
  })

  it('AddBotSection is not rendered for non-host', () => {
    mockGame({
      isHost: false,
      currentPlayer: { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Letnev', colour: 'red' },
    })
    renderLobby('other-uuid')
    expect(screen.queryByRole('button', { name: /add bot/i })).not.toBeInTheDocument()
  })

  it('AddBotSection submit calls addBot with correct args', async () => {
    addBot.mockResolvedValue({})
    mockGame({ isHost: true, players: [
      { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: 'Arborec', colour: 'green' },
    ] })
    await act(async () => { renderLobby('host-uuid') })

    fireEvent.click(screen.getByRole('button', { name: /add bot/i }))

    const nameInput = screen.getByLabelText(/display name/i)
    fireEvent.change(nameInput, { target: { value: 'Bot Test' } })

    const factionSelect = screen.getByLabelText(/bot faction/i)
    fireEvent.change(factionSelect, { target: { value: 'Letnev' } })

    const colourBtn = screen.getByLabelText(/bot colour blue/i)
    fireEvent.click(colourBtn)

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(addBot).toHaveBeenCalledWith(
      'game-uuid', 'Bot Test', 'Letnev', 'blue', 'scripted'
    ))
  })

  it('AddBotSection shows error inline on failure', async () => {
    addBot.mockRejectedValue(new Error('Bot limit reached'))
    mockGame({ isHost: true })
    await act(async () => { renderLobby('host-uuid') })

    fireEvent.click(screen.getByRole('button', { name: /add bot/i }))

    const nameInput = screen.getByLabelText(/display name/i)
    fireEvent.change(nameInput, { target: { value: 'Bot X' } })
    const factionSelect = screen.getByLabelText(/bot faction/i)
    fireEvent.change(factionSelect, { target: { value: 'Letnev' } })
    const colourBtn = screen.getByLabelText(/bot colour blue/i)
    fireEvent.click(colourBtn)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    })

    expect(screen.getByText(/bot limit reached/i)).toBeInTheDocument()
  })

  it('BotSlot renders for each is_bot player', () => {
    mockGame({
      isHost: true,
      players: [
        { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: 'Arborec', colour: 'green' },
        { ...botPlayer },
      ],
    })
    renderLobby('host-uuid')
    expect(screen.getAllByTestId('bot-slot')).toHaveLength(1)
    expect(screen.getAllByText('Bot 1')[0]).toBeInTheDocument()
  })

  it('BotSlot Remove button calls removeBot with bot player id', async () => {
    removeBot.mockResolvedValue({})
    mockGame({
      isHost: true,
      players: [
        { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: 'Arborec', colour: 'green' },
        { ...botPlayer },
      ],
    })
    renderLobby('host-uuid')

    fireEvent.click(screen.getByRole('button', { name: /remove bot 1/i }))
    await waitFor(() => expect(removeBot).toHaveBeenCalledWith('game-uuid', 'bot-1'))
  })

  it('BotSlot Remove button hidden for non-host', () => {
    mockGame({
      isHost: false,
      currentPlayer: { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Letnev', colour: 'red' },
      players: [
        { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: 'Arborec', colour: 'green' },
        { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Letnev', colour: 'red' },
        { ...botPlayer },
      ],
    })
    renderLobby('other-uuid')
    expect(screen.queryByRole('button', { name: /remove bot 1/i })).not.toBeInTheDocument()
  })
})

describe('LobbyScreen — PoK warning banner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase()
  })

  it('shows warning when map_layout includes pok and pok expansion is off', () => {
    mockGame({
      isHost: true,
      game: {
        id: 'game-uuid', code: 'ABC123', host_user_id: 'host-uuid',
        status: 'lobby', vp_goal: 10, permissions_mode: 'host',
        speaker_player_id: 'p1', map_tiles: null,
        map_layout: 'pok-6p',
        expansions: { base: true, pok: false, te: false },
      },
    })
    renderLobby()
    expect(screen.getByText(/saved map contains pok tiles/i)).toBeInTheDocument()
  })

  it('does not show warning when pok expansion is enabled', () => {
    mockGame({
      isHost: true,
      game: {
        id: 'game-uuid', code: 'ABC123', host_user_id: 'host-uuid',
        status: 'lobby', vp_goal: 10, permissions_mode: 'host',
        speaker_player_id: 'p1', map_tiles: null,
        map_layout: 'pok-6p',
        expansions: { base: true, pok: true, te: false },
      },
    })
    renderLobby()
    expect(screen.queryByText(/saved map contains pok tiles/i)).not.toBeInTheDocument()
  })
})
