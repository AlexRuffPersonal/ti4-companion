import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HexMap from '../../../src/components/game/HexMap.jsx'

const MAP_TILES = {
  '0,0': { tile_id: 'tid-18', tile_number: '18' },
  '1,-1': { tile_id: 'tid-32', tile_number: '32' },
  '-1,1': { tile_id: 'tid-30', tile_number: '30' },
}

const TILE_DATA = {
  'tid-18': { id: 'tid-18', tile_number: '18', planets: [{ name: 'Mecatol Rex' }] },
  'tid-32': { id: 'tid-32', tile_number: '32', planets: [{ name: 'Wellon' }] },
  'tid-30': { id: 'tid-30', tile_number: '30', planets: [] },
}

const PLAYERS = [{ id: 'p1', display_name: 'Alice', colour: '#22c55e' }]

function renderMap(overrides = {}) {
  return render(
    <HexMap
      mapTiles={MAP_TILES}
      tileData={TILE_DATA}
      activations={[]}
      systemUnits={[]}
      planetOwnership={new Map()}
      players={PLAYERS}
      onSelectSystem={vi.fn()}
      {...overrides}
    />
  )
}

describe('HexMap', () => {
  it('renders one tile number per entry in mapTiles', () => {
    renderMap()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('32')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('renders an SVG element', () => {
    const { container } = renderMap()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders one <g> group per tile', () => {
    const { container } = renderMap()
    // Each tile has a <g> wrapping a HexTile <g>: outer translate group + inner tile group
    const polygons = container.querySelectorAll('polygon')
    expect(polygons.length).toBe(3)
  })

  it('renders nothing when mapTiles is empty', () => {
    const { container } = renderMap({ mapTiles: {} })
    expect(container.querySelectorAll('polygon').length).toBe(0)
  })
})