import { useState } from 'react'
import { useTechTree } from '../../hooks/useTechTree.js'
import TechTreeSection from './TechTreeSection.jsx'
import TechCard from './TechCard.jsx'
import ExhaustPlanetPicker from './ExhaustPlanetPicker.jsx'

// player: game_players row for the player being viewed
// planets: game_player_planets rows for that player
// allTechnologies: full technologies reference table
// gameId, gameExpansions: for prerequisite filtering and Edge Function calls
// isOwnTree: whether this is the current user's own tree (shows confirm button)
// onClose: () => void
export default function TechTreeModal({
  player, planets, allTechnologies,
  gameId, gameExpansions,
  isOwnTree, onClose,
}) {
  const [selectedPlanetIds, setSelectedPlanetIds] = useState([])
  const {
    sections, previewSections, selectedTech,
    selectTech, clearSelection, confirmResearch,
  } = useTechTree(player, planets, allTechnologies, gameId, gameExpansions)

  const displaySections = previewSections ?? sections

  function handleSelect(techId) {
    setSelectedPlanetIds([])
    selectTech(techId)
  }

  function handleClear() {
    setSelectedPlanetIds([])
    clearSelection()
  }

  function togglePlanet(planetId) {
    setSelectedPlanetIds(prev =>
      prev.includes(planetId) ? prev.filter(id => id !== planetId) : [...prev, planetId]
    )
  }

  async function handleConfirm(techId) {
    await confirmResearch(techId, selectedPlanetIds)
    setSelectedPlanetIds([])
  }

  const exhaustOptions = selectedTech?.exhaustOptions ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleClear}
    >
      <div
        className="relative bg-void border border-border rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="font-display text-sm tracking-widest text-bright">
            {player?.faction ?? 'TECHNOLOGIES'}
          </p>
          <button
            data-testid="tech-modal-close"
            className="btn-ghost text-xs"
            onClick={onClose}
          >
            CLOSE
          </button>
        </div>

        {/* Exhaust planet picker — shown below header when a tech requiring exhaust is selected */}
        {isOwnTree && exhaustOptions.length > 0 && selectedTech && (
          <ExhaustPlanetPicker
            exhaustOptions={exhaustOptions}
            selected={selectedPlanetIds}
            onToggle={togglePlanet}
          />
        )}

        {/* Faction + Unit Upgrades (full width) */}
        <TechTreeSection
          label="FACTION"
          techs={displaySections.faction}
          isOwnTree={isOwnTree}
          selectedTechId={selectedTech?.id ?? null}
          onSelect={handleSelect}
          onConfirm={handleConfirm}
        />
        <TechTreeSection
          label="UNIT UPGRADES"
          techs={displaySections.unitUpgrades}
          isOwnTree={isOwnTree}
          selectedTechId={selectedTech?.id ?? null}
          onSelect={handleSelect}
          onConfirm={handleConfirm}
        />

        {/* Colour columns grid */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'BIOTIC',      key: 'biotic' },
            { label: 'PROPULSION',  key: 'propulsion' },
            { label: 'CYBERNETIC',  key: 'cybernetic' },
            { label: 'WARFARE',     key: 'warfare' },
          ].map(({ label, key }) => (
            <div key={key} className="flex flex-col gap-2">
              <p className="label text-xs">{label}</p>
              {(displaySections[key] ?? []).map(tech => (
                <TechCard
                  key={tech.id}
                  tech={tech}
                  isOwnTree={isOwnTree}
                  isSelected={selectedTech?.id === tech.id}
                  onSelect={handleSelect}
                  onConfirm={handleConfirm}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
