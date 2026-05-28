import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeaderCard from '../../../src/components/game/LeaderCard.jsx'

const BASE_LEADER = {
  name: 'Suffi An',
  leader_type: 'agent',
  ability_text: 'ACTION: ...',
}

describe('LeaderCard — icon integration', () => {
  it('renders agent icon img (src="/icons/leaders/agent.svg") in typeBadge', () => {
    render(<LeaderCard leader={{ ...BASE_LEADER, leader_type: 'agent' }} status="unlocked" onUseAbility={vi.fn()} />)
    const img = screen.getByAltText('agent')
    expect(img.getAttribute('src')).toBe('/icons/leaders/agent.svg')
  })

  it('renders commander icon img (src="/icons/leaders/commander.svg") in typeBadge', () => {
    render(<LeaderCard leader={{ ...BASE_LEADER, leader_type: 'commander' }} status="locked" onUnlock={vi.fn()} />)
    const img = screen.getByAltText('commander')
    expect(img.getAttribute('src')).toBe('/icons/leaders/commander.svg')
  })

  it('renders hero icon img (src="/icons/leaders/hero.svg") in typeBadge', () => {
    render(<LeaderCard leader={{ ...BASE_LEADER, leader_type: 'hero' }} status="locked" onUnlock={vi.fn()} />)
    const img = screen.getByAltText('hero')
    expect(img.getAttribute('src')).toBe('/icons/leaders/hero.svg')
  })

  it('type label text still visible alongside icon', () => {
    render(<LeaderCard leader={BASE_LEADER} status="unlocked" onUseAbility={vi.fn()} />)
    expect(screen.getByText('agent')).toBeTruthy()
  })

  it('status chip still renders (UNLOCKED)', () => {
    render(<LeaderCard leader={BASE_LEADER} status="unlocked" onUseAbility={vi.fn()} />)
    expect(screen.getByText('UNLOCKED')).toBeTruthy()
  })

  it('action button still renders', () => {
    render(<LeaderCard leader={BASE_LEADER} status="unlocked" onUseAbility={vi.fn()} />)
    expect(screen.getByText('USE ABILITY')).toBeTruthy()
  })

  it('isMech=true path renders no type badge', () => {
    const mech = { name: 'Rin', cost: 2, combat: '6' }
    render(<LeaderCard leader={mech} status="unlocked" isMech={true} />)
    expect(screen.queryByAltText('agent')).toBeNull()
    expect(screen.queryByAltText('commander')).toBeNull()
    expect(screen.queryByAltText('hero')).toBeNull()
  })
})
