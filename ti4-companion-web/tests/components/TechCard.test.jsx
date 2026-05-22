import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TechCard from '../../src/components/game/TechCard.jsx'

const BASE_TECH = {
  id: 't1',
  name: 'Neural Motivator',
  technology_type: 'green',
  prerequisites: {},
  text: 'Draw 1 action card at the start of the action phase.',
  status: 'available',
  missingPrereqs: [],
  exhaustOptions: [],
}

describe('TechCard', () => {
  it('renders the tech name', () => {
    render(<TechCard tech={BASE_TECH} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByText('Neural Motivator')).toBeTruthy()
  })

  it('applies held styling when status is held', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'held' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('tech-card').className).toMatch(/border-success/)
  })

  it('applies available styling when status is available', () => {
    render(<TechCard tech={BASE_TECH} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('tech-card').className).toMatch(/border-plasma/)
  })

  it('applies exhaust styling when status is exhaust', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'exhaust' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('tech-card').className).toMatch(/border-warning/)
  })

  it('applies dim styling when status is unavailable', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'unavailable', missingPrereqs: [{ colour: 'green', count: 1 }] }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('tech-card').className).toMatch(/border-border/)
  })

  it('applies preview styling when status is preview', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'preview' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('tech-card').className).toMatch(/border-plasma/)
  })

  it('prereq-dot-filled testid no longer present (replaced by type icon)', () => {
    const tech = { ...BASE_TECH, prerequisites: { green: 1 }, status: 'held' }
    render(<TechCard tech={tech} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.queryByTestId('prereq-dot-filled')).toBeNull()
  })

  it('prereq-dot-empty testid no longer present (replaced by type icon)', () => {
    const tech = {
      ...BASE_TECH,
      status: 'unavailable',
      prerequisites: { green: 2 },
      missingPrereqs: [{ colour: 'green', count: 2 }],
    }
    render(<TechCard tech={tech} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.queryByTestId('prereq-dot-empty')).toBeNull()
  })

  it('shows missing prereq tooltip text when status is unavailable', () => {
    const tech = {
      ...BASE_TECH,
      status: 'unavailable',
      missingPrereqs: [{ colour: 'green', count: 1 }],
    }
    render(<TechCard tech={tech} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByText(/Missing: 1 green/i)).toBeTruthy()
  })

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn()
    render(<TechCard tech={BASE_TECH} isOwnTree={false} isSelected={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('tech-card'))
    expect(onSelect).toHaveBeenCalledWith('t1')
  })

  it('does not show confirm button when isOwnTree is false', () => {
    render(<TechCard tech={BASE_TECH} isOwnTree={false} isSelected={true} onSelect={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByText('RESEARCH')).toBeNull()
  })

  it('shows confirm button when isOwnTree is true and tech is selected and available', () => {
    render(<TechCard tech={BASE_TECH} isOwnTree={true} isSelected={true} onSelect={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('RESEARCH')).toBeTruthy()
  })

  it('does not show confirm button for held techs even when selected', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'held' }} isOwnTree={true} isSelected={true} onSelect={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByText('RESEARCH')).toBeNull()
  })
})
