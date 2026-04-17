import { useState } from 'react'
import { researchTechnology } from '../lib/edgeFunctions.js'

const COLOUR_TYPES = new Set(['green', 'blue', 'yellow', 'red'])

// Exported for unit testing.
// Returns how many of each colour the player currently holds.
// unit_upgrade techs are excluded — they don't satisfy colour prerequisites.
export function computeHeldCounts(heldTechNames, allTechnologies) {
  const counts = { green: 0, blue: 0, yellow: 0, red: 0 }
  for (const name of heldTechNames) {
    const tech = allTechnologies.find(t => t.name === name)
    if (tech && COLOUR_TYPES.has(tech.technology_type)) counts[tech.technology_type]++
  }
  return counts
}

// Exported for unit testing.
// readyPlanets: game_player_planets rows where !exhausted && tech_specialty != null.
// Caller is responsible for pre-filtering.
export function computeTechStatus(tech, heldTechNames, allTechnologies, readyPlanets) {
  if (heldTechNames.includes(tech.name)) {
    return { status: 'held', missingPrereqs: [], exhaustOptions: [] }
  }

  const prereqs = tech.prerequisites ?? {}
  if (Object.keys(prereqs).length === 0) {
    return { status: 'available', missingPrereqs: [], exhaustOptions: [] }
  }

  const held = computeHeldCounts(heldTechNames, allTechnologies)
  const hasAIDA = heldTechNames.includes('AI Development Algorithm')

  const missingByColour = {}
  for (const [colour, needed] of Object.entries(prereqs)) {
    const deficit = needed - (held[colour] ?? 0)
    if (deficit > 0) missingByColour[colour] = deficit
  }

  if (Object.keys(missingByColour).length === 0) {
    return { status: 'available', missingPrereqs: [], exhaustOptions: [] }
  }

  // Try to cover each missing colour via exhaust path
  let aidaAvailable = hasAIDA
  const exhaustOptions = []
  const usedPlanetIds = new Set()

  for (const [colour, deficit] of Object.entries(missingByColour)) {
    let remaining = deficit

    for (const planet of readyPlanets) {
      if (remaining === 0) break
      if (usedPlanetIds.has(planet.id)) continue
      if (planet.tech_specialty === colour) {
        exhaustOptions.push({ ...planet, coversColour: colour })
        usedPlanetIds.add(planet.id)
        remaining--
      }
    }

    if (remaining > 0 && aidaAvailable) {
      aidaAvailable = false
      remaining--
    }

    if (remaining > 0) {
      const missingPrereqs = Object.entries(missingByColour).map(
        ([c, count]) => ({ colour: c, count })
      )
      return { status: 'unavailable', missingPrereqs, exhaustOptions: [] }
    }
  }

  return { status: 'exhaust', missingPrereqs: [], exhaustOptions }
}

function findInSections(sections, techId) {
  for (const key of Object.keys(sections)) {
    const found = sections[key].find(t => t.id === techId)
    if (found) return found
  }
  return null
}

function buildSections(heldTechNames, allTechnologies, readyPlanets, faction, activeExpansions) {
  const eligible = allTechnologies.filter(t => activeExpansions.includes(t.expansion ?? 'base'))

  const sortByPrereqs = (a, b) => {
    const sum = t => Object.values(t.prerequisites ?? {}).reduce((s, n) => s + n, 0)
    return sum(a) - sum(b)
  }

  const annotate = t => ({ ...t, ...computeTechStatus(t, heldTechNames, allTechnologies, readyPlanets) })

  return {
    faction:      eligible.filter(t => t.faction === faction && t.technology_type !== 'unit_upgrade').map(annotate).sort(sortByPrereqs),
    unitUpgrades: eligible.filter(t => t.technology_type === 'unit_upgrade').map(annotate).sort(sortByPrereqs),
    biotic:       eligible.filter(t => !t.faction && t.technology_type === 'green').map(annotate).sort(sortByPrereqs),
    propulsion:   eligible.filter(t => !t.faction && t.technology_type === 'blue').map(annotate).sort(sortByPrereqs),
    cybernetic:   eligible.filter(t => !t.faction && t.technology_type === 'yellow').map(annotate).sort(sortByPrereqs),
    warfare:      eligible.filter(t => !t.faction && t.technology_type === 'red').map(annotate).sort(sortByPrereqs),
  }
}

function markPreview(previewSection, currentSection) {
  return previewSection.map(t => {
    const current = currentSection.find(c => c.id === t.id)
    if (
      current &&
      (current.status === 'unavailable' || current.status === 'exhaust') &&
      t.status === 'available'
    ) {
      return { ...t, status: 'preview' }
    }
    return t
  })
}

// player: game_players row ({ technologies: string[], faction: string })
// planets: game_player_planets rows for this player
// allTechnologies: full technologies reference table
// gameId: current game UUID (for confirmResearch)
// gameExpansions: games.expansions JSONB e.g. { base: true, pok: false }
export function useTechTree(player, planets, allTechnologies, gameId, gameExpansions) {
  const [selectedTechId, setSelectedTechId] = useState(null)

  const heldTechNames = player?.technologies ?? []
  const faction = player?.faction ?? null
  const activeExpansions = Object.entries(gameExpansions ?? {})
    .filter(([, active]) => active)
    .map(([exp]) => exp)
  const readyPlanets = (planets ?? []).filter(p => !p.exhausted && p.tech_specialty)
  const techs = allTechnologies ?? []

  const sections = buildSections(heldTechNames, techs, readyPlanets, faction, activeExpansions)

  // Use the annotated version from sections so exhaustOptions/status are present.
  const selectedTech = selectedTechId ? findInSections(sections, selectedTechId) ?? null : null

  let previewSections = null
  if (selectedTech) {
    const previewHeld = [...heldTechNames, selectedTech.name]
    const base = buildSections(previewHeld, techs, readyPlanets, faction, activeExpansions)
    previewSections = {
      faction:      markPreview(base.faction,      sections.faction),
      unitUpgrades: markPreview(base.unitUpgrades, sections.unitUpgrades),
      biotic:       markPreview(base.biotic,       sections.biotic),
      propulsion:   markPreview(base.propulsion,   sections.propulsion),
      cybernetic:   markPreview(base.cybernetic,   sections.cybernetic),
      warfare:      markPreview(base.warfare,      sections.warfare),
    }
  }

  function selectTech(techId) {
    setSelectedTechId(prev => prev === techId ? null : techId)
  }

  function clearSelection() {
    setSelectedTechId(null)
  }

  async function confirmResearch(techId, exhaustPlanetIds = [], bypassPrerequisites = false) {
    const tech = techs.find(t => t.id === techId)
    if (!tech) throw new Error('Technology not found')
    await researchTechnology(gameId, tech.name, exhaustPlanetIds, bypassPrerequisites)
    setSelectedTechId(null)
  }

  return { sections, previewSections, selectedTech, selectTech, clearSelection, confirmResearch }
}
