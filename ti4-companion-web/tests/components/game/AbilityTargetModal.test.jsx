import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AbilityTargetModal from '../../../src/components/game/AbilityTargetModal.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]

const PLANETS = [
  { planet_name: 'Jord' },
  { planet_name: 'Nestphar' },
]

function makeAbility(effects) {
  return { id: 'ab-1', ability_name: 'Test Ability', effects }
}

describe('AbilityTargetModal', () => {
  it('renders ability name', () => {
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'gain_trade_goods', amount: 1 }])}
        sourceId={null} sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={vi.fn()} onClose={vi.fn()}
      />
    )
    expect(screen.getByText(/test ability/i)).toBeInTheDocument()
  })

  it('shows player picker when an effect has chosen_player target', () => {
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'exhaust_planets', target: 'chosen_player' }])}
        sourceId={null} sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={vi.fn()} onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows amount input when an effect uses chosen_amount', () => {
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'spend_trade_goods', amount: 'chosen_amount' }])}
        sourceId={null} sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={vi.fn()} onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('shows choose_one options when effect is choose_one', () => {
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'choose_one', options: [{ op: 'gain_vp', amount: 1 }, { op: 'gain_trade_goods', amount: 2 }] }])}
        sourceId={null} sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={vi.fn()} onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /gain vp/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /gain trade goods/i })).toBeInTheDocument()
  })

  it('calls onConfirm with selections when CONFIRM is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'gain_trade_goods', amount: 1 }])}
        sourceId="src-uuid" sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={onConfirm} onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      ability_definition_id: 'ab-1',
      source_type: 'faction_ability',
      source_id: 'src-uuid',
    }))
  })

  it('calls onClose when CANCEL is clicked', () => {
    const onClose = vi.fn()
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'gain_trade_goods', amount: 1 }])}
        sourceId={null} sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={vi.fn()} onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
