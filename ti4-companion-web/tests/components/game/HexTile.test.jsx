import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HexTile from '../../../src/components/game/HexTile.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', colour: '#22c55e' },
  { id: 'p2', display_name: 'Bob', colour: '#ef4444' },
]

const PLANETS = [
  { name: 'Wellon' },
  { name: 'Vefut II' },
]

function renderTile(overrides = {}) {
  const props = {
    systemKey: '1,-1',
    tileNumber: '32',
    planets: PLANETS,
    activations: [],
    units: [],
    planetOwnership: new Map(),
    players: PLAYERS,
    onSelect: vi.fn(),
    size: 60,
    ...overrides,
  }
  return render(
    <svg>
      <HexTile {...props} />
    </svg>
  )
}

describe('HexTile', () => {
  it('renders tile number', () => {
    renderTile()
    expect(screen.getByText('32')).toBeInTheDocument()
  })

  it('renders planet names', () => {
    renderTile()
    expect(screen.getByText('Wellon')).toBeInTheDocument()
    expect(screen.getByText('Vefut II')).toBeInTheDocument()
  })

  it('renders ground-force badge with infantry count', () => {
    renderTile({
      units: [
        { player_id: 'p1', unit_type: 'infantry', count: 3, on_planet: 'Wellon' },
        { player_id: 'p1', unit_type: 'infantry', count: 1, on_planet: 'Vefut II' },
      ],
    })
    expect(screen.getByText('4I')).toBeInTheDocument()
  })

  it('renders combined infantry and mech badge when pokEnabled', () => {
    renderTile({
      pokEnabled: true,
      units: [
        { player_id: 'p1', unit_type: 'infantry', count: 2, on_planet: 'Wellon' },
        { player_id: 'p1', unit_type: 'mech', count: 1, on_planet: 'Wellon' },
      ],
    })
    expect(screen.getByText('2I 1M')).toBeInTheDocument()
  })

  it('omits mech from badge when pokEnabled is false', () => {
    renderTile({
      pokEnabled: false,
      units: [
        { player_id: 'p1', unit_type: 'mech', count: 1, on_planet: 'Wellon' },
      ],
    })
    expect(screen.queryByText('1M')).not.toBeInTheDocument()
  })

  it('does not render unit badge when no ground forces', () => {
    renderTile({ units: [] })
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('calls onMouseEnter with systemKey on mouse enter', () => {
    const onMouseEnter = vi.fn()
    const { container } = renderTile({ onMouseEnter })
    fireEvent.mouseEnter(container.querySelector('g'))
    expect(onMouseEnter).toHaveBeenCalledWith('1,-1')
  })

  it('calls onMouseLeave on mouse leave', () => {
    const onMouseLeave = vi.fn()
    const { container } = renderTile({ onMouseLeave })
    fireEvent.mouseLeave(container.querySelector('g'))
    expect(onMouseLeave).toHaveBeenCalled()
  })

  it('renders one tactic token circle per activation', () => {
    const { container } = renderTile({
      activations: [
        { id: 'a1', player_id: 'p1' },
        { id: 'a2', player_id: 'p2' },
      ],
    })
    // Tactic token circles are rendered as <circle> with player fill colour
    const circles = container.querySelectorAll('circle[fill="#22c55e"], circle[fill="#ef4444"]')
    expect(circles.length).toBe(2)
  })

  it('calls onSelect with systemKey on click', () => {
    const onSelect = vi.fn()
    const { container } = renderTile({ onSelect })
    fireEvent.click(container.querySelector('g'))
    expect(onSelect).toHaveBeenCalledWith('1,-1')
  })
})