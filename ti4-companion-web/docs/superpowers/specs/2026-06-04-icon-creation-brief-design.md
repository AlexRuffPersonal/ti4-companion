# Icon Creation Brief

**Date:** 2026-06-04

## Overview

A complete brief for generating 59 new SVG icons for TI4 Companion using Claude Design (or equivalent AI image generation). Covers the master style prompt, folder structure, and per-icon descriptions.

---

## Style Contract

All icons share the following constraints. These apply without exception.

- **Style:** Geometric and minimalist. Clean strokes, sharp angles where fitting, smooth curves where fitting.
- **Stroke-only:** No filled shapes. `fill="none"` throughout. Use `stroke` only.
- **Single color:** `stroke="currentColor"` on all paths — icons are CSS-tinted at runtime. No gradients, no shadows, no multiple colors baked in.
- **Line weight:** `stroke-width` between 1.5 and 2. Consistent across all paths in a single icon.
- **Readable at 16px:** Design for small UI use. No fine detail that disappears below 24px.
- **ViewBox:** `0 0 24 24`. Square format.
- **No text, letters, or numbers** inside any icon.
- **Aesthetic:** Sci-fi / space opera — tactical display, military insignia, or HUD overlay. Not cartoon.
- **Output:** Clean SVG source only. No wrapper HTML.

### Master Style Prompt

Paste this at the start of every Claude Design session, then append the per-icon description from the catalogue below.

```
Create a single SVG icon for a digital board game companion app (Twilight Imperium 4th Edition).

Style constraints — follow these exactly:
• Geometric and minimalist. Clean strokes, sharp angles where fitting, smooth curves where fitting.
• Stroke-only. No filled shapes. Use stroke with no fill (fill="none") throughout.
• Single color. Use stroke="currentColor" so the icon can be CSS-tinted at runtime. No gradients, no shadows, no multiple colors.
• Line weight: stroke-width between 1.5 and 2. Consistent across all paths.
• Readable at 16×16px. Design for small UI use — avoid fine detail that disappears at small sizes.
• ViewBox: 0 0 24 24. Square format.
• No text, letters, or numbers inside the icon.
• Sci-fi / space opera aesthetic. Think tactical display, military insignia, or HUD overlay — not cartoon.
• Output: clean SVG source only, no wrapper HTML.
```

---

## Folder Structure

New folders to create under `public/icons/`:

```
public/icons/
  anomalies/       ← new
  cards/           ← new
  economy/         ← existing (add to)
  factions/        ← new
  fragments/       ← new
  planet/          ← existing (add to)
  strategy/        ← new
  tokens/          ← existing (add to)
  wormholes/       ← new
  dice/            ← existing (add to)
```

---

## Icon Catalogue

### A1 — Economy & Tokens (add to `public/icons/economy/`)

| File | Description |
|------|-------------|
| `economy/speaker.svg` | A podium or lectern viewed from the front — a flat angled surface on a central post, suggesting the "speaker" role. Simple enough to read at 16px. |

### A2 — Planet Traits (add to `public/icons/planet/`)

| File | Description |
|------|-------------|
| `planet/cultural.svg` | An arc or crescent shape with two outward-curving wings — like a stylised lyre or amphitheatre arch. Represents culture and civilisation. |
| `planet/hazardous.svg` | An upward-pointing flame made of three overlapping pointed strokes — danger and instability. Sharp, angular, not rounded. |
| `planet/industrial.svg` | A simple gear / cog outline — hexagonal hub with six evenly-spaced rectangular teeth around the perimeter. |

### A3 — Relic Fragments (`public/icons/fragments/`)

| File | Description |
|------|-------------|
| `fragments/cultural.svg` | A broken arc — the planet/cultural icon split diagonally, with a jagged break line across the centre. Visually related to the planet trait but clearly fragmented. |
| `fragments/hazardous.svg` | A broken flame — the planet/hazardous icon with the upper tip snapped off by a jagged horizontal break. Lower portion remains, upper shard offset slightly. |
| `fragments/industrial.svg` | A broken gear — the planet/industrial icon with one quarter of the cog cracked away, leaving a gap and a rough broken edge. |
| `fragments/unknown.svg` | An irregular crystal shard or meteorite fragment — a five-sided irregular polygon with one internal crack line radiating from the centre, suggesting unknown origin. |

### A4 — Wormholes & Anomalies

#### Wormholes (`public/icons/wormholes/`)

| File | Description |
|------|-------------|
| `wormholes/alpha.svg` | A ring (circle) with a tight inward spiral on the left side — representing a wormhole mouth. The spiral completes roughly 1.5 turns before reaching the centre. |
| `wormholes/beta.svg` | Same ring-and-spiral as alpha but the spiral exits on the right side, creating a visually distinct mirror twin that pairs with alpha. |
| `wormholes/delta.svg` | A ring with a double spiral — two interlocking inward spirals entering from opposite sides, meeting at the centre. Visually more complex than alpha/beta, marking it as special (PoK). |

#### Anomalies (`public/icons/anomalies/`)

| File | Description |
|------|-------------|
| `anomalies/supernova.svg` | A circle at the centre with eight evenly-spaced radiating lines of alternating lengths — a classic starburst / solar flare pattern. The longest rays extend nearly to the viewbox edge. |
| `anomalies/asteroid.svg` | Three irregular polygon shapes of different sizes scattered across the viewbox — the largest centre-left, two smaller ones upper-right and lower-right. Each polygon has 5–6 vertices suggesting rocky, uneven forms. |
| `anomalies/nebula.svg` | Two overlapping ellipses with soft scalloped/wavy outer edges, like a cosmic gas cloud. The ellipses tilt at roughly 30° to each other, creating an organic but minimal silhouette. |
| `anomalies/gravity-rift.svg` | A small circle at the centre with four curved lines pulling inward from the corners — like space being stretched toward a singularity. The lines curve progressively tighter as they approach the centre. |

### A5 — Strategy Card Symbols (`public/icons/strategy/`)

| File | Description |
|------|-------------|
| `strategy/leadership.svg` | A crown — three pointed peaks of equal height on a flat base band, with small circles or dots at each peak tip. Simple, unmistakable at small sizes. |
| `strategy/diplomacy.svg` | A balance scale — a horizontal bar suspended from a central post, with a small dish or arc hanging from each end at equal height. Classic scales of justice, geometric. |
| `strategy/politics.svg` | A classical column or pillar — a rectangular shaft with a capital (wider top block) and base (wider bottom block). Two vertical lines inside the shaft suggest fluting. |
| `strategy/construction.svg` | A wrench — a simple open-end spanner silhouette rotated 45°. The jaws open at upper-left, the handle extends to lower-right. |
| `strategy/trade.svg` | A stack of three coins — three overlapping ellipses stacked vertically with slight vertical spacing, each ellipse representing a coin viewed at a shallow angle. The top coin's ellipse is smallest, the bottom largest, giving a perspective stack effect. |
| `strategy/warfare.svg` | Two swords crossed at their midpoints, forming an X. Blades point to the four diagonal corners, hilts to the opposite corners. Simple, symmetrical. |
| `strategy/technology.svg` | An atom — a small circle at the centre with three elliptical orbit rings around it, each tilted at 60° intervals, creating a classic atomic orbital diagram. |
| `strategy/imperial.svg` | A starburst with a small circle at the centre and twelve evenly-spaced rays — eight medium and four longer, alternating. More formal and regular than the supernova anomaly. |

### A6 — Dice Results (add to `public/icons/dice/`)

| File | Description |
|------|-------------|
| `dice/hit.svg` | A target reticle — two concentric circles with four short perpendicular tick marks at 12, 3, 6, and 9 o'clock positions, like a crosshair. Represents a successful combat hit. |
| `dice/miss.svg` | A diagonal cross / X — two lines crossing at the centre, each running corner to corner of the viewbox. Represents a miss or failed roll. |

### B1 — Faction Emblems (`public/icons/factions/`)

#### Base Game (17)

| File | Description |
|------|-------------|
| `factions/arborec.svg` | A stylised spore or seed — a teardrop shape with three radiating root-tendrils extending outward from its base. Organic but geometric. |
| `factions/barony.svg` | An armoured skull — a rounded cranium shape with angular eye sockets, a reinforced jaw plate, and two small horns or spikes at the crown. |
| `factions/clan-saar.svg` | A nomadic star cluster — three small diamond shapes arranged in a loose triangle, connected by thin lines suggesting a wandering constellation. |
| `factions/embers-muaat.svg` | A war sun / stellar forge — a circle representing a star with four strong diagonal rays and four shorter intermediate rays, giving the sense of immense heat and power. |
| `factions/emirates-hacan.svg` | A lion's head in profile — angular, geometric mane lines fanning back from a simplified feline face. Proud and regal, not cartoon. |
| `factions/federation-sol.svg` | A planet with a ring — a circle (planet) with a slightly tilted elliptical orbital ring around its equator, plus a small dot orbiting above it (a moon). Classic and recognisable. |
| `factions/ghosts-creuss.svg` | A wormhole gate — a ring with a complex multi-layered spiral inside it, suggesting dimensional instability. More intricate inner detail than the plain wormhole icons. |
| `factions/l1z1x.svg` | A cybernetic skull — a rounded skull outline with circuit-trace lines crossing the cranium and geometric rectangular eye sockets. |
| `factions/mentak.svg` | A crescent with an eye — a thin crescent moon shape with a single almond eye inside the inner curve, suggesting hidden vigilance. |
| `factions/naalu.svg` | A serpent coiled in a circle biting its own tail (ouroboros) — three to four coil loops visible, the head at top-right with a small forked tongue. |
| `factions/nekro-virus.svg` | A biohazard-inspired skull — a round skull shape overlaid with three curved biohazard arc segments radiating from the eye sockets, suggesting infectious corruption. |
| `factions/sardakk-norr.svg` | An insectoid head — a broad triangular carapace head with two large compound eye ovals and short mandibles or pincers at the jaw, suggesting a militaristic hive species. |
| `factions/jol-nar.svg` | An atom inside a book — an open book outline (two angled pages meeting at a spine) with a small three-orbit atom symbol centred above the pages. |
| `factions/winnu.svg` | A lotus blossom — five symmetrical petal outlines radiating from a small central circle, with a second inner ring of shorter petals. Geometric, not floral-ornate. |
| `factions/xxcha.svg` | A serpentine peace symbol — a circle divided by three lines in the classic peace sign arrangement, but with each lower segment slightly curved, evoking reptilian scales. |
| `factions/yin.svg` | A yin-yang symbol — the classic teardrop-divided circle with small inner circles, rendered in geometric stroke form without fill. |
| `factions/yssaril.svg` | A lizard's eye — a tall almond eye shape with a vertical slit pupil, framed by three short scale-like angular marks radiating outward at top and sides. |

#### Prophecy of Kings (7)

| File | Description |
|------|-------------|
| `factions/argent-flight.svg` | A bird of prey in silhouette — wings swept back and angled sharply downward like a diving falcon, body and tail forming a clean arrow shape. |
| `factions/empyrean.svg` | An open eye inside a void circle — a large outer ring with a pointed oval eye centred inside it, the pupil replaced by a small starburst suggesting cosmic awareness. |
| `factions/mahact.svg` | A double-helix crown — a crown silhouette whose three peaks are formed by intertwined DNA helix strands instead of straight spires. |
| `factions/naaz-rokha.svg` | A crosshair compass — a circle with four cardinal tick marks and four diagonal shorter marks at 45° intervals, suggesting precision targeting and scouting. |
| `factions/nomad.svg` | A compass rose — eight directional arrows of alternating long/short lengths radiating from a central point, suggesting constant travel across the galaxy. |
| `factions/titans.svg` | A mountain silhouette — three peaks of ascending height from left to right, the tallest on the right, with a horizontal baseline. Angular and monumental. |
| `factions/vuil-raith.svg` | A tear in space — an irregular jagged oval gap, like fabric being ripped open, with four sharp spike-like tears radiating outward from the main rift. |

### B2 — Card Type Icons (`public/icons/cards/`)

| File | Description |
|------|-------------|
| `cards/action.svg` | A playing card outline (portrait rectangle with rounded corners) with a lightning bolt centred inside it. Represents an instant action. |
| `cards/agenda.svg` | A scroll — a rectangular document with rolled cylindrical ends at top and bottom, and three horizontal lines in the body suggesting written text. |
| `cards/relic.svg` | A gem or crystal — a hexagonal jewel shape with facet lines radiating from a small central point, like a cut precious stone viewed face-on. |
| `cards/secret-objective.svg` | An eye with a lock — a pointed oval eye shape with a small padlock icon centred where the iris would be. Suggests hidden / secret information. |
| `cards/public-1.svg` | A single five-pointed star with a banner ribbon curling beneath it — one stripe across the bottom of the star. Represents a Stage I public objective. |
| `cards/public-2.svg` | Two five-pointed stars side by side, slightly overlapping, with a banner ribbon beneath both. Represents a Stage II public objective — visually heavier than public-1. |

### B3 — Misc UI

| File | Folder | Description |
|------|--------|-------------|
| `tokens/activation.svg` | add to `public/icons/tokens/` | A hexagon outline with a small tactic-token chevron centred inside it — indicating a system has been activated. The hex matches the map tile shape. |
| `cards/promissory.svg` | add to `public/icons/cards/` | A handshake — two hands gripping each other, simplified to geometric angular outlines. Represents trade and promises between players. |
| `economy/production.svg` | add to `public/icons/economy/` | A gear with a small upward arrow overlapping its upper-right — the gear represents industrial capacity, the arrow represents output/production. |
| `tokens/frontier.svg` | add to `public/icons/tokens/` | A solar eclipse — a circle (moon) partially overlapping and occluding a slightly larger circle (star/sun), with short radiating lines visible around the exposed crescent of the star. The overlap sits slightly off-centre to make the eclipse dramatic at small sizes. |

---

## Summary

| Category | Count |
|----------|-------|
| UI gaps (A1–A6) | 25 |
| Faction emblems (B1) | 24 |
| Card types (B2) | 6 |
| Misc UI (B3) | 4 |
| **Total** | **59** |

## Usage

All icons are rendered via `GameIcon` (`src/components/shared/GameIcon.jsx`):

```jsx
<GameIcon category="strategy" name="trade" size={24} />
<GameIcon category="factions" name="arborec" size={32} className="text-gold" />
```

CSS tinting works because all icons use `stroke="currentColor"` — set a `color` or Tailwind text color class on the element or a parent to tint the icon.
