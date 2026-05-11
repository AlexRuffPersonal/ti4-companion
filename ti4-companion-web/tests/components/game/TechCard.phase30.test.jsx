import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TechCard from '../../../src/components/game/TechCard.jsx'

// An exhaustable tech name from EXHAUSTABLE_TECHS
const EXHAUSTABLE_NAME = 'Graviton Laser System'
// An action tech name from ACTION_TECHS
const ACTION_NAME = 'Sling Relay'
// A tech that is both exhaustable and an action
const EXHAUSTABLE_ACTION_NAME = 'Vortex'
// A regular tech (not exhaustable, not action)
const REGULAR_NAME = 'Neural Motivator'

function renderCard(techOverrides = {}, propOverrides = {}) {
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

describe('TechCard Phase 30 exhausted state', () => {
  it('isExhausted=true → container has opacity-50 and rotate-6 classes', () => {
    renderCard({}, { isExhausted: true })
    const card = screen.getByTestId('tech-card')
    expect(card.className).toContain('opacity-50')
    expect(card.className).toContain('rotate-6')
  })

  it('isExhausted=false → container does not have opacity-50 or rotate-6 classes', () => {
    renderCard({}, { isExhausted: false })
    const card = screen.getByTestId('tech-card')
    expect(card.className).not.toContain('opacity-50')
    expect(card.className).not.toContain('rotate-6')
  })
})

describe('TechCard Phase 30 Exhaust / Ready buttons', () => {
  it('exhaustable tech + isExhausted=false → Exhaust button present, Ready absent', () => {
    renderCard({ name: EXHAUSTABLE_NAME }, { isExhausted: false })
    expect(screen.getByText('Exhaust')).toBeInTheDocument()
    expect(screen.queryByText('Ready')).not.toBeInTheDocument()
  })

  it('exhaustable tech + isExhausted=true → Ready button present, Exhaust absent', () => {
    renderCard({ name: EXHAUSTABLE_NAME }, { isExhausted: true })
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.queryByText('Exhaust')).not.toBeInTheDocument()
  })

  it('Exhaust button calls onExhaust', () => {
    const onExhaust = vi.fn()
    renderCard({ name: EXHAUSTABLE_NAME }, { isExhausted: false, onExhaust })
    fireEvent.click(screen.getByText('Exhaust'))
    expect(onExhaust).toHaveBeenCalled()
  })

  it('Ready button calls onReady', () => {
    const onReady = vi.fn()
    renderCard({ name: EXHAUSTABLE_NAME }, { isExhausted: true, onReady })
    fireEvent.click(screen.getByText('Ready'))
    expect(onReady).toHaveBeenCalled()
  })
})

describe('TechCard Phase 30 Use button', () => {
  it('action tech + isExhausted=false → Use button present', () => {
    renderCard({ name: ACTION_NAME }, { isExhausted: false })
    expect(screen.getByText('Use')).toBeInTheDocument()
  })

  it('action tech + isExhausted=true → Use button absent', () => {
    renderCard({ name: ACTION_NAME }, { isExhausted: true })
    expect(screen.queryByText('Use')).not.toBeInTheDocument()
  })

  it('Use button calls onUseAction with tech name', () => {
    const onUseAction = vi.fn()
    renderCard({ name: ACTION_NAME }, { isExhausted: false, onUseAction })
    fireEvent.click(screen.getByText('Use'))
    expect(onUseAction).toHaveBeenCalledWith(ACTION_NAME)
  })
})

describe('TechCard Phase 30 non-exhaustable non-action tech', () => {
  it('regular tech → no Exhaust/Ready/Use buttons', () => {
    renderCard({ name: REGULAR_NAME }, { isExhausted: false })
    expect(screen.queryByText('Exhaust')).not.toBeInTheDocument()
    expect(screen.queryByText('Ready')).not.toBeInTheDocument()
    expect(screen.queryByText('Use')).not.toBeInTheDocument()
  })
})
