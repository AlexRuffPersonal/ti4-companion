import TechCard from './TechCard.jsx'

// techs: annotated tech array from useTechTree sections
// label: section heading string
// isOwnTree, selectedTechId, onSelect, onConfirm: passed through to TechCard
export default function TechTreeSection({ label, techs, isOwnTree, selectedTechId, onSelect, onConfirm }) {
  if (!techs || techs.length === 0) return null

  return (
    <div>
      <p className="label text-xs mb-2">{label}</p>
      <div className="flex flex-col gap-2">
        {techs.map(tech => (
          <TechCard
            key={tech.id}
            tech={tech}
            isOwnTree={isOwnTree}
            isSelected={selectedTechId === tech.id}
            onSelect={onSelect}
            onConfirm={onConfirm}
          />
        ))}
      </div>
    </div>
  )
}
