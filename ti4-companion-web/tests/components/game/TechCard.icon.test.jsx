import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TechCard from '../../../src/components/game/TechCard.jsx'

const BASE_TECH = {
  id: 't1',
  name: 'Neural Motivator',
  technology_type: 'green',
  prerequisites: {},
  status: 'available',
  missingPrereqs: [],
}

describe('TechCard — icon integration', () => {
  it('renders type icon img with src="/icons/tech/biotic.svg" for technology_type="green"', () => {
    render(<TechCard tech={{ ...BASE_TECH, technology_type: 'green' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('/icons/tech/biotic.svg')
  })

  it('renders type icon img with src="/icons/tech/propulsion.svg" for technology_type="blue"', () => {
    render(<TechCard tech={{ ...BASE_TECH, technology_type: 'blue' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('/icons/tech/propulsion.svg')
  })

  it('renders type icon img with src="/icons/tech/cybernetic.svg" for technology_type="yellow"', () => {
    render(<TechCard tech={{ ...BASE_TECH, technology_type: 'yellow' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('/icons/tech/cybernetic.svg')
  })

  it('renders type icon img with src="/icons/tech/warfare.svg" for technology_type="red"', () => {
    render(<TechCard tech={{ ...BASE_TECH, technology_type: 'red' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('/icons/tech/warfare.svg')
  })

  it('renders no type icon for technology_type="unit_upgrade"', () => {
    render(<TechCard tech={{ ...BASE_TECH, technology_type: 'unit_upgrade' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByTestId('tech-type-icon-row')).toBeNull()
  })

  it('still shows missing prereq text for unavailable techs', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'unavailable', missingPrereqs: [{ colour: 'green', count: 1 }] }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByText(/Missing: 1 green/i)).toBeTruthy()
  })

  it('prereq-dot-filled and prereq-dot-empty testids no longer present', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'held', prerequisites: { green: 1 } }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.queryByTestId('prereq-dot-filled')).toBeNull()
    expect(screen.queryByTestId('prereq-dot-empty')).toBeNull()
  })
})
