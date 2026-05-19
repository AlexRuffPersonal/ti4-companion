# component-MyPanelSection-icon-integration
**File:** `src/components/game/MyPanelSection.jsx`
**Status:** Modify
**Prereqs:** component-GameIcon

## Functionality
```
TOKEN_ICONS = { tactic_total:'tactic', fleet:'fleet', strategy:'strategy' }

Token counters: between label text and number/input, add:
  <GameIcon category="tokens" name={TOKEN_ICONS[key]} size={22} alt={label} />

Commodity counter: between "COMMOD." label and +/- control, add:
  <GameIcon category="economy" name="commodity" size={22} alt="commodity" />

Trade goods counter: between "TRADE" label and +/- control, add:
  <GameIcon category="economy" name="trade-good" size={22} alt="trade good" />

Planet resource/influence: replace {staticInfo.resources}/{staticInfo.influence} span with:
  <GameIcon category="planet" name="resource" size={12} alt="resource" />
  <span>{staticInfo.resources}</span>
  <GameIcon category="planet" name="influence" size={12} alt="influence" />
  <span>{staticInfo.influence}</span>
```

## Tests
```
renders tactic token icon (alt="tactic" or img src contains "tactic")
renders fleet token icon
renders strategy token icon
renders commodity icon
renders trade-good icon
renders resource icon for planet when planetStaticMap provided
renders influence icon for planet when planetStaticMap provided
planet resource and influence values still visible as separate text nodes
old "resources/influence" slash-format text no longer present
```
