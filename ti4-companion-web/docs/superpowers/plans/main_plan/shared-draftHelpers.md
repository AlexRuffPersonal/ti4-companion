# shared-draftHelpers

**File:** `supabase/functions/_shared/draftHelpers.ts`
**Status:** New
**Prereqs:** migration-048-draft-state

## Functionality

```ts
// Shuffle an array in-place (Fisher-Yates), returns new shuffled copy
export function shuffle<T>(arr: T[]): T[]

// Score a tile for balance: sum(planet.resources + planet.influence) + (wormhole?1:0) - (anomaly?1:0)
export function scoreTile(tile: { planets: {resources:number;influence:number}[]; wormhole:string|null; anomaly:string|null }): number

// Build full snake placement order given ordered player IDs and per-player hand sizes.
// Pattern: [p0,p1,...,pN-1,pN-1,...,p1,p0] repeating until all tiles assigned.
// Skips a player once their hand is exhausted.
export function buildSnakeOrder(playerIds: string[], handSizes: Record<string,number>): string[]

// Chebyshev ring distance from Mecatol (0,0)
export function axialRing(q: number, r: number): number

// Six axial neighbors of (q,r)
export function hexNeighbors(q: number, r: number): [number, number][]
```

## Tests

```ts
// shuffle: output has same elements, order differs (probabilistic, retry if identical)
// scoreTile: planets [{r:2,i:1}] + wormhole → score=4; anomaly tile with no planets → score=-1
// buildSnakeOrder 3P each 3 tiles → [A,B,C,C,B,A,A,B,C] length 9, each appears 3 times
// buildSnakeOrder 6P each 5 tiles → length 30, each appears 5 times
// buildSnakeOrder non-uniform (speaker has 6, others 5) → length correct, no out-of-bounds
// axialRing(0,0)=0; axialRing(1,0)=1; axialRing(2,-1)=2; axialRing(-3,3)=3
// hexNeighbors(0,0) → 6 pairs
```
