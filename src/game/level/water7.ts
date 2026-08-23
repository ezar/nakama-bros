import type { LevelDef } from '../../types'
import { C, LevelBuilder } from './builder'
import { arches, bridge, crates, rigging, shack, tower } from './props'

/**
 * Water 7 — the city on the canals, in the rain.
 *
 * The island's mechanic is wet stone: quays surfaced in ice, where stopping is
 * something you plan two tiles ahead. 4-1 puts that on solid streets beside
 * water you can swim in. 4-2 puts it on a trestle over open sea.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 4-1 · Canales de Agua 7
// ─────────────────────────────────────────────────────────────────────────────

function buildCanals(): LevelDef {
  const W = 248
  const H = 24
  const G = 16
  const b = new LevelBuilder(W, H)

  // ── Beat 1 · the wharf. Dry stone, crates, and a Marine patrol.
  b.ground(0, 26, G)
  b.berryLine(2, 12, G - 1, 3)
  crates(b, 15, G, 2)
  crates(b, 16, G, 3)
  b.onGround('grunt', 21)
  b.spawn('barrel', 24, G - 1)

  // ── Beat 2 · the first canal. Wide enough to swim, shallow enough to climb
  //    out of either side, with a plank across it that stops halfway.
  b.water(27, 40, G, G + 5)
  bridge(b, 27, 33, G - 3)
  b.spawn('fishman', 37, G - 1)
  b.berryLine(28, 32, G - 5, 2)
  b.spawn('berry', 36, G + 2)
  b.ground(41, 66, G)

  // ── Beat 3 · wet stone. A long quay surfaced in ice, ending at a gap: the
  //    lesson is that on this island you brake early.
  b.ice(44, 60, G, G)
  b.onGround('checkpoint', 43)
  b.onGround('crab', 52)
  b.berryLine(45, 59, G - 2, 3)
  b.pit(61, 65)
  b.ground(66, 67, G)
  b.berryArc(61, G - 2, 5, 3)

  // ── Beat 4 · the aqueduct. The road goes over the top — up the ladder on
  //    the near abutment — and the first fragment hangs under the second arch,
  //    where the road cannot see it and the canal below can.
  arches(b, 68, 96, G - 6, G - 1, 9)
  b.water(69, 95, G, G + 5)
  b.ladder(67, G - 6, G - 1)
  b.spawn('fragment', 83, G - 1, { index: 0 })
  b.berryLine(70, 94, G - 8, 4)
  b.spawn('bat', 76, G - 11)
  b.spawn('bat', 90, G - 10)
  b.spawn('urchin', 86, G + 4)
  b.ladder(97, G - 6, G - 1)
  b.ground(97, 128, G)

  // ── Beat 5 · the shipyard. A half-built hull: ribs of timber at rising
  //    heights, with the keel below them and nothing between.
  b.pit(100, 124)
  b.water(100, 124, G + 1, G + 5)
  for (let i = 0; i < 6; i++) {
    const x = 101 + i * 4
    b.ledge(x, x + 2, G - 2 - i)
    b.spawn('berry', x + 1, G - 4 - i)
  }
  b.spawn('platform', 118, G - 8, { spanX: 0, spanY: 64, period: 3.6, width: 46 })
  b.spawn('fishman', 112, G)
  b.onGround('checkpoint', 126)

  // ── Beat 6 · the stacked houses. Roofs above the street, a ladder up the
  //    side of the tallest, and the second fragment on the one roof the ladder
  //    does not reach — you get there by dropping onto it from above.
  b.ground(129, 176, G)
  shack(b, 132, 138, G, 3)
  shack(b, 142, 148, G, 5)
  shack(b, 152, 160, G, 8)
  b.ladder(150, G - 8, G - 1)
  b.spawn('fragment', 145, G - 6, { index: 1 })
  b.berryLine(153, 159, G - 9, 2)
  b.onGround('shielder', 166)
  b.onGround('grunt', 172)
  b.spawn('bat', 156, G - 13)
  b.spawn('fruit', 170, G - 3, { tier: 'gear3' })

  // ── Beat 7 · the waterwheel. A lift on a long vertical swing, over a canal
  //    with urchins on the bed, and a tower on the far bank.
  b.water(177, 196, G, G + 5)
  b.spawn('platform', 186, G - 4, { spanX: 0, spanY: 88, period: 4.2, width: 46 })
  b.spawn('urchin', 182, G + 4)
  b.spawn('urchin', 192, G + 4)
  b.ledge(180, 184, G - 6)
  b.ledge(190, 194, G - 9)
  b.berryLine(181, 183, G - 8, 1)
  b.ground(197, W - 1, G)

  // ── Beat 8 · the crane. A tower with a line off its deck, and the third
  //    fragment at the top of the line: the highest point of the stage, and
  //    entirely optional.
  const crane = tower(b, 200, 206, G, G - 9)
  rigging(b, 210, G, G - 13)
  b.spawn('fragment', 210, G - 14, { index: 2 })
  b.spawn('oneup', 203, crane.deck - 1)
  b.spawn('bat', 214, G - 12)
  b.berryLine(201, 205, crane.deck - 2, 2)

  // ── Beat 9 · the station approach.
  b.onGround('shielder', 222)
  b.pit(226, 230)
  b.berryArc(226, G - 2, 4, 3)
  b.ground(231, W - 1, G)
  b.spawn('goal', 242, G - 1)

  return {
    id: 'water7-1',
    name: 'Canales de Agua 7',
    biome: 'water7',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 360,
    music: 'overworld',
    weather: 'rain',
    timeOfDay: 0.22,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4-2 · El Tren Marino
// ─────────────────────────────────────────────────────────────────────────────

function buildSeaTrain(): LevelDef {
  const W = 264
  const H = 22
  const RAIL = 11 // the trestle deck
  const SEA = 16
  const b = new LevelBuilder(W, H)

  // The sea runs the length of the stage. Falling off the rails is not fatal —
  // it is slow, and there is something down there — which is the right cost for
  // a stage whose whole subject is momentum.
  b.water(0, W - 1, SEA, H - 2)

  // ── Beat 1 · the platform at Water 7. Solid, lit, and the last flat ground
  //    for a hundred tiles.
  b.ground(0, 22, RAIL)
  b.berryLine(2, 14, RAIL - 1, 3)
  crates(b, 18, RAIL, 2)
  b.onGround('grunt', 20)

  // ── Beat 2 · onto the rails. The trestle is ice, because it is raining and
  //    because that is the joke of the island.
  b.hline(23, 58, RAIL, C.ice)
  for (let x = 24; x <= 58; x += 8) b.rect(x, RAIL + 1, x + 1, SEA, C.solid)
  b.onGround('crab', 34)
  b.onGround('grunt', 46)
  b.berryLine(25, 57, RAIL - 2, 4)
  b.onGround('checkpoint', 30)
  b.spawn('bat', 40, RAIL - 5)

  // ── Beat 3 · a gap in the rails, and the first fragment under the break —
  //    on the sleeper below, in plain sight of anyone who looks down before
  //    jumping.
  b.pit(59, 64, 0)
  b.water(59, 64, SEA, H - 2)
  b.ledge(60, 63, RAIL + 4)
  b.spawn('fragment', 61, RAIL + 3, { index: 0 })
  b.spawn('urchin', 63, H - 3)
  b.hline(65, 92, RAIL, C.ice)
  for (let x = 66; x <= 92; x += 8) b.rect(x, RAIL + 1, x + 1, SEA, C.solid)
  b.spawn('fishman', 78, RAIL - 1)
  b.berryLine(66, 90, RAIL - 2, 4)

  // ── Beat 4 · the train. Three carriages in series, running on their own
  //    timings: the crossing is a matter of waiting for the right one and then
  //    not stopping.
  b.pit(93, 140, 0)
  b.water(93, 140, SEA, H - 2)
  b.spawn('platform', 100, RAIL, { spanX: 96, spanY: 0, period: 4, width: 64 })
  b.spawn('platform', 116, RAIL - 3, { spanX: 96, spanY: 0, period: 4.6, width: 64 })
  b.spawn('platform', 132, RAIL, { spanX: 96, spanY: 0, period: 3.4, width: 64 })
  b.berryLine(96, 138, RAIL - 4, 6)
  b.spawn('bat', 108, RAIL - 6)
  b.spawn('bat', 126, RAIL - 7)
  b.spawn('urchin', 120, H - 3)

  // ── Beat 5 · a signal gantry. Solid ground, a climb, and the second
  //    fragment on the arm that overhangs the sea.
  b.hline(141, 168, RAIL, C.solid)
  b.rect(141, RAIL + 1, 168, RAIL + 1, C.solid)
  b.onGround('checkpoint', 144)
  const mast = tower(b, 150, 156, RAIL, RAIL - 8)
  b.ledge(157, 163, mast.deck)
  b.spawn('fragment', 162, mast.deck - 1, { index: 1 })
  b.spawn('meat', 153, mast.deck - 1)
  b.onGround('shielder', 166)
  b.spawn('bat', 160, RAIL - 9)

  // ── Beat 6 · the storm stretch. Rails that give way, over sea, with the
  //    spacing tight enough that stopping is not an option.
  b.pit(169, 200, 0)
  b.water(169, 200, SEA, H - 2)
  bridge(b, 169, 186, RAIL, true)
  b.ledge(188, 192, RAIL - 2)
  bridge(b, 194, 200, RAIL, true)
  b.spawn('fishman', 182, RAIL - 1)
  b.spawn('fishman', 197, RAIL - 1)
  b.berryLine(170, 200, RAIL - 3, 5)

  // ── Beat 7 · the bridge tower, and the third fragment at the bottom of the
  //    pier — reachable only by going down the ladder instead of across.
  b.hline(201, 228, RAIL, C.solid)
  b.rect(210, RAIL + 1, 213, H - 2, C.solid)
  b.clear(214, RAIL + 1, 218, H - 3)
  b.hline(214, 218, H - 2, C.solid)
  b.ladder(214, RAIL, H - 3)
  b.spawn('fragment', 217, H - 3, { index: 2 })
  b.spawn('urchin', 216, H - 3)
  b.berryLine(202, 226, RAIL - 2, 4)
  b.onGround('grunt', 222)
  b.spawn('fruit', 206, RAIL - 3, { tier: 'gear4' })

  // ── Beat 8 · the far station.
  b.pit(229, 234, 0)
  b.water(229, 234, SEA, H - 2)
  b.spawn('platform', 231, RAIL - 1, { spanX: 0, spanY: 48, period: 2.8, width: 46 })
  b.ground(235, W - 1, RAIL)
  b.onGround('shielder', 244)
  b.spawn('goal', 254, RAIL - 1)
  b.berryLine(236, 252, RAIL - 1, 3)

  return {
    id: 'water7-2',
    name: 'El Tren Marino',
    biome: 'water7',
    w: W,
    h: H,
    startX: 3,
    startY: RAIL - 1,
    timeLimit: 380,
    music: 'overworld',
    weather: 'rain',
    timeOfDay: 0.86,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4-3 · El Dique Seco — boss stage
// ─────────────────────────────────────────────────────────────────────────────

function buildDryDock(): LevelDef {
  const W = 206
  const H = 24
  const G = 16
  const b = new LevelBuilder(W, H)

  b.ground(0, W - 1, G)

  // ── The approach. The island's two habits in order: water with something
  //    in it, and a walkway over the water that is narrower than it looks.
  b.berryLine(2, 12, G - 1, 3)
  b.onGround('grunt', 15)
  b.pit(19, 34, 0)
  b.water(19, 34, G + 1, H - 2)
  b.spawn('urchin', 24, H - 3)
  b.spawn('fishman', 29, G + 1)
  b.ledge(20, 25, G - 3)
  b.ledge(28, 33, G - 4)
  b.berryLine(21, 32, G - 5, 3)
  b.ground(35, 66, G)
  b.onGround('checkpoint', 39)
  b.onGround('shielder', 45)
  b.spawn('bat', 52, G - 6)
  b.spawn('meat', 58, G - 4)

  // ── The gantry. A crane over the dock with the first fragment on its arm,
  //    reached by the ladder rather than by jumping at it.
  const crane = tower(b, 70, 76, G, G - 9)
  b.ledge(77, 84, crane.deck)
  b.spawn('fragment', 82, crane.deck - 1, { index: 0 })
  b.berryLine(71, 75, crane.deck - 2, 2)
  b.ground(67, 104, G)
  b.onGround('grunt', 90)
  b.spawn('bat', 96, crane.deck - 2)
  b.onGround('shielder', 100)

  // ── The flooded dock. Three barges on a long swing, and the second fragment
  //    on the far one — the crossing is a matter of waiting, not of speed.
  b.pit(105, 146, 0)
  b.water(105, 146, G + 1, H - 2)
  b.spawn('platform', 112, G - 1, { spanX: 80, spanY: 0, period: 4, width: 60 })
  b.spawn('platform', 126, G - 4, { spanX: 80, spanY: 0, period: 4.6, width: 60 })
  b.spawn('platform', 140, G - 1, { spanX: 80, spanY: 0, period: 3.6, width: 60 })
  b.berryLine(108, 144, G - 6, 5)
  b.spawn('fragment', 132, G - 8, { index: 1 })
  b.spawn('urchin', 120, H - 3)
  b.spawn('fishman', 136, G + 1)
  b.spawn('bat', 128, G - 10)

  // ── The dock gate, and the last dry ground before the water is the floor.
  b.ground(147, W - 1, G)
  b.onGround('checkpoint', 151)
  b.spawn('meat', 155, G - 4)

  // ── The dry dock itself: the ring, with the sea let back in at the near end
  //    so the fight has a wet corner you do not want to be backed into.
  b.water(157, 162, G + 1, H - 2)
  b.pit(157, 162, 0)
  b.ledge(157, 162, G - 1)
  b.spawn('boss-fishman', 178, G - 1)
  b.rect(190, G - 6, 191, G - 1, C.solid)
  b.berryLine(164, 186, G - 6, 4)

  // ── Past the ring: up the dock wall and out along the rail.
  b.ledge(187, 194, G - 6)
  b.spawn('fragment', 193, G - 7, { index: 2 })
  b.ground(192, W - 1, G - 3)
  b.spawn('goal', 198, G - 4)

  return {
    id: 'water7-3',
    name: 'El Dique Seco',
    biome: 'water7',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 340,
    music: 'boss',
    weather: 'rain',
    timeOfDay: 0.7,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

export const water71 = buildCanals()
export const water72 = buildSeaTrain()
export const water73 = buildDryDock()
