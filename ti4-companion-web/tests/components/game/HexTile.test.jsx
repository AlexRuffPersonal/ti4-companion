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

  it('renders space-unit-icon-carrier when carrier present in space', () => {
    const { container } = renderTile({
      units: [{ player_id: 'p1', unit_type: 'carrier', count: 2, on_planet: null }],
    })
    const icon = container.querySelector('[data-testid="space-unit-icon-carrier"]')
    expect(icon).toBeTruthy()
  })

  it('renders space-unit-icon-fighter for fighters in space', () => {
    const { container } = renderTile({
      units: [{ player_id: 'p1', unit_type: 'fighter', count: 3, on_planet: null }],
    })
    const icon = container.querySelector('[data-testid="space-unit-icon-fighter"]')
    expect(icon).toBeTruthy()
  })

  it('renders ground-unit-icon-infantry-{planetName} for infantry on that planet', () => {
    const { container } = renderTile({
      units: [{ player_id: 'p1', unit_type: 'infantry', count: 3, on_planet: 'Wellon' }],
    })
    const icon = container.querySelector('[data-testid="ground-unit-icon-infantry-Wellon"]')
    expect(icon).toBeTruthy()
  })

  it('renders ground-unit-icon-mech-{planetName} for mech on that planet when pokEnabled', () => {
    const { container } = renderTile({
      pokEnabled: true,
      units: [{ player_id: 'p1', unit_type: 'mech', count: 1, on_planet: 'Wellon' }],
    })
    const icon = container.querySelector('[data-testid="ground-unit-icon-mech-Wellon"]')
    expect(icon).toBeTruthy()
  })

  it('does NOT render mech ground icon when pokEnabled=false', () => {
    const { container } = renderTile({
      pokEnabled: false,
      units: [{ player_id: 'p1', unit_type: 'mech', count: 1, on_planet: 'Wellon' }],
    })
    const icon = container.querySelector('[data-testid="ground-unit-icon-mech-Wellon"]')
    expect(icon).toBeNull()
  })

  it('does NOT render space unit row when no space units', () => {
    const { container } = renderTile({ units: [] })
    const icon = container.querySelector('[data-testid^="space-unit-icon-"]')
    expect(icon).toBeNull()
  })

  it('does NOT render ground box when no ground units', () => {
    const { container } = renderTile({ units: [] })
    const icon = container.querySelector('[data-testid^="ground-unit-icon-"]')
    expect(icon).toBeNull()
  })

  it('old text badge (4I, 2I 1M) no longer present', () => {
    renderTile({
      units: [
        { player_id: 'p1', unit_type: 'infantry', count: 4, on_planet: 'Wellon' },
        { player_id: 'p1', unit_type: 'mech', count: 1, on_planet: 'Wellon' },
      ],
    })
    expect(screen.queryByText('4I')).toBeNull()
    expect(screen.queryByText(/2I 1M/)).toBeNull()
  })

  it('multiple planets get separate ground boxes with different data-testid planetNames', () => {
    const { container } = renderTile({
      units: [
        { player_id: 'p1', unit_type: 'infantry', count: 2, on_planet: 'Wellon' },
        { player_id: 'p1', unit_type: 'infantry', count: 1, on_planet: 'Vefut II' },
      ],
    })
    expect(container.querySelector('[data-testid="ground-unit-icon-infantry-Wellon"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="ground-unit-icon-infantry-Vefut II"]')).toBeTruthy()
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
