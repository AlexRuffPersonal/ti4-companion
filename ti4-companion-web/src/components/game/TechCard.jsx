import { useState } from 'react'
import { EXHAUSTABLE_TECHS, ACTION_TECHS } from '../../lib/techConstants.js'
import GameIcon from '../shared/GameIcon.jsx'

const TECH_TYPE_ICON = {
  green: 'biotic',
  blue: 'propulsion',
  yellow: 'cybernetic',
  red: 'warfare',
}

const STATUS_BORDER = {
  held:        'border-success   bg-hull',
  available:   'border-plasma    bg-hull',
  exhaust:     'border-warning   bg-hull border-dashed',
  unavailable: 'border-border    bg-void opacity-60',
  preview:     'border-plasma    bg-hull ring-1 ring-plasma ring-offset-0',
}

// tech: annotated tech object from useTechTree (has status, missingPrereqs, exhaustOptions)
// isOwnTree: whether this modal is showing the current user's own tree
// isSelected: whether this card is the currently selected preview tech
// onSelect: (techId) => void
// onConfirm: (techId) => void — only called on own tree for available/exhaust/preview techs
// isExhausted: boolean — whether this tech is currently exhausted (Phase 30)
// onExhaust: () => void — exhaust this tech
// onReady: () => void — ready this tech
// onUseAction: (techName) => void — use an action tech ability
export default function TechCard({ tech, isOwnTree, isSelected, onSelect, onConfirm, isExhausted, onExhaust, onReady, onUseAction }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasText = Boolean(tech.text)
  const borderClass = STATUS_BORDER[tech.status] ?? STATUS_BORDER.unavailable
  const canResearch = isOwnTree && isSelected && tech.status !== 'held' && tech.status !== 'unavailable'

  const typeIconName = TECH_TYPE_ICON[tech.technology_type]

  return (
    <div
      data-testid="tech-card"
      className={`rounded-md border-2 p-2 cursor-pointer transition-all ${borderClass} ${isSelected ? 'ring-2 ring-offset-1 ring-gold' : ''} ${isExhausted ? 'opacity-50 rotate-6' : ''}`}
      onClick={() => onSelect(tech.id)}
    >
      {/* Tech type icon row */}
      {typeIconName && (
        <div data-testid="tech-type-icon-row" className="flex items-center gap-1 mb-1">
          <GameIcon category="tech" name={typeIconName} size={16} alt={typeIconName} />
          <span data-testid="tech-type-label">{typeIconName.toUpperCase()}</span>
        </div>
      )}

      {/* Name + expand toggle */}
      <div className="flex items-center justify-between gap-1">
        <p className={`font-body text-xs font-bold leading-tight ${tech.status === 'held' ? 'text-success' : tech.status === 'unavailable' ? 'text-dim' : 'text-text'}`}>
          {tech.name}
        </p>
        {hasText && (
          <button
            data-testid="tech-text-toggle"
            className="text-dim text-xs shrink-0"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(prev => !prev) }}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        )}
      </div>
      {isExpanded && hasText && (
        <p data-testid="tech-text" className="text-dim text-xs mt-1 leading-snug">
          {tech.text}
        </p>
      )}

      {/* Missing prereq tooltip */}
      {tech.status === 'unavailable' && tech.missingPrereqs?.length > 0 && (
        <p className="text-dim text-xs mt-1">
          Missing: {tech.missingPrereqs.map(m => `${m.count} ${m.colour}`).join(', ')}
        </p>
      )}

      {/* Confirm research button */}
      {canResearch && (
        <button
          className="btn-primary text-xs mt-2 w-full"
          onClick={(e) => { e.stopPropagation(); onConfirm(tech.id) }}
        >
          RESEARCH
        </button>
      )}

      {/* Exhaust / Ready button for exhaustable techs (Phase 30) */}
      {EXHAUSTABLE_TECHS.has(tech.name) && (
        isExhausted
          ? <button className="btn-ghost text-xs mt-1" onClick={(e) => { e.stopPropagation(); onReady && onReady() }}>Ready</button>
          : <button className="btn-ghost text-xs mt-1" onClick={(e) => { e.stopPropagation(); onExhaust && onExhaust() }}>Exhaust</button>
      )}

      {/* Use button for action techs (Phase 30) */}
      {ACTION_TECHS.has(tech.name) && !isExhausted && (
        <button className="btn-ghost text-xs mt-1" onClick={(e) => { e.stopPropagation(); onUseAction && onUseAction(tech.name) }}>Use</button>
      )}
    </div>
  )
}
