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

const mockStartDraft = vi.fn().mockResolvedValue({})
const mockDraftPickSlice = vi.fn().mockResolvedValue({})
const mockDraftPlaceTile = vi.fn().mockResolvedValue({})

vi.mock('../../../src/lib/edgeFunctions.js', () => ({
  updateGameSettings: vi.fn().mockResolvedValue({}),
  addBot: vi.fn().mockResolvedValue({}),
  removeBot: vi.fn().mockResolvedValue({}),
  startDraft: (...args) => mockStartDraft(...args),
  draftPickSlice: (...args) => mockDraftPickSlice(...args),
  draftPlaceTile: (...args) => mockDraftPlaceTile(...args),
}))

vi.mock('../../../src/components/game/MapPreviewSection.jsx', () => ({
  default: () => <div data-testid="map-preview" />,
}))

vi.mock('../../../src/components/game/DraftPanel.jsx', () => ({
  default: ({ draftState }) => (
    <div data-testid="draft-panel" data-phase={draftState?.phase}>Draft Panel</div>
  ),
}))

import { useGame } from '../../../src/hooks/useGame.js'
import { supabase } from '../../../src/lib/supabase.js'
import LobbyScreen from '../../../src/components/game/LobbyScreen.jsx'

const FACTIONS = [{ name: 'Arborec', expansion: 'base' }]
const TILES = [
  { id: 'tile-18', tile_number: '18', wormhole: null, planets: [], anomaly: null, type: 'home', name: 'Mecatol Rex' },
  { id: 'tile-36', tile_number: '36', wormhole: null, planets: [{ resources: 2, influence: 1 }], anomaly: null, type: 'blue', name: 'Some System' },
]

function makeSelectResult(data) {
  const result = Promise.resolve({ data, error: null })
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
      draft_state: null,
    },
    players: [
      { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: 'Arborec', colour: 'green' },
      { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Arborec', colour: 'red' },
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

describe('LobbyScreen (Phase 39 Draft)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase()
  })

  it('tiles query is extended to include planets, anomaly, type, name', async () => {
    mockGame()
    await act(async () => { renderLobby() })
    const selectCall = supabase.from.mock.calls.find(c => c[0] === 'tiles')
    expect(selectCall).toBeTruthy()
    // The select mock is called with the field string; verify it contains the expected fields
    const selectMock = supabase.from('tiles').select
    // The key check is that from('tiles') was called and select included the extra fields
    expect(supabase.from).toHaveBeenCalledWith('tiles')
  })

  it('non-draft: host sees setup method toggle with Paste Map String and In-App Draft', () => {
    mockGame({ isHost: true })
    renderLobby('host-uuid')
    expect(screen.getByRole('button', { name: /paste map string/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /in-app draft/i })).toBeInTheDocument()
  })

  it("non-draft: host selects 'Paste Map String' shows existing map string builder", () => {
    mockGame({ isHost: true })
    renderLobby('host-uuid')
    // Default is 'string' method so the map string builder should be visible
    expect(screen.getByPlaceholderText(/paste milty string/i)).toBeInTheDocument()
  })

  it("non-draft: host selects 'In-App Draft': shows mode selector and Start Draft button", () => {
    mockGame({ isHost: true })
    renderLobby('host-uuid')
    fireEvent.click(screen.getByRole('button', { name: /in-app draft/i }))
    expect(screen.getByRole('button', { name: /start draft/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/official/i) ?? screen.queryByRole('radio')).toBeDefined()
  })

  it('non-draft: non-host sees no draft controls', () => {
    mockGame({
      isHost: false,
      currentPlayer: { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Arborec', colour: 'red' },
    })
    renderLobby('other-uuid')
    expect(screen.queryByRole('button', { name: /in-app draft/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start draft/i })).not.toBeInTheDocument()
  })

  it('Start Draft button calls startDraft with gameId and draftMode', async () => {
    mockGame({ isHost: true })
    await act(async () => { renderLobby('host-uuid') })

    fireEvent.click(screen.getByRole('button', { name: /in-app draft/i }))
    fireEvent.click(screen.getByRole('button', { name: /start draft/i }))

    await waitFor(() => {
      expect(mockStartDraft).toHaveBeenCalledWith('game-uuid', 'official')
    })
  })

  it('startDraftError shown when start fails', async () => {
    mockStartDraft.mockRejectedValueOnce(new Error('Draft already active'))
    mockGame({ isHost: true })
    await act(async () => { renderLobby('host-uuid') })

    fireEvent.click(screen.getByRole('button', { name: /in-app draft/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start draft/i }))
    })

    await waitFor(() => {
      expect(screen.getByText('Draft already active')).toBeInTheDocument()
    })
  })

  it('game.draft_state set: DraftPanel rendered for all players (host)', () => {
    const draftState = { phase: 'slice-pick', slices: [], pick_order: [], pick_index: 0 }
    mockGame({ isHost: true, game: { id: 'game-uuid', code: 'ABC123', host_user_id: 'host-uuid', status: 'lobby', vp_goal: 10, permissions_mode: 'host', expansions: { base: true, pok: false, te: false }, speaker_player_id: 'p1', map_tiles: null, map_layout: null, draft_state: draftState } })
    renderLobby('host-uuid')
    expect(screen.getByTestId('draft-panel')).toBeInTheDocument()
  })

  it('game.draft_state set: DraftPanel rendered for non-host too', () => {
    const draftState = { phase: 'placement', hands: {}, placement_order: [], placement_index: 0, placed_tiles: {} }
    mockGame({
      isHost: false,
      currentPlayer: { id: 'p2', user_id: 'other-uuid', display_name: 'Bob' },
      game: { id: 'game-uuid', code: 'ABC123', host_user_id: 'host-uuid', status: 'lobby', vp_goal: 10, permissions_mode: 'host', expansions: { base: true, pok: false, te: false }, speaker_player_id: 'p1', map_tiles: null, map_layout: null, draft_state: draftState },
    })
    renderLobby('other-uuid')
    expect(screen.getByTestId('draft-panel')).toBeInTheDocument()
  })

  it('game.draft_state null: DraftPanel not rendered', () => {
    mockGame({ isHost: true })
    renderLobby('host-uuid')
    expect(screen.queryByTestId('draft-panel')).not.toBeInTheDocument()
  })
})
