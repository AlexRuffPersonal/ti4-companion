import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DraftTileHand from '../../../src/components/game/DraftTileHand.jsx'

const TILE_BY_NUMBER = {
  '32': { tile_number: '32', planets: [{ resources: 2, influence: 1 }, { resources: 0, influence: 2 }], wormhole: null, anomaly: false, type: 'blue' },
  '41': { tile_number: '41', planets: [], wormhole: 'alpha', anomaly: false, type: 'blue' },
  '45': { tile_number: '45', planets: [], wormhole: null, anomaly: true, type: 'anomaly' },
}

describe('DraftTileHand', () => {
  it('renders each tile number', () => {
    render(<DraftTileHand tiles={['32', '41']} tileByNumber={TILE_BY_NUMBER} isMyTurn={true} selectedTile={null} onSelect={vi.fn()} />)
    expect(screen.getByText('32')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
  })

  it('shows R/I totals for planet tiles', () => {
    render(<DraftTileHand tiles={['32']} tileByNumber={TILE_BY_NUMBER} isMyTurn={true} selectedTile={null} onSelect={vi.fn()} />)
    // 2+0=2 resources, 1+2=3 influence
    expect(screen.getByText('2R / 3I')).toBeInTheDocument()
  })

  it('shows anomaly label for anomaly tiles', () => {
    render(<DraftTileHand tiles={['45']} tileByNumber={TILE_BY_NUMBER} isMyTurn={true} selectedTile={null} onSelect={vi.fn()} />)
    expect(screen.getByText('anomaly')).toBeInTheDocument()
  })

  it('shows wormhole indicator when tile.wormhole set', () => {
    render(<DraftTileHand tiles={['41']} tileByNumber={TILE_BY_NUMBER} isMyTurn={true} selectedTile={null} onSelect={vi.fn()} />)
    expect(screen.getByText('alpha')).toBeInTheDocument()
  })

  it('chip disabled when isMyTurn=false', () => {
    render(<DraftTileHand tiles={['32']} tileByNumber={TILE_BY_NUMBER} isMyTurn={false} selectedTile={null} onSelect={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /32/ })
    expect(btn.className).toContain('pointer-events-none')
    expect(btn.className).toContain('opacity-50')
  })

  it('clicking chip when isMyTurn=true calls onSelect with tileNumber', () => {
    const onSelect = vi.fn()
    render(<DraftTileHand tiles={['32']} tileByNumber={TILE_BY_NUMBER} isMyTurn={true} selectedTile={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /32/ }))
    expect(onSelect).toHaveBeenCalledWith('32')
  })

  it('selected tile has different visual class than unselected', () => {
    const { rerender } = render(
      <DraftTileHand tiles={['32', '41']} tileByNumber={TILE_BY_NUMBER} isMyTurn={true} selectedTile={null} onSelect={vi.fn()} />
    )
    const btn32 = screen.getByRole('button', { name: /32/ })
    expect(btn32.className).not.toContain('border-plasma')

    rerender(
      <DraftTileHand tiles={['32', '41']} tileByNumber={TILE_BY_NUMBER} isMyTurn={true} selectedTile="32" onSelect={vi.fn()} />
    )
    const btn32Selected = screen.getByRole('button', { name: /32/ })
    expect(btn32Selected.className).toContain('border-plasma')
  })

  it('empty tiles array renders placeholder text', () => {
    render(<DraftTileHand tiles={[]} tileByNumber={TILE_BY_NUMBER} isMyTurn={true} selectedTile={null} onSelect={vi.fn()} />)
    expect(screen.getByText('Hand empty')).toBeInTheDocument()
  })
})
