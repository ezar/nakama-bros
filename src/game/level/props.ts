import { C, LevelBuilder } from './builder'

/**
 * Structures assembled from tiles.
 *
 * A stage is more memorable when its geometry *is* its scenery: the thing you
 * climb is a windmill, the thing you cross is an aqueduct.
 *
 * What these can be built from is decided by the tileset, not by taste. Solid
 * renders as rock and earth with a growth crown on its skyline; one-way renders
 * as a timber beam; brick renders as a crate; climb renders as a ladder. `Decor`
 * renders as the *inside* of the ground — so it is used here only below a
 * surface, as the fill of a cliff or the back of a cave, and never as the wall
 * of a building, where it reads as a hole dug in a mud bank.
 *
 * Everything above ground is therefore rock, timber, crates and rope. The
 * silhouettes that need to read as objects rather than as terrain — windmill
 * sails, a pagoda, a sea-train carriage — want to be drawn scenery entities;
 * this file makes the parts of them you can stand on.
 */

/**
 * A building: a rock-walled body under an overhanging plank roof.
 *
 * The roof suppresses the growth crown that a bare solid skyline would grow, so
 * the block reads as walls and a roof rather than as a lump of hillside, and
 * the overhang gives it eaves. Solid, so it has to be climbed — put `crates`
 * against it if the roof is meant to be part of the road.
 */
export function shack(
  b: LevelBuilder,
  x0: number,
  x1: number,
  floorRow: number,
  height: number,
): number {
  const roof = floorRow - height
  // Masonry, not earth: the solid tile grows a skyline of grass wherever it
  // meets air, which turns a building into a lump of hillside with a beam over
  // it. Brick is the tileset's cut-stone, so a wall built from it reads as one.
  b.rect(x0, roof + 1, x1, floorRow - 1, C.brick)
  b.hline(x0 - 1, x1 + 1, roof, C.oneWay)
  return roof
}

/**
 * A tower — windmill, lighthouse, watchtower, tent pole.
 *
 * Two stone piers with an open shaft between them, a plank deck across the top
 * and a ladder up the shaft. Open at the bottom so the street runs through it:
 * a tower that blocks the road is a wall with a hat on.
 */
export function tower(
  b: LevelBuilder,
  x0: number,
  x1: number,
  floorRow: number,
  topRow: number,
): { deck: number; ladder: number } {
  // The legs stop two rows above the floor, which is what lets you in. Run
  // them all the way down and the shaft is sealed: the ladder is visible from
  // the ground, reachable only by climbing something else and dropping in from
  // the deck, and every tower in the campaign had that fault.
  b.vline(x0, topRow + 1, floorRow - 3, C.solid)
  b.vline(x1, topRow + 1, floorRow - 3, C.solid)
  // Braces across the shaft, a storey apart: the tower reads as a frame, and
  // they are somewhere to stand if you fall off the ladder.
  for (let y = topRow + 4; y < floorRow - 2; y += 4) b.ledge(x0 + 1, x1 - 1, y)
  b.hline(x0 - 1, x1 + 1, topRow, C.oneWay)
  const ladder = Math.round((x0 + x1) / 2)
  b.ladder(ladder, topRow, floorRow - 1)
  return { deck: topRow, ladder }
}

/**
 * Rigging: a climbable line from a deck up to a crow's nest.
 *
 * The nest is drawn either side of the line rather than across it — a plank
 * laid over the ladder would cut the climb in two at the last rung.
 */
export function rigging(
  b: LevelBuilder,
  x: number,
  deckRow: number,
  nestRow: number,
): number {
  b.ledge(x - 2, x - 1, nestRow)
  b.ledge(x + 1, x + 2, nestRow)
  b.ladder(x, nestRow, deckRow - 1)
  return nestRow
}

/**
 * An arcade of arches carrying a walkway — aqueduct, viaduct, sea-train
 * trestle. Stone legs down to `footRow`, open sky between them, so the
 * silhouette reads against the parallax.
 */
export function arches(
  b: LevelBuilder,
  x0: number,
  x1: number,
  deckRow: number,
  footRow: number,
  legEvery = 9,
): void {
  b.hline(x0, x1, deckRow, C.solid)
  for (let x = x0 + 1; x <= x1 - 1; x += legEvery) {
    b.rect(x, deckRow + 1, x + 1, footRow, C.solid)
    // The haunches where the arch springs from the leg.
    b.set(x - 1, deckRow + 1, C.solid)
    b.set(x + 2, deckRow + 1, C.solid)
  }
}

/** A stack of crates — breakable furniture that doubles as a step. */
export function crates(b: LevelBuilder, x: number, floorRow: number, n: number): void {
  for (let i = 0; i < n; i++) b.set(x, floorRow - 1 - i, C.brick)
}

/** A broken column: a thin stack of stone with a wider capital to land on. */
export function ruinColumn(b: LevelBuilder, x: number, floorRow: number, height: number): number {
  const top = floorRow - height
  b.rect(x, top + 1, x + 1, floorRow - 1, C.solid)
  b.hline(x - 1, x + 2, top, C.oneWay)
  return top
}

/**
 * A gate — torii, arch, gantry: two posts and a lintel you can stand on.
 *
 * The posts are non-colliding, because a gate you cannot walk through is a wall
 * with a hat on; the lintel is one-way, so the row of gates along a road is
 * also a road above the road.
 */
export function gate(b: LevelBuilder, x0: number, x1: number, floorRow: number, height: number): number {
  const lintel = floorRow - height
  b.vline(x0, lintel + 1, floorRow - 1, C.decor)
  b.vline(x1, lintel + 1, floorRow - 1, C.decor)
  b.hline(x0 - 1, x1 + 1, lintel, C.oneWay)
  return lintel
}

/** A bare tree: a rock trunk with branches you can stand on. */
export function deadTree(b: LevelBuilder, x: number, floorRow: number, height: number): number {
  const top = floorRow - height
  b.vline(x, top + 1, floorRow - 1, C.solid)
  // Branches every three rows, not every two: a trunk with a rung at every
  // height is a ladder, and five of them in a row is a wall of planks.
  for (let i = 3; i < height; i += 3) {
    const y = floorRow - i
    const dir = i % 6 === 3 ? 1 : -1
    b.ledge(Math.min(x + dir, x), Math.max(x + dir * 3, x), y)
  }
  b.ledge(x - 1, x + 1, top)
  return top
}

/**
 * A plank bridge. `crumble` makes every other plank a tile that gives way,
 * which turns a crossing into a decision about pace.
 */
export function bridge(
  b: LevelBuilder,
  x0: number,
  x1: number,
  y: number,
  crumble = false,
): void {
  for (let x = x0; x <= x1; x++) {
    b.set(x, y, crumble && (x - x0) % 2 === 1 ? C.crumble : C.oneWay)
  }
}

/**
 * Stacked eaves — a pagoda, a tiered tent, a stepped roof. Every tier is a
 * landing, so the whole roof is a staircase for anyone who thinks to climb it.
 * Returns the top tier's row.
 */
export function tiers(
  b: LevelBuilder,
  cx: number,
  floorRow: number,
  count: number,
  halfWidth = 5,
): number {
  let y = floorRow - 2
  let hw = halfWidth
  for (let t = 0; t < count; t++) {
    b.ledge(cx - hw, cx + hw, y)
    y -= 3
    hw = Math.max(1, hw - 1)
  }
  return y + 3
}

/**
 * A row of stones: knee-high solid stubs — gravestones, milestones, cactus
 * stumps. Cover to jump onto, and a broken skyline so a flat floor is not one.
 */
export function stones(b: LevelBuilder, x0: number, x1: number, floorRow: number, seed = 1): void {
  for (let x = x0; x <= x1; x += 3) {
    const h = 1 + ((x * 7 + seed * 13) % 3 === 0 ? 1 : 0)
    b.rect(x, floorRow - h, x, floorRow - 1, C.solid)
  }
}

/**
 * A cliff face with its inside showing — the cut bank of a canyon, the section
 * through a hill. `decor` is right here and only here: it is the fill of the
 * ground, drawn behind everything, and it is what stops a carved-out cave
 * reading as a hole punched through to the sky.
 */
export function cutaway(b: LevelBuilder, x0: number, y0: number, x1: number, y1: number): void {
  b.decor(x0, y0, x1, y1)
}
