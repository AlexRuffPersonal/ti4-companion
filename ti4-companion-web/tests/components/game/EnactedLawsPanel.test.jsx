// tests/components/game/EnactedLawsPanel.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EnactedLawsPanel from '../../../src/components/game/EnactedLawsPanel.jsx'

const LAWS = [
  { id: 'l1', agenda_id: 'ag-1', elected_target: 'p1', is_repealed: false, host_applies_manually: false,
    agendas: { name: 'Shard of the Throne' } },
  { id: 'l2', agenda_id: 'ag-2', elected_target: null, is_repealed: true, host_applies_manually: false,
    agendas: { name: 'Political Censure' } },
  { id: 'l3', agenda_id: 'ag-3', elected_target: 'Mecatol Rex', is_repealed: false, host_applies_manually: true,
    agendas: { name: 'Publicize Weapon Schematics' } },
]

describe('EnactedLawsPanel', () => {
  it('renders nothing when laws is empty', () => {
    const { container } = render(<EnactedLawsPanel laws={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('starts collapsed', () => {
    render(<EnactedLawsPanel laws={LAWS} />)
    expect(screen.queryByText('Shard of the Throne')).not.toBeInTheDocument()
  })

  it('expands on click', () => {
    render(<EnactedLawsPanel laws={LAWS} />)
    fireEvent.click(screen.getByText(/enacted laws/i))
    expect(screen.getByText('Shard of the Throne')).toBeInTheDocument()
  })

  it('shows active law count in header', () => {
    render(<EnactedLawsPanel laws={LAWS} />)
    // 2 non-repealed laws
    expect(screen.getByText(/2/)).toBeInTheDocument()
  })

  it('shows repealed law struck-through', () => {
    render(<EnactedLawsPanel laws={LAWS} />)
    fireEvent.click(screen.getByText(/enacted laws/i))
    const repealedEl = screen.getByText('Political Censure')
    expect(repealedEl.className).toMatch(/line-through/)
  })

  it('shows manual reminder for host_applies_manually laws', () => {
    render(<EnactedLawsPanel laws={LAWS} />)
    fireEvent.click(screen.getByText(/enacted laws/i))
    expect(screen.getByText(/manual/i)).toBeInTheDocument()
  })
})
