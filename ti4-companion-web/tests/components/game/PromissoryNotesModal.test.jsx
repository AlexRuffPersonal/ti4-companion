import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PromissoryNotesModal from '../../../src/components/game/PromissoryNotesModal.jsx'

const PLAYERS = [{ id: 'p1', display_name: 'Alice' }]
const MY_PLANETS = [{ planet_name: 'Ang' }, { planet_name: 'Elysium' }]

const REGULAR_NOTE = {
  id: 'note-1',
  state: 'held',
  origin_player_id: 'p1',
  promissory_notes: { name: 'Political Secret', text: 'Some text', purge_on_use: true, into_play_area: false },
}
const TERRAFORM_NOTE = {
  id: 'note-terraform',
  state: 'held',
  origin_player_id: 'p1',
  promissory_notes: { name: 'Terraform', text: 'ACTION: Attach...', purge_on_use: false, into_play_area: true },
}
const BMF_NOTE = {
  id: 'note-bmf',
  state: 'held',
  origin_player_id: 'p1',
  promissory_notes: { name: 'Black Market Forgery', text: 'ACTION: Purge 2...', purge_on_use: true, into_play_area: false },
}

describe('PromissoryNotesModal', () => {
  it('calls onPlay directly for non-Terraform notes', () => {
    const onPlay = vi.fn()
    render(
      <PromissoryNotesModal
        notes={[REGULAR_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        myRelicFragments={[]}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={onPlay}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('PLAY'))
    expect(onPlay).toHaveBeenCalledWith('note-1')
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('does not auto-open sub-modal for Terraform note before PLAY is clicked', () => {
    render(
      <PromissoryNotesModal
        notes={[TERRAFORM_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        myRelicFragments={[]}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={vi.fn()}
        onClose={vi.fn()}
      />
    )
    // Planet list (sub-modal) must not be visible until PLAY is clicked
    expect(screen.queryByText('Ang')).not.toBeInTheDocument()
    expect(screen.queryByText('Elysium')).not.toBeInTheDocument()
  })

  it('opens PlayPromissoryNoteModal when Terraform PLAY is clicked', () => {
    render(
      <PromissoryNotesModal
        notes={[TERRAFORM_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        myRelicFragments={[]}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={vi.fn()}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('PLAY'))
    expect(screen.getByText('Terraform')).toBeInTheDocument()
    expect(screen.getByText('Ang')).toBeInTheDocument()
  })

  it('calls onPlay(noteId, options) after planet selection and PLAY in sub-modal', () => {
    const onPlay = vi.fn()
    render(
      <PromissoryNotesModal
        notes={[TERRAFORM_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        myRelicFragments={[]}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={onPlay}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('PLAY'))
    fireEvent.click(screen.getByText('Ang'))
    const playButtons = screen.getAllByText('PLAY')
    fireEvent.click(playButtons[playButtons.length - 1])
    expect(onPlay).toHaveBeenCalledWith('note-terraform', { planet_name: 'Ang' })
  })

  it('closes sub-modal on CANCEL without calling onPlay', () => {
    const onPlay = vi.fn()
    render(
      <PromissoryNotesModal
        notes={[TERRAFORM_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        myRelicFragments={[]}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={onPlay}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('PLAY'))
    fireEvent.click(screen.getByText('CANCEL'))
    expect(onPlay).not.toHaveBeenCalled()
    expect(screen.queryByText('Ang')).not.toBeInTheDocument()
  })

  it('opens PlayPromissoryNoteModal when Black Market Forgery PLAY is clicked', () => {
    render(
      <PromissoryNotesModal
        notes={[BMF_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        myRelicFragments={[{ id: 'frag-1', relic_fragment_type: 'cultural' }]}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={vi.fn()}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('PLAY'))
    expect(screen.getByText('Black Market Forgery')).toBeInTheDocument()
    expect(screen.getByText(/choose 2 relic fragments/i)).toBeInTheDocument()
  })

  it('calls onPlay(noteId, { fragment_ids }) when PlayPromissoryNoteModal returns fragment_ids', async () => {
    const onPlay = vi.fn().mockResolvedValue(undefined)
    const frags = [
      { id: 'frag-1', relic_fragment_type: 'cultural' },
      { id: 'frag-2', relic_fragment_type: 'cultural' },
    ]
    render(
      <PromissoryNotesModal
        notes={[BMF_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        myRelicFragments={frags}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={onPlay}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('PLAY'))
    const culturalButtons = screen.getAllByText('cultural')
    fireEvent.click(culturalButtons[0])
    fireEvent.click(culturalButtons[1])
    const playButtons = screen.getAllByText('PLAY')
    fireEvent.click(playButtons[playButtons.length - 1])
    await waitFor(() => {
      expect(onPlay).toHaveBeenCalledWith('note-bmf', { fragment_ids: ['frag-1', 'frag-2'] })
    })
  })
})
