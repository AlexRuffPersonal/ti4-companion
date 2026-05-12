import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InPlayNotesPanel from '../../../src/components/game/InPlayNotesPanel.jsx'

const PLAYERS = [
  { id: 'p1', faction: 'Jol-Nar', color: 'Blue' },
  { id: 'p2', faction: 'Hacan', color: 'Gold' },
  { id: 'p3', faction: 'Creuss', color: 'White' },
]

const IN_PLAY_NOTES = [
  { id: 'n1', name: 'Support for the Throne', held_by_player_id: 'p2', origin_player_id: 'p1' },
  { id: 'n2', name: 'Political Secret', held_by_player_id: 'p3', origin_player_id: 'p1' },
]

function renderPanel(inPlayNotes, overrides = {}) {
  return render(
    <InPlayNotesPanel
      inPlayNotes={inPlayNotes}
      players={PLAYERS}
      {...overrides}
    />
  )
}

describe('InPlayNotesPanel', () => {
  it('renders null when inPlayNotes=[]', () => {
    const { container } = renderPanel([])
    expect(container.firstChild).toBeNull()
  })

  it('renders note name for each in-play note', () => {
    renderPanel(IN_PLAY_NOTES)
    expect(screen.getByText('Support for the Throne')).toBeInTheDocument()
    expect(screen.getByText('Political Secret')).toBeInTheDocument()
  })

  it('renders holder faction/color', () => {
    renderPanel(IN_PLAY_NOTES)
    expect(screen.getByText(/Hacan\/Gold/)).toBeInTheDocument()
  })

  it('renders owner faction/color', () => {
    renderPanel(IN_PLAY_NOTES)
    const ownerMatches = screen.getAllByText(/Jol-Nar\/Blue/)
    expect(ownerMatches.length).toBeGreaterThan(0)
  })

  it('multiple notes all rendered', () => {
    renderPanel(IN_PLAY_NOTES)
    expect(screen.getByText('Support for the Throne')).toBeInTheDocument()
    expect(screen.getByText('Political Secret')).toBeInTheDocument()
    expect(screen.getByText(/Creuss\/White/)).toBeInTheDocument()
  })
})
