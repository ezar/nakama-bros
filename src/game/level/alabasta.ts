import type { LevelDef } from '../../types'
import { C, LevelBuilder } from './builder'
import { bridge, crates, cutaway, ruinColumn, stones, tower } from './props'

/**
 * Alabasta — dunes, ruins and a city under sand.
 *
 * The island's mechanic is ground that is not to be trusted: sand shelves that
 * give way a beat after you stand on them. 2-1 teaches that in daylight over a
 * drop you survive; 2-2 takes it underground, in the dark, over drops you do
 * not.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 2-1 · Dunas de Erumalu
// ─────────────────────────────────────────────────────────────────────────────

function buildDunes(): LevelDef {
  const W = 252
  const H = 24
  const G = 16
  const b = new LevelBuilder(W, H)

  // ── Beat 1 · the open desert. Dunes that actually roll, so the horizon is
  //    doing something before the level asks anything of the player.
  b.terrain(0, [[14, G], [8, G - 1], [10, G + 1], [12, G]])
  stones(b, 4, 12, G, 3)
  b.berryLine(2, 12, G - 2, 3)
  b.onGround('grunt', 20)
  b.onGround('crab', 33)
  b.berryArc(24, G - 3, 6, 3)

  // ── Beat 2 · sand that gives way, over a dip you survive. This is the whole
  //    island in one sentence, said where getting it wrong costs nothing.
  b.ground(44, 49, G)
  b.ground(50, 62, G + 4)
  bridge(b, 50, 62, G, true)
  b.berryLine(51, 61, G - 2, 2)
  b.onGround('grunt', 57, undefined, G + 1)
  b.ground(63, 84, G)

  // ── Beat 3 · the buried colonnade. Broken columns of an older city, at
  //    heights that make a rhythm, with scorpions between their feet.
  b.onGround('checkpoint', 66)
  for (const [x, h] of [[70, 4], [76, 6], [82, 5], [88, 7], [94, 5]] as const) {
    ruinColumn(b, x, G, h)
  }
  b.ground(85, 110, G)
  b.spawn('urchin', 73, G - 1)
  b.spawn('urchin', 91, G - 1)
  b.berryLine(70, 96, G - 8, 6)
  b.spawn('meat', 88, G - 9)

  // ── Beat 4 · the wadi. The dunes fall away to a dry riverbed; the way out
  //    is a stepped bank, and the first fragment is in the undercut where the
  //    water used to run. You can see the hollow from the rim if you look.
  const bed = b.descend(111, G, 4)
  b.ground(115, 132, bed)
  cutaway(b, 118, bed - 3, 126, bed - 1)
  b.hline(117, 127, bed - 4, C.solid)
  // Open at the bed, or it is not an undercut, it is a sealed box — the walls
  // ran the full height and the fragment was unreachable. Duck in along the
  // riverbed the way the water did.
  b.vline(117, bed - 3, bed - 2, C.solid)
  b.vline(127, bed - 3, bed - 2, C.solid)
  b.spawn('fragment', 122, bed - 1, { index: 0 })
  b.spawn('urchin', 130, bed - 1)
  b.berryLine(119, 125, bed - 1, 2)
  b.stepUp(133, bed, 4, 2)

  // ── Beat 5 · the sand chute. A wide bottomless pit with three shelves in it
  //    that will not hold you, and a lift that will.
  b.ground(141, 152, G)
  b.spawn('platform', 158, G - 3, { spanX: 88, spanY: 0, period: 4.4, width: 46 })
  b.pit(153, 170)
  // The ferry only reaches two thirds of the way across. The rest is a shelf
  // of sand that holds for about as long as it takes to notice it will not.
  b.crumbles(166, 169, G - 4)
  b.berryLine(155, 163, G - 6, 3)
  b.berryLine(166, 169, G - 5, 2)
  b.spawn('bat', 160, G - 9)
  b.ground(171, 200, G)

  // ── Beat 6 · the sandstorm gate. Two towers, a line strung between them,
  //    and the second fragment at the top of the second one — a climb the road
  //    below runs straight past.
  b.onGround('checkpoint', 174)
  const t1 = tower(b, 178, 182, G, G - 8)
  const t2 = tower(b, 190, 194, G, G - 11)
  b.ledge(183, 189, t1.deck)
  b.spawn('fragment', 192, t2.deck - 1, { index: 1 })
  b.spawn('berry', 186, t1.deck - 1)
  b.spawn('bat', 186, t1.deck - 5)
  b.onGround('shielder', 186)
  b.spawn('oneup', 180, t1.deck - 2)

  // ── Beat 7 · cactus row. Spikes on the floor with a clear beat between
  //    them, so the run is a rhythm rather than a wall of hazard.
  for (const x of [203, 209, 215, 221]) {
    b.spikes(x, x + 1, G - 1)
    b.spawn('berry', x + 3, G - 3)
  }
  b.ground(201, 226, G)
  b.spawn('bat', 212, G - 6)
  b.spawn('crab', 218, G - 1)

  // ── Beat 8 · the oasis, and the third fragment under the water.
  b.water(227, 238, G, G + 4)
  bridge(b, 230, 234, G - 3)
  b.spawn('fragment', 232, G + 2, { index: 2 })
  b.spawn('fishman', 236, G - 1)
  b.berryLine(228, 238, G - 4, 3)

  // ── Beat 9 · the road to the capital.
  b.ground(239, W - 1, G)
  crates(b, 242, G, 2)
  b.spawn('goal', 246, G - 1)

    // ── A secret, cut into a dune. Last in the builder on purpose: the terrain
  //    passes above would pave over anything laid down before them.
  b.block(14, 12, 18, 14)
  b.secret(15, 13, 17, 14, 'left')
  b.spawn('fruit', 16, 14)

return {
    id: 'alabasta-1',
    name: 'Dunas de Erumalu',
    biome: 'alabasta',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 340,
    music: 'desert',
    weather: 'sand',
    timeOfDay: 0.16,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-2 · Ruinas de Rainbase
// ─────────────────────────────────────────────────────────────────────────────

function buildRuins(): LevelDef {
  const W = 256
  const H = 28
  const SURF = 8 // the desert floor, at the top of the map
  const b = new LevelBuilder(W, H)

  // The stage is a section through a tomb: the desert is a strip along the top
  // and everything else is rock with rooms cut out of it. `decor` is the fill
  // of that rock, which is the one place it belongs — it is what stops a
  // carved room reading as a hole punched through to the sky.
  b.rect(0, SURF, W - 1, H - 1, C.decor)

  /** Cut a room out of the rock, with a stone floor under it. */
  const room = (x0: number, x1: number, floor: number, height: number) => {
    b.clear(x0, floor - height, x1, floor - 1)
    b.hline(x0, x1, floor, C.solid)
  }

  // ── Beat 1 · the entrance stair, in daylight.
  b.ground(0, 22, SURF + 2)
  b.clear(0, 0, W - 1, SURF + 1)
  stones(b, 5, 15, SURF + 2, 5)
  b.berryLine(3, 12, SURF + 1, 3)
  b.onGround('grunt', 17)

  // ── Beat 2 · down the shaft. A ladder the length of four rooms, with
  //    landings off it — the stage's spine, and the first thing it teaches is
  //    that down is where the level goes.
  room(23, 33, SURF + 2, 3)
  b.clear(23, SURF + 2, 33, 21)
  b.hline(23, 33, 21, C.solid)
  b.ledge(24, 28, 13)
  b.ledge(29, 33, 17)
  b.ladder(26, SURF + 2, 12)
  b.ladder(31, 13, 16)
  b.ladder(26, 17, 20)
  b.spawn('berry', 25, 12)
  b.spawn('berry', 31, 16)
  b.onGround('checkpoint', 30, undefined, 21)
  b.spawn('bat', 28, 15)

  // ── Beat 3 · the flooded cistern. Deep enough to swim, with urchins on the
  //    bottom and a fragment in the alcove you can only see once you are in
  //    the water.
  room(34, 62, 21, 8)
  b.water(36, 60, 17, 21)
  b.clear(34, 13, 62, 16)
  b.ledge(40, 46, 15)
  b.ledge(52, 58, 15)
  b.spawn('urchin', 44, 20)
  b.spawn('urchin', 55, 20)
  b.spawn('fishman', 50, 20)
  b.clear(59, 18, 62, 20)
  b.spawn('fragment', 61, 20, { index: 0 })
  b.berryLine(41, 45, 14, 2)
  b.berryLine(53, 57, 14, 2)

  // ── Beat 4 · the trap corridor. Spikes on the floor, crates to break the
  //    line of sight, and a low ceiling so jumping is not an escape.
  room(63, 96, 21, 5)
  b.spikes(68, 70, 20)
  b.spikes(78, 80, 20)
  b.spikes(88, 89, 20)
  crates(b, 74, 21, 2)
  crates(b, 84, 21, 3)
  b.onGround('shielder', 92, undefined, 21)
  b.spawn('bat', 72, 18)
  b.spawn('bat', 86, 18)
  b.berryLine(65, 95, 19, 5)

  // ── Beat 5 · the collapsing floor. The whole span is sand-over-nothing; the
  //    only solid thing is the rhythm of the crossing.
  b.clear(97, 14, 122, H - 1)
  bridge(b, 97, 122, 20, true)
  b.spawn('platform', 110, 16, { spanX: 0, spanY: 60, period: 3.2, width: 44 })
  b.berryLine(99, 121, 18, 3)
  b.spawn('bat', 106, 15)
  b.spawn('bat', 116, 16)

  // ── Beat 6 · the treasury. Up two storeys of ledges; the second fragment is
  //    behind the topmost one, where the room's ceiling hides it from the
  //    floor.
  room(123, 158, 21, 12)
  b.onGround('checkpoint', 126, undefined, 21)
  b.ledge(126, 136, 17)
  b.ledge(134, 148, 14)
  b.ledge(150, 157, 11)
  b.ladder(131, 17, 20)
  b.ladder(135, 14, 16)
  b.spawn('fragment', 155, 10, { index: 1 })
  b.spawn('fruit', 141, 13, { tier: 'gear3' })
  b.berryLine(127, 133, 16, 2)
  b.berryLine(139, 147, 13, 2)
  b.spawn('grunt', 145, 13)
  b.spawn('shielder', 153, 10)

  // ── Beat 7 · back up to the light, by a shaft with sand pouring down it.
  room(159, 186, 21, 14)
  b.ledge(160, 165, 18)
  b.crumbles(168, 172, 16)
  b.ledge(175, 180, 13)
  b.crumbles(182, 186, 11)
  b.spawn('urchin', 163, 17)
  b.berryLine(168, 172, 15, 2)
  b.berryLine(182, 186, 10, 2)
  b.spawn('bat', 178, 9)

  // ── Beat 8 · the king's chamber, opening on the desert again.
  b.clear(187, 0, W - 1, H - 1)
  b.ground(187, 210, SURF + 3)
  b.rect(187, 9, 210, 10, C.decor)
  b.onGround('meat', 190, undefined, SURF + 3)
  b.onGround('grunt', 196, undefined, SURF + 3)
  b.onGround('crab', 204, undefined, SURF + 3)
  b.berryLine(189, 208, SURF + 2, 3)

  // ── Beat 9 · the last run along the roofs of the capital, and the third
  //    fragment on the one dome the road does not touch.
  b.pit(211, 216)
  b.ground(217, 232, SURF + 3)
  b.ledge(211, 216, SURF)
  b.spawn('fragment', 214, SURF - 1, { index: 2 })
  b.spawn('platform', 214, SURF + 4, { spanX: 0, spanY: 56, period: 3, width: 44 })
  b.onGround('shielder', 226, undefined, SURF + 3)
  b.pit(233, 237)
  b.ground(238, W - 1, SURF + 3)
  b.berryLine(240, 248, SURF + 2, 2)
  b.spawn('goal', 250, SURF + 2)

  return {
    id: 'alabasta-2',
    name: 'Ruinas de Rainbase',
    biome: 'alabasta',
    w: W,
    h: H,
    startX: 3,
    startY: SURF + 1,
    timeLimit: 380,
    music: 'desert',
    weather: 'sand',
    timeOfDay: 0.38,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-3 · El Foso de Arena — boss stage
// ─────────────────────────────────────────────────────────────────────────────

function buildSandPit(): LevelDef {
  const W = 204
  const H = 22
  const G = 16
  const b = new LevelBuilder(W, H)

  b.ground(0, W - 1, G)

  // ── The approach. A boss stage is still a stage, and this one is made of
  //    the two things Alabasta taught: ground that gives way, and shade that
  //    turns out to be a drop.
  stones(b, 7, 14, G, 7)
  b.berryLine(2, 14, G - 2, 3)
  b.onGround('grunt', 16)
  b.pit(20, 26)
  b.ground(27, 58, G)
  bridge(b, 20, 26, G, true)
  b.berryArc(20, G - 2, 6, 3)
  b.onGround('crab', 32)
  ruinColumn(b, 37, G, 4)
  ruinColumn(b, 42, G, 6)
  b.ledge(38, 46, G - 7)
  b.berryLine(39, 45, G - 8, 2)
  b.spawn('bat', 44, G - 10)
  b.onGround('checkpoint', 50)
  b.onGround('shielder', 55)

  // ── The collapsed colonnade. Four columns of falling height with sand
  //    shelves strung between them, and the first fragment above the last one.
  b.pit(59, 64)
  b.ground(65, 118, G)
  bridge(b, 59, 64, G, true)
  for (const [i, x] of [70, 80, 90, 100].entries()) {
    ruinColumn(b, x, G, 7 - i)
    b.ledge(x - 2, x + 2, G - 8 + i)
  }
  b.berryLine(71, 99, G - 10, 4)
  b.spawn('fragment', 100, G - 6, { index: 0 })
  b.spawn('bat', 76, G - 12)
  b.spawn('bat', 95, G - 11)
  b.onGround('grunt', 108)
  b.spawn('meat', 112, G - 4)

  // ── The spiked cistern. The last thing before the ring, and the only place
  //    on the stage where standing still is worse than moving.
  b.spikes(122, 125, G - 1)
  b.spikes(131, 134, G - 1)
  b.ledge(120, 128, G - 4)
  b.ledge(130, 137, G - 6)
  b.ground(119, 148, G)
  b.berryLine(121, 127, G - 5, 2)
  b.spawn('fragment', 136, G - 7, { index: 1 })
  b.spawn('urchin', 128, G - 1)
  b.onGround('shielder', 143)
  b.onGround('checkpoint', 147)

  // ── The pit itself. Flat, walled at the far end, and wide enough to run a
  //    sandstorm pattern in without the fight leaving the screen.
  b.ground(149, W - 1, G)
  b.rect(188, G - 6, 189, G - 1, C.solid)
  b.spawn('boss-desert', 172, G - 1)
  b.spawn('meat', 154, G - 4)
  b.berryLine(152, 184, G - 6, 4)

  // ── Past the pit: the stair out of the ruin, over the wall.
  b.ledge(185, 192, G - 6)
  b.spawn('fragment', 191, G - 7, { index: 2 })
  b.ground(190, W - 1, G - 3)
  b.spawn('goal', 196, G - 4)

  return {
    id: 'alabasta-3',
    name: 'El Foso de Arena',
    biome: 'alabasta',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 320,
    music: 'boss',
    weather: 'sand',
    timeOfDay: 0.52,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

export const alabasta1 = buildDunes()
export const alabasta2 = buildRuins()
export const alabasta3 = buildSandPit()
