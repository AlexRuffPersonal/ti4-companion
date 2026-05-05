import { render, screen } from '@testing-library/react'
import MapPreviewSection from '../../../src/components/game/MapPreviewSection'

describe('MapPreviewSection', () => {
  it('renders "No map configured" when mapTiles is empty', () => {
    render(<MapPreviewSection mapTiles={{}} />)
    expect(screen.getByText('No map configured')).toBeInTheDocument()
  })

  it('renders "No map configured" when mapTiles is undefined', () => {
    render(<MapPreviewSection />)
    expect(screen.getByText('No map configured')).toBeInTheDocument()
  })

  it('renders an SVG when mapTiles has entries', () => {
    const { container } = render(
      <MapPreviewSection mapTiles={{ '1,0': { tile_number: '1', rotation: 0 } }} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('always renders Mecatol Rex tile at 0,0', () => {
    const { container } = render(
      <MapPreviewSection mapTiles={{ '1,0': { tile_number: '1' } }} />
    )
    // Tile number "18" appears in the SVG (Mecatol)
    expect(container.textContent).toContain('18')
  })

  it('tile with rotation=2 has a rotate transform', () => {
    const { container } = render(
      <MapPreviewSection mapTiles={{ '1,0': { tile_number: '5', rotation: 2 } }} />
    )
    const transforms = container.querySelectorAll('[transform]')
    const hasRotate = Array.from(transforms).some(el => el.getAttribute('transform')?.includes('rotate(120'))
    expect(hasRotate).toBe(true)
  })

  it('tile with rotation=0 has no rotation in transform', () => {
    const { container } = render(
      <MapPreviewSection mapTiles={{ '1,0': { tile_number: '5', rotation: 0 } }} />
    )
    const transforms = Array.from(container.querySelectorAll('[transform]'))
    const hasRotate = transforms.some(el => el.getAttribute('transform')?.includes('rotate(0'))
    expect(hasRotate).toBe(false)
  })
})
