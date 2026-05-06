import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TechCard from '../../../src/components/game/TechCard.jsx'

const BASE_TECH = {
  id: 't1',
  name: 'Neural Motivator',
  text: 'Draw 2 Action Cards at the start of the Status Phase.',
  status: 'held',
  prerequisites: {},
  missingPrereqs: [],
}

function renderCard(overrides = {}) {
  return render(
    <TechCard
      tech={{ ...BASE_TECH, ...overrides }}
      isOwnTree={true}
      isSelected={false}
      onSelect={vi.fn()}
      onConfirm={vi.fn()}
    />
  )
}

describe('TechCard', () => {
  it('renders chevron toggle when tech.text is non-empty', () => {
    renderCard()
    expect(screen.getByTestId('tech-text-toggle')).toBeInTheDocument()
  })

  it('does not render chevron toggle when tech.text is null', () => {
    renderCard({ text: null })
    expect(screen.queryByTestId('tech-text-toggle')).not.toBeInTheDocument()
  })

  it('does not render chevron toggle when tech.text is empty string', () => {
    renderCard({ text: '' })
    expect(screen.queryByTestId('tech-text-toggle')).not.toBeInTheDocument()
  })

  it('tech text hidden by default', () => {
    renderCard()
    expect(screen.queryByTestId('tech-text')).not.toBeInTheDocument()
  })

  it('clicking chevron reveals tech text', () => {
    renderCard()
    fireEvent.click(screen.getByTestId('tech-text-toggle'))
    expect(screen.getByTestId('tech-text')).toBeInTheDocument()
    expect(screen.getByTestId('tech-text').textContent).toBe(BASE_TECH.text)
  })

  it('clicking chevron again hides tech text', () => {
    renderCard()
    fireEvent.click(screen.getByTestId('tech-text-toggle'))
    fireEvent.click(screen.getByTestId('tech-text-toggle'))
    expect(screen.queryByTestId('tech-text')).not.toBeInTheDocument()
  })

  it('clicking chevron does not call onSelect', () => {
    const onSelect = vi.fn()
    render(
      <TechCard
        tech={BASE_TECH}
        isOwnTree={true}
        isSelected={false}
        onSelect={onSelect}
        onConfirm={vi.fn()}
      />
    )
    fireEvent.click(screen.getByTestId('tech-text-toggle'))
    expect(onSelect).not.toHaveBeenCalled()
  })
})
