import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LeaderCard from '../../../src/components/game/LeaderCard.jsx'

const BASE_MECH = {
  name: 'Rin, The Master\'s Bloodline',
  cost: 2,
  combat: '6',
  ability_text: 'SUSTAIN DAMAGE',
}

describe('LeaderCard — mech', () => {
  it('passive mech (no effects, no deploy_trigger) renders no buttons', () => {
    render(<LeaderCard leader={BASE_MECH} status="unlocked" isMech={true} />)
    expect(screen.queryByText('DEPLOY')).toBeNull()
    expect(screen.queryByText('USE ABILITY')).toBeNull()
  })

  it('mech with deploy_trigger renders DEPLOY button that calls onDeploy', () => {
    const onDeploy = vi.fn()
    render(
      <LeaderCard
        leader={{ ...BASE_MECH, deploy_trigger: 'ground_combat_start' }}
        status="unlocked"
        isMech={true}
        onDeploy={onDeploy}
      />
    )
    const btn = screen.getByText('DEPLOY')
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(onDeploy).toHaveBeenCalledOnce()
  })

  it('mech with effects renders USE ABILITY button that calls onUseMechAbility', () => {
    const onUseMechAbility = vi.fn()
    render(
      <LeaderCard
        leader={{ ...BASE_MECH, effects: [{ op: 'draw', type: 'action_card' }] }}
        status="unlocked"
        isMech={true}
        onUseMechAbility={onUseMechAbility}
      />
    )
    const btn = screen.getByText('USE ABILITY')
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(onUseMechAbility).toHaveBeenCalledOnce()
  })

  it('mech with both deploy_trigger and effects renders both buttons', () => {
    render(
      <LeaderCard
        leader={{ ...BASE_MECH, deploy_trigger: 'ground_combat_start', effects: [{ op: 'draw' }] }}
        status="unlocked"
        isMech={true}
        onDeploy={vi.fn()}
        onUseMechAbility={vi.fn()}
      />
    )
    expect(screen.getByText('DEPLOY')).toBeTruthy()
    expect(screen.getByText('USE ABILITY')).toBeTruthy()
  })

  it('renders ability_text and unit stats (COST, COMBAT)', () => {
    render(<LeaderCard leader={BASE_MECH} status="unlocked" isMech={true} />)
    expect(screen.getByText('SUSTAIN DAMAGE')).toBeTruthy()
    expect(screen.getByText(/COST 2/)).toBeTruthy()
    expect(screen.getByText(/COMBAT 6/)).toBeTruthy()
  })
})
