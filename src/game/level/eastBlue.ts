import type { LevelDef } from '../../types'
import { C, LevelBuilder } from './builder'
import { bridge, crates, rigging, shack, tower } from './props'

/**
 * East Blue — the first island.
 *
 * 1-1 teaches the verbs one at a time on a headland where nothing can kill you
 * for the first twenty tiles. 1-2 takes the same verbs out over water and adds
 * a second storey. 1-3 is the circus tent.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1-1 · Villa Fuchsia
// ─────────────────────────────────────────────────────────────────────────────

function buildVillaFuchsia(): LevelDef {
  const W = 228
  const H = 22
  const G = 15 // the headland's ground line
  const b = new LevelBuilder(W, H)

  // ── Beat 1 · the headland. Twenty tiles with nothing in them but grass, a
  //    windmill and a trail of berries, because the first thing a level has to
  //    teach is that running feels good.
  b.ground(0, 26, G)
  shack(b, 6, 11, G, 4)
  crates(b, 5, G, 2)
  b.berryLine(2, 5, G - 1)
  b.berryLine(7, 10, G - 5, 1)
  b.spawn('barrel', 15, G - 1)

  // ── Beat 2 · one grunt, in the open, on flat ground.
  b.spawn('grunt', 22, G - 1)
  b.berryArc(18, G - 1, 6, 3)

  // ── Beat 3 · the first gap. Three tiles, with the landing in full view and
  //    berries drawing the arc the jump makes.
  b.pit(27, 29)
  b.berryArc(27, G - 2, 3, 2)
  b.ground(30, 46, G)

  // ── Beat 4 · things you hit from underneath.
  b.question(31, G - 4)
  b.bricks(32, 32, G - 4)
  b.question(33, G - 4)
  b.spawn('meat', 32, G - 6)

  // ── Beat 4b · a knoll. Two hops up, a run along the top, and the coast
  //    falling away on the far side: the level's first change of altitude, and
  //    the first place the horizon moves.
  b.stepUp(36, G, 2, 2)
  b.ground(40, 43, G - 2)
  b.descend(44, G - 2, 2)
  b.onGround('grunt', 42)
  b.berryLine(40, 43, G - 3, 1)

  // ── Beat 5 · the same gap twice, with a two-tile island between them. Test.
  b.pit(47, 49)
  b.ground(50, 51, G)
  b.pit(52, 54)
  b.ground(55, 55, G)
  b.spawn('berry', 51, G - 3)

  // ── Beat 6 · the cove. The headland rolls down to a beach and the sea; the
  //    only slope direction this engine can walk is downhill, which suits a
  //    coast.
  const beach = b.descend(56, G, 4)
  b.ground(60, 62, beach)
  b.water(63, 79, beach, beach + 2)
  bridge(b, 65, 67, beach - 2)
  bridge(b, 71, 73, beach - 2)
  b.spawn('fishman', 69, beach - 1)
  b.berryLine(65, 67, beach - 3, 1)
  b.berryLine(71, 73, beach - 3, 1)

  // ── Beat 7 · out of the cove by steps, because a ramp only goes one way.
  b.ground(80, 81, beach)
  b.stepUp(82, beach, 4, 2)
  b.ground(90, 108, G)
  b.onGround('checkpoint', 87)

  // ── Beat 8 · the stone terrace, and the first thing worth looking under.
  //    The slab is held up on two legs; the pocket between them is open to the
  //    street and holds the first Poneglyph fragment. Nothing warns you it is
  //    there — you just have to look at the shape of the building.
  b.ledge(89, 91, G - 2)
  b.hline(92, 100, G - 4, C.solid)
  // The legs stop a tile short of the street, which is what makes the pocket a
  // pocket: at full height they sealed it on all four sides and the fragment
  // could not be reached at all. A crouch clears a one-tile gap, so you duck
  // under the terrace and stand up inside.
  b.rect(92, G - 3, 93, G - 2, C.solid)
  b.rect(99, G - 3, 100, G - 2, C.solid)
  b.rect(94, G - 3, 98, G - 3, C.decor)
  b.spawn('fragment', 96, G - 1, { index: 0 })
  b.spawn('shielder', 97, G - 5)
  b.berryLine(93, 99, G - 5, 2)
  b.spawn('crab', 104, G - 1)

  // ── Beat 9 · a gap no jump crosses, and the plank that does. The far side
  //    is two tiles lower than this one, so the crossing also drops you into
  //    the next stretch instead of returning you to the same line.
  const shelf = G + 2
  b.pit(109, 121)
  b.ground(122, 140, shelf)
  b.spawn('platform', 115, G - 1, { spanX: 96, spanY: 0, period: 4.2, width: 46 })
  b.spawn('berry', 115, G - 4)
  b.spawn('berry', 118, G - 5)

  // ── Beat 10 · spikes on the low shelf, a safe road above them, bats over
  //    both — the first time the level asks which of two routes you want.
  b.spikes(128, 131, shelf - 1)
  b.ledge(126, 133, shelf - 4)
  b.spawn('bat', 127, shelf - 8)
  b.spawn('bat', 136, shelf - 7)
  b.berryLine(126, 133, shelf - 5, 2)

  // ── Beat 11 · the windmill, on the headland above the shelf. The set piece:
  //    a tower with a ladder up the inside, a deck at the top, and the second
  //    fragment on it. The stage does not need you to climb it.
  b.stepUp(141, shelf, 2, 2)
  const mill = tower(b, 145, 149, G, 6)
  b.spawn('fragment', 147, mill.deck - 1, { index: 1 })
  b.spawn('berry', 145, mill.deck - 1)
  b.spawn('berry', 149, mill.deck - 1)
  b.spawn('bat', 152, 8)
  // The sail mast beside it: a line from the ground to a nest above the deck.
  rigging(b, 155, G, 5)
  b.spawn('oneup', 155, 4)

  // ── Beat 12 · the village, on a terrace above the mill yard. Roofs are a
  //    second road, and the houses have crates against them so the roof is
  //    always three hops away.
  b.ground(145, 158, G)
  const street = G - 2
  b.ground(159, 187, street)
  b.spawn('checkpoint', 162, street - 1)
  for (const x of [165, 174, 183]) {
    shack(b, x, x + 5, street, 3)
    crates(b, x - 1, street, 2)
    b.spawn('grunt', x + 3, street - 4)
    b.berryLine(x + 1, x + 4, street - 5, 1)
  }
  b.spawn('shielder', 171, street - 1)
  b.spawn('crab', 180, street - 1)
  b.spawn('fruit', 186, street - 3, { tier: 'gear2' })
  // The village ends where the cliff does.
  b.descend(188, street, 2)
  b.ground(190, 190, G)

  // ── Beat 13 · the twist: the lift that goes higher than you need it to.
  //    The main road is on the ground. The platform's top swing reaches a ledge
  //    nobody asked you to visit.
  b.pit(191, 195)
  b.spawn('platform', 193, G - 2, { spanX: 0, spanY: 72, period: 3.4, width: 44 })
  b.ledge(191, 195, G - 8)
  b.spawn('fragment', 193, G - 9, { index: 2 })
  b.berryLine(191, 195, G - 9, 2)

  // ── Beat 14 · the pier.
  b.ground(196, 205, G)
  b.spawn('grunt', 201, G - 1)
  b.water(206, W - 1, G + 1, G + 3)
  bridge(b, 206, 219, G)
  b.spawn('goal', 214, G - 1)
  b.berryLine(207, 213, G - 2, 2)

  return {
    id: 'east-blue-1',
    name: 'Villa Fuchsia',
    biome: 'east-blue',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 320,
    music: 'overworld',
    weather: 'clear',
    timeOfDay: 0.08,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1-2 · El Baratie
// ─────────────────────────────────────────────────────────────────────────────

function buildBaratie(): LevelDef {
  const W = 240
  const H = 24
  const SEA = 17 // water surface
  const FLOOR = 21 // sea bed
  const DECK = 15 // the main deck of the restaurant
  const b = new LevelBuilder(W, H)

  // The whole stage floats. Water everywhere under the boards, a sea bed deep
  // enough to swim over, and urchins on it so the water is a cost and not a
  // safety net.
  b.water(0, W - 1, SEA, FLOOR)

  // ── Beat 1 · the jetty out from shore. Solid ground for twelve tiles, then
  //    boards.
  b.ground(0, 13, DECK)
  b.berryLine(2, 10, DECK - 1, 3)
  b.spawn('grunt', 11, DECK - 1)

  bridge(b, 14, 20, DECK)
  bridge(b, 24, 30, DECK)
  b.spawn('fishman', 27, DECK - 1)
  b.berryArc(20, DECK - 2, 4, 3)

  // ── Beat 2 · the first deck of the ship-restaurant, and the first ladder.
  //    The ladder passes *through* the deck it serves and stands two tiles
  //    proud of it, so letting go at the top drops you onto boards.
  b.ground(34, 58, DECK)
  b.spawn('checkpoint', 36, DECK - 1)
  b.ledge(38, 52, DECK - 5)
  b.ladder(40, DECK - 5, DECK - 1)
  b.berryLine(42, 50, DECK - 6, 2)
  b.spawn('crab', 46, DECK - 1)
  b.spawn('grunt', 49, DECK - 6)
  b.spawn('barrel', 55, DECK - 1)

  // ── Beat 3 · galley windows. A second storey, reached by a ladder, with a
  //    fragment tucked in the corner of the lower one — visible from the deck
  //    only if you look up before you climb.
  b.ledge(44, 56, DECK - 10)
  b.ladder(50, DECK - 10, DECK - 6)
  b.spawn('fragment', 46, DECK - 11, { index: 0 })
  b.spawn('bat', 50, DECK - 14)

  // ── Beat 4 · out of the hull and into open water. Planks with holes in them.
  b.clear(59, 63, 0, SEA - 1)
  bridge(b, 64, 70, DECK + 1)
  b.clear(71, 76, 0, SEA - 1)
  bridge(b, 77, 83, DECK + 1)
  b.spawn('urchin', 61, FLOOR - 1)
  b.spawn('urchin', 74, FLOOR - 1)
  b.spawn('fishman', 68, DECK)
  b.berryLine(65, 69, DECK, 2)
  b.berryLine(78, 82, DECK, 2)

  // ── Beat 5 · the kitchen: crates, a low ceiling, and a shielder you cannot
  //    jump over — you have to come at it from the side or wait it out.
  b.ground(84, 116, DECK)
  b.hline(84, 116, DECK - 6, C.solid)
  b.rect(84, DECK - 5, 116, DECK - 5, C.decor)
  crates(b, 88, DECK, 3)
  crates(b, 89, DECK, 1)
  b.spawn('shielder', 98, DECK - 1)
  b.spawn('shielder', 108, DECK - 1)
  b.spawn('meat', 92, DECK - 2)
  b.berryLine(94, 114, DECK - 2, 4)
  b.spawn('checkpoint', 113, DECK - 1)

  // ── Beat 6 · the rigging. Climb out of the kitchen, over the roof, and the
  //    crow's nest is worth the detour.
  b.ground(117, 130, DECK)
  b.hline(117, 130, DECK - 6, C.solid)
  b.ladder(118, DECK - 6, DECK - 1)
  rigging(b, 124, DECK - 6, DECK - 13)
  b.spawn('fragment', 124, DECK - 14, { index: 1 })
  b.spawn('bat', 128, DECK - 12)
  b.berryLine(120, 128, DECK - 7, 2)

  // ── Beat 7 · the flooded hold. Swim it, or hop the crates that stick out.
  b.clear(131, 158, 0, SEA - 3)
  b.water(131, 158, SEA - 2, FLOOR)
  for (const x of [134, 141, 148, 155]) {
    b.rect(x, SEA - 3, x + 1, SEA, C.solid)
    b.spawn('berry', x, SEA - 4)
  }
  b.spawn('fishman', 138, SEA - 1)
  b.spawn('fishman', 152, SEA - 1)
  b.spawn('urchin', 145, FLOOR - 1)
  b.spawn('urchin', 157, FLOOR - 1)

  // ── Beat 8 · the twist. Planks that give way, over deep water, with the
  //    crossing timed so standing still costs you the plank.
  b.ground(159, 168, DECK)
  b.spawn('fruit', 163, DECK - 3, { tier: 'gear2' })
  bridge(b, 169, 186, DECK, true)
  b.spawn('bat', 174, DECK - 5)
  b.spawn('bat', 182, DECK - 4)
  b.berryLine(170, 186, DECK - 2, 3)

  // ── Beat 9 · the last deck, and the third fragment under the stern where
  //    the boards run out.
  b.ground(187, 214, DECK)
  b.spawn('checkpoint', 190, DECK - 1)
  b.ledge(196, 206, DECK - 5)
  b.ladder(198, DECK - 5, DECK - 1)
  b.rect(203, DECK - 4, 206, DECK - 4, C.decor)
  b.spawn('fragment', 205, DECK - 4, { index: 2 })
  b.spawn('crab', 200, DECK - 1)
  b.spawn('grunt', 210, DECK - 1)
  b.spawn('oneup', 202, DECK - 6)

  // ── Beat 10 · the mooring.
  b.clear(215, 219, 0, SEA - 1)
  b.ground(220, W - 1, DECK)
  b.spawn('goal', 230, DECK - 1)
  b.berryLine(222, 234, DECK - 1, 3)

  return {
    id: 'east-blue-2',
    name: 'El Baratie',
    biome: 'east-blue',
    w: W,
    h: H,
    startX: 3,
    startY: DECK - 1,
    timeLimit: 340,
    music: 'overworld',
    weather: 'clear',
    timeOfDay: 0.42,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1-3 · Carpa del Payaso — boss stage
// ─────────────────────────────────────────────────────────────────────────────

function buildCircus(): LevelDef {
  const W = 200
  const H = 22
  const G = 16
  const b = new LevelBuilder(W, H)

  b.ground(0, W - 1, G)

  // ── The approach. A boss stage still has to be a stage: the walk in is
  //    short, dense and made of the things the island already taught, so the
  //    fight is not the first thing you do after the title card.
  b.berryLine(2, 12, G - 1, 3)
  b.spawn('grunt', 14, G - 1)
  b.spawn('grunt', 18, G - 1)
  b.pit(22, 26)
  b.berryArc(22, G - 2, 4, 3)
  b.ground(27, 60, G)
  crates(b, 30, G, 2)
  crates(b, 31, G, 3)
  b.spawn('shielder', 38, G - 1)
  b.ledge(34, 44, G - 4)
  b.berryLine(35, 43, G - 5, 2)
  b.spawn('bat', 40, G - 8)
  b.spawn('checkpoint', 47, G - 1)
  b.spawn('crab', 52, G - 1)
  b.spawn('barrel', 57, G - 1)

  // ── The tent poles. Three striped masts with rigging between them; the
  //    first fragment is on the highest line.
  b.pit(61, 66)
  b.ground(67, 120, G)
  b.spawn('platform', 63, G - 2, { spanX: 0, spanY: 56, period: 3, width: 44 })
  //    Poles every eight tiles, so the guy-lines between them are two-tile
  //    hops: a traverse that reads as high and difficult but is not a gauntlet.
  for (const [x, top] of [[70, G - 6], [78, G - 8], [86, G - 9], [94, G - 7]] as const) {
    b.vline(x, top + 1, G - 1, C.decor)
    b.ledge(x - 3, x + 3, top)
    b.spawn('berry', x, top - 1)
  }
  b.ladder(70, G - 6, G - 1)
  b.spawn('fragment', 86, G - 10, { index: 0 })
  b.spawn('bat', 82, G - 12)
  b.spawn('bat', 91, G - 13)
  b.spawn('grunt', 106, G - 1)
  b.spawn('shielder', 114, G - 1)

  // ── The cannon battery. Barrels rolling in from the right, spikes between
  //    them, and the second fragment behind the far crate stack.
  b.spikes(124, 126, G - 1)
  b.ledge(122, 128, G - 4)
  b.ground(121, 150, G)
  b.spawn('barrel', 133, G - 1)
  b.spawn('barrel', 141, G - 1)
  crates(b, 145, G, 4)
  crates(b, 146, G, 2)
  b.spawn('fragment', 147, G - 5, { index: 1 })
  b.spawn('meat', 138, G - 5)
  b.spawn('checkpoint', 149, G - 1)

  // ── The ring. Flat, walled at the far end, wide enough to run a boss
  //    pattern in and shallow enough that the fight stays on one screen.
  b.ground(151, W - 1, G)
  b.rect(186, G - 6, 187, G - 1, C.solid)
  b.spawn('boss-buggy', 172, G - 1)
  b.spawn('meat', 156, G - 4)
  b.berryLine(154, 182, G - 6, 4)

  // ── Past the ring: the tent's back door, up over the wall.
  b.ledge(183, 190, G - 6)
  b.spawn('fragment', 189, G - 7, { index: 2 })
  b.ground(188, W - 1, G - 3)
  b.spawn('goal', 194, G - 4)

  return {
    id: 'east-blue-3',
    name: 'Carpa del Payaso',
    biome: 'east-blue',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 300,
    music: 'boss',
    weather: 'clear',
    timeOfDay: 0.62,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

export const eastBlue1 = buildVillaFuchsia()
export const eastBlue2 = buildBaratie()
export const eastBlue3 = buildCircus()
