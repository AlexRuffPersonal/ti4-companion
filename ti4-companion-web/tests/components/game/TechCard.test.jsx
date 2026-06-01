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

// An exhaustable tech name from EXHAUSTABLE_TECHS
const EXHAUSTABLE_NAME = 'Graviton Laser System'
// An action tech name from ACTION_TECHS
const ACTION_NAME = 'Sling Relay'
// A regular tech (not exhaustable, not action)
const REGULAR_NAME = 'Neural Motivator'

function renderCardPhase30(techOverrides = {}, propOverrides = {}) {
  const tech = {
    id: 't1',
    name: REGULAR_NAME,
    text: 'Draw 2 Action Cards.',
    status: 'held',
    prerequisites: {},
    missingPrereqs: [],
    ...techOverrides,
  }
  return render(
    <TechCard
      tech={tech}
      isOwnTree={true}
      isSelected={false}
      onSelect={vi.fn()}
      onConfirm={vi.fn()}
      isExhausted={false}
      onExhaust={vi.fn()}
      onReady={vi.fn()}
      onUseAction={vi.fn()}
      {...propOverrides}
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

describe('TechCard — phase 30 exhausted state', () => {
  it('isExhausted=true → container has opacity-50 and rotate-6 classes', () => {
    renderCardPhase30({}, { isExhausted: true })
    const card = screen.getByTestId('tech-card')
    expect(card.className).toContain('opacity-50')
    expect(card.className).toContain('rotate-6')
  })

  it('isExhausted=false → container does not have opacity-50 or rotate-6 classes', () => {
    renderCardPhase30({}, { isExhausted: false })
    const card = screen.getByTestId('tech-card')
    expect(card.className).not.toContain('opacity-50')
    expect(card.className).not.toContain('rotate-6')
  })
})

describe('TechCard — phase 30 Exhaust / Ready buttons', () => {
  it('exhaustable tech + isExhausted=false → Exhaust button present, Ready absent', () => {
    renderCardPhase30({ name: EXHAUSTABLE_NAME }, { isExhausted: false })
    expect(screen.getByText('Exhaust')).toBeInTheDocument()
    expect(screen.queryByText('Ready')).not.toBeInTheDocument()
  })

  it('exhaustable tech + isExhausted=true → Ready button present, Exhaust absent', () => {
    renderCardPhase30({ name: EXHAUSTABLE_NAME }, { isExhausted: true })
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.queryByText('Exhaust')).not.toBeInTheDocument()
  })

  it('Exhaust button calls onExhaust', () => {
    const onExhaust = vi.fn()
    renderCardPhase30({ name: EXHAUSTABLE_NAME }, { isExhausted: false, onExhaust })
    fireEvent.click(screen.getByText('Exhaust'))
    expect(onExhaust).toHaveBeenCalled()
  })

  it('Ready button calls onReady', () => {
    const onReady = vi.fn()
    renderCardPhase30({ name: EXHAUSTABLE_NAME }, { isExhausted: true, onReady })
    fireEvent.click(screen.getByText('Ready'))
    expect(onReady).toHaveBeenCalled()
  })
})

describe('TechCard — phase 30 Use button', () => {
  it('action tech + isExhausted=false → Use button present', () => {
    renderCardPhase30({ name: ACTION_NAME }, { isExhausted: false })
    expect(screen.getByText('Use')).toBeInTheDocument()
  })

  it('action tech + isExhausted=true → Use button absent', () => {
    renderCardPhase30({ name: ACTION_NAME }, { isExhausted: true })
    expect(screen.queryByText('Use')).not.toBeInTheDocument()
  })

  it('Use button calls onUseAction with tech name', () => {
    const onUseAction = vi.fn()
    renderCardPhase30({ name: ACTION_NAME }, { isExhausted: false, onUseAction })
    fireEvent.click(screen.getByText('Use'))
    expect(onUseAction).toHaveBeenCalledWith(ACTION_NAME)
  })
})

describe('TechCard — phase 30 non-exhaustable non-action tech', () => {
  it('regular tech → no Exhaust/Ready/Use buttons', () => {
    renderCardPhase30({ name: REGULAR_NAME }, { isExhausted: false })
    expect(screen.queryByText('Exhaust')).not.toBeInTheDocument()
    expect(screen.queryByText('Ready')).not.toBeInTheDocument()
    expect(screen.queryByText('Use')).not.toBeInTheDocument()
  })
})
