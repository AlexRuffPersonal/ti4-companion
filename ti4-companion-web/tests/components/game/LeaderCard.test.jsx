import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeaderCard from '../../../src/components/game/LeaderCard.jsx'

const BASE_LEADER = {
  id: 'leader1',
  name: 'Test Leader',
  leader_type: 'hero',
  ability_text: 'Test ability',
}

function renderCard(leaderOverrides = {}, status = 'unlocked') {
  return render(
    <LeaderCard
      leader={{ ...BASE_LEADER, ...leaderOverrides }}
      status={status}
      onUseAbility={vi.fn()}
      onUnlock={vi.fn()}
    />
  )
}

describe('LeaderCard', () => {
  describe("'attached' status", () => {
    it("renders ATTACHED badge with text-gold class when status='attached'", () => {
      renderCard({}, 'attached')
      const badge = screen.getByText('ATTACHED')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveClass('text-gold')
    })

    it("does NOT have opacity-40 class when status='attached'", () => {
      const { container } = render(
        <LeaderCard
          leader={BASE_LEADER}
          status="attached"
          onUseAbility={vi.fn()}
          onUnlock={vi.fn()}
        />
      )
      const panelInset = container.querySelector('.panel-inset')
      expect(panelInset).not.toHaveClass('opacity-40')
    })

    it("does not render action button when status='attached'", () => {
      render(
        <LeaderCard
          leader={BASE_LEADER}
          status="attached"
          onUseAbility={vi.fn()}
          onUnlock={vi.fn()}
        />
      )
      expect(screen.queryByText('USE ABILITY')).not.toBeInTheDocument()
    })

    it("still renders opacity-40 when status='purged' (regression check)", () => {
      const { container } = render(
        <LeaderCard
          leader={BASE_LEADER}
          status="purged"
          onUseAbility={vi.fn()}
          onUnlock={vi.fn()}
        />
      )
      const panelInset = container.querySelector('.panel-inset')
      expect(panelInset).toHaveClass('opacity-40')
    })
  })
})
