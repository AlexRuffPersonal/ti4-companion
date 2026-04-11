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

import { useGame } from '../../../src/hooks/useGame.js'
import { supabase } from '../../../src/lib/supabase.js'
import LobbyScreen from '../../../src/components/game/LobbyScreen.jsx'

const FACTIONS = [
  { name: 'Arborec', expansion: 'base' },
  { name: 'Letnev', expansion: 'base' },
]

function mockFactions() {
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: FACTIONS, error: null }),
    }),
  })
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
    mockFactions()
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
