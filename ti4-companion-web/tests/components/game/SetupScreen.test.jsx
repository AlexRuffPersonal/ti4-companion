import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../src/lib/edgeFunctions.js', () => ({
  createGame: vi.fn(),
  joinGame: vi.fn(),
}))

import { createGame, joinGame } from '../../../src/lib/edgeFunctions.js'
import SetupScreen from '../../../src/components/game/SetupScreen.jsx'

function renderSetup() {
  return render(
    <MemoryRouter>
      <SetupScreen />
    </MemoryRouter>
  )
}

describe('SetupScreen', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Create Game button and join code input', () => {
    renderSetup()
    expect(screen.getByRole('button', { name: /create game/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/room code/i)).toBeInTheDocument()
  })

  it('calls createGame and navigates to lobby on create', async () => {
    createGame.mockResolvedValue({ code: 'ABC123', game_id: 'g1' })
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lobby/ABC123'))
  })

  it('shows error when createGame fails', async () => {
    createGame.mockRejectedValue(new Error('Server error'))
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument())
  })

  it('calls joinGame with entered code and navigates to lobby', async () => {
    joinGame.mockResolvedValue({ game_id: 'g1', code: 'XYZ789' })
    renderSetup()
    fireEvent.change(screen.getByPlaceholderText(/room code/i), { target: { value: 'xyz789' } })
    fireEvent.click(screen.getByRole('button', { name: /join game/i }))
    await waitFor(() => expect(joinGame).toHaveBeenCalledWith('XYZ789'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lobby/XYZ789'))
  })

  it('shows error when joinGame fails', async () => {
    joinGame.mockRejectedValue(new Error('Game not found'))
    renderSetup()
    fireEvent.change(screen.getByPlaceholderText(/room code/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: /join game/i }))
    await waitFor(() => expect(screen.getByText(/game not found/i)).toBeInTheDocument())
  })

  it('Join Game button is disabled when code input is empty', () => {
    renderSetup()
    expect(screen.getByRole('button', { name: /join game/i })).toBeDisabled()
  })
})
