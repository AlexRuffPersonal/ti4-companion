import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PromissoryNotesModal from '../../../src/components/game/PromissoryNotesModal.jsx'

const NOTES = [
  {
    id: 'n1',
    state: 'held',
    held_by_player_id: 'p1',
    origin_player_id: 'p1',
    note_id: 'ref-1',
    promissory_notes: { name: 'Jol-Nar Technology', text: 'Trade Convoy', into_play_area: false },
  },
  {
    id: 'n2',
    state: 'held',
    held_by_player_id: 'p1',
    origin_player_id: 'p1',
    note_id: 'ref-2',
    promissory_notes: { name: 'Support for the Throne', text: 'Gives {{owner}} 1 VP', into_play_area: true },
  },
]

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]

function renderModal(notes = NOTES, overrides = {}) {
  return render(
    <PromissoryNotesModal
      notes={notes}
      players={PLAYERS}
      currentPlayerId="p1"
      onGive={vi.fn()}
      onPlay={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />
  )
}

describe('PromissoryNotesModal', () => {
  it('renders held note names', () => {
    renderModal()
    expect(screen.getByText('Jol-Nar Technology')).toBeInTheDocument()
    expect(screen.getByText('Support for the Throne')).toBeInTheDocument()
  })

  it('resolves {{owner}} placeholder with origin_player_id display_name', () => {
    renderModal()
    expect(screen.getByText(/Gives Alice 1 VP/)).toBeInTheDocument()
  })

  it('GIVE button opens trade flow', () => {
    const onGive = vi.fn()
    renderModal(NOTES, { onGive })
    const giveButtons = screen.getAllByRole('button', { name: /give/i })
    fireEvent.click(giveButtons[0])
    expect(onGive).toHaveBeenCalledWith(NOTES[0])
  })

  it('PLAY button shown only for into_play_area=false notes', () => {
    renderModal()
    const playButtons = screen.queryAllByRole('button', { name: /play/i })
    expect(playButtons.length).toBe(1)
  })

  it('PLAY button calls onPlay with note id', () => {
    const onPlay = vi.fn()
    renderModal(NOTES, { onPlay })
    const playButton = screen.getByRole('button', { name: /play/i })
    fireEvent.click(playButton)
    expect(onPlay).toHaveBeenCalledWith(NOTES[0].id)
  })

  it('renders empty state when no notes', () => {
    renderModal([])
    expect(screen.getByText(/no promissory notes/i)).toBeInTheDocument()
  })

  it('calls onClose when Close button clicked', () => {
    const onClose = vi.fn()
    renderModal(NOTES, { onClose })
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})