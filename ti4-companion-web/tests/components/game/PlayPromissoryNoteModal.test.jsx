import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PlayPromissoryNoteModal from '../../../src/components/game/PlayPromissoryNoteModal.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]

const MY_PLANETS = [
  { planet_name: 'Jord' },
  { planet_name: 'Nestphar' },
]

const MY_RELIC_FRAGMENTS = [
  { id: 'frag-1', relic_fragment_type: 'cultural' },
  { id: 'frag-2', relic_fragment_type: 'cultural' },
  { id: 'frag-3', relic_fragment_type: 'hazardous' },
]

function makeNote(name, flavor_text = 'Some flavor text') {
  return { id: 'note-1', name, flavor_text }
}

function renderModal(note, overrides = {}) {
  return render(
    <PlayPromissoryNoteModal
      note={note}
      players={PLAYERS}
      myPlanets={MY_PLANETS}
      myRelicFragments={MY_RELIC_FRAGMENTS}
      onPlay={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />
  )
}

describe('PlayPromissoryNoteModal', () => {
  it('renders null when note=null', () => {
    const { container } = render(
      <PlayPromissoryNoteModal
        note={null}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        onPlay={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders note name and flavor text', () => {
    renderModal(makeNote('Ceasefire', 'End hostilities.'))
    expect(screen.getByText('Ceasefire')).toBeInTheDocument()
    expect(screen.getByText('End hostilities.')).toBeInTheDocument()
  })

  it('renders player picker for Political Secret; NOT planet picker', () => {
    renderModal(makeNote('Political Secret'))
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('Jord')).not.toBeInTheDocument()
    expect(screen.queryByText('Nestphar')).not.toBeInTheDocument()
  })

  it('renders planet picker for Military Support; NOT player picker', () => {
    renderModal(makeNote('Military Support'))
    expect(screen.getByText('Jord')).toBeInTheDocument()
    expect(screen.getByText('Nestphar')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
  })

  it('renders only Play + Cancel for a note with no selection (e.g. Ceasefire)', () => {
    renderModal(makeNote('Ceasefire'))
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.queryByText('Jord')).not.toBeInTheDocument()
  })

  it('Play btn calls onPlay with selections object', async () => {
    const onPlay = vi.fn().mockResolvedValue(undefined)
    renderModal(makeNote('Political Secret'), { onPlay })
    fireEvent.click(screen.getByText('Alice'))
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    await waitFor(() => {
      expect(onPlay).toHaveBeenCalledWith('note-1', { chosenPlayerId: 'p1' })
    })
  })

  it('Cancel btn calls onClose', () => {
    const onClose = vi.fn()
    renderModal(makeNote('Ceasefire'), { onClose })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows error message when onPlay rejects with server error', async () => {
    const onPlay = vi.fn().mockRejectedValue(new Error('Server error'))
    renderModal(makeNote('Ceasefire'), { onPlay })
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('Black Market Forgery renders fragment picker; not player picker or planet picker', () => {
    renderModal(makeNote('Black Market Forgery'))
    expect(screen.getByText(/choose 2 relic fragments/i)).toBeInTheDocument()
    expect(screen.getAllByText('cultural')).toHaveLength(2)
    expect(screen.getByText('hazardous')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.queryByText('Jord')).not.toBeInTheDocument()
  })

  it('clicking PLAY with 0 fragments selected shows error and does not call onPlay', async () => {
    const onPlay = vi.fn()
    renderModal(makeNote('Black Market Forgery'), { onPlay })
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(screen.getByText('Select exactly 2 fragments')).toBeInTheDocument()
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('clicking PLAY with 2 different-type fragments shows type mismatch error', async () => {
    const onPlay = vi.fn()
    renderModal(makeNote('Black Market Forgery'), { onPlay })
    fireEvent.click(screen.getAllByText('cultural')[0])
    fireEvent.click(screen.getByText('hazardous'))
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(screen.getByText('Both fragments must be the same type')).toBeInTheDocument()
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('clicking PLAY with 2 same-type fragments calls onPlay with fragment_ids', async () => {
    const onPlay = vi.fn().mockResolvedValue(undefined)
    renderModal(makeNote('Black Market Forgery'), { onPlay })
    const culturalButtons = screen.getAllByText('cultural')
    fireEvent.click(culturalButtons[0])
    fireEvent.click(culturalButtons[1])
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    await waitFor(() => {
      expect(onPlay).toHaveBeenCalledWith('note-1', { fragment_ids: ['frag-1', 'frag-2'] })
    })
  })

  it('selecting a 3rd fragment beyond 2 is a no-op', () => {
    renderModal(makeNote('Black Market Forgery'))
    const culturalButtons = screen.getAllByText('cultural')
    fireEvent.click(culturalButtons[0])
    fireEvent.click(culturalButtons[1])
    // Try to add hazardous (3rd) — should not affect the selection
    fireEvent.click(screen.getByText('hazardous'))
    // hazardous button should still appear as unselected (btn-ghost)
    expect(screen.getByText('hazardous').className).toContain('btn-ghost')
  })
})
