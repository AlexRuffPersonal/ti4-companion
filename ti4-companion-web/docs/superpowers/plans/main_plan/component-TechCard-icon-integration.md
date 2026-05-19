# component-TechCard-icon-integration
**File:** `src/components/game/TechCard.jsx`
**Status:** Modify
**Prereqs:** component-GameIcon

## Functionality
```
TECH_TYPE_ICON = { green:'biotic', blue:'propulsion', yellow:'cybernetic', red:'warfare' }

Remove: COLOUR_DOT map + prereq dots render block (data-testid prereq-dot-filled/empty)
Add: before tech name row, if TECH_TYPE_ICON[tech.technology_type] exists:
  <div data-testid="tech-type-icon-row">
    <GameIcon category="tech" name={TECH_TYPE_ICON[tech.technology_type]} size={16}
              alt={TECH_TYPE_ICON[tech.technology_type]} />
    <span data-testid="tech-type-label">{TECH_TYPE_ICON[tech.technology_type].toUpperCase()}</span>
  </div>
Keep: missing prereq tooltip text for unavailable techs (unchanged)
```

## Tests
```
renders type icon img with src="/icons/tech/biotic.svg" for technology_type="green"
renders type icon img with src="/icons/tech/propulsion.svg" for technology_type="blue"
renders type icon img with src="/icons/tech/cybernetic.svg" for technology_type="yellow"
renders type icon img with src="/icons/tech/warfare.svg" for technology_type="red"
renders no type icon for technology_type="unit_upgrade"
still shows missing prereq text for unavailable techs
prereq-dot-filled and prereq-dot-empty testids no longer present
```
