import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LegendaryCardPanel from '../../../src/components/game/LegendaryCardPanel'

describe('LegendaryCardPanel', () => {
  it('renders nothing when myCards is empty', () => {
    const { container } = render(<LegendaryCardPanel myCards={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders card name and ability text for each card', () => {
    const myCards = [
      { planet_name: 'primor', status: 'readied' },
      { planet_name: 'mirage', status: 'exhausted' },
    ]
    render(<LegendaryCardPanel myCards={myCards} />)
    expect(screen.getByText('The Atrament')).toBeInTheDocument()
    expect(screen.getByText('Exhaust at end of your turn: place up to 2 infantry from reinforcements on any planet you control.')).toBeInTheDocument()
    expect(screen.getByText('Mirage Flight Academy')).toBeInTheDocument()
    expect(screen.getByText('Exhaust at end of your turn: place up to 2 fighters in any system containing your ships.')).toBeInTheDocument()
  })

  it('shows readied badge when status=readied', () => {
    const myCards = [{ planet_name: 'mallice', status: 'readied' }]
    render(<LegendaryCardPanel myCards={myCards} />)
    expect(screen.getByText('Readied')).toBeInTheDocument()
  })

  it('shows exhausted badge when status=exhausted', () => {
    const myCards = [{ planet_name: 'hopes_end', status: 'exhausted' }]
    render(<LegendaryCardPanel myCards={myCards} />)
    expect(screen.getByText('Exhausted')).toBeInTheDocument()
  })
})
