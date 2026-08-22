import type { LevelDef } from '../../types'
import { C, LevelBuilder } from './builder'
import { bridge, rigging, ruinColumn, tiers } from './props'

/**
 * Skypiea — the island above the clouds.
 *
 * Everything here is a floating island, so the ground is never continuous and
 * the drop is always real: this is the first world where the failure state is
 * the whole background rather than a hole in the floor. The island's mechanic
 * is the bouncy cloud, which turns falling into the way up.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 3-1 · Isla de Ángeles
// ─────────────────────────────────────────────────────────────────────────────

function buildAngelIsland(): LevelDef {
  const W = 244
  const H = 26
  const G = 17
  const b = new LevelBuilder(W, H)

  // ── Beat 1 · a landing that is solid, because arriving in a world with no
  //    floor should not also be the moment you learn there is no floor.
  b.ground(0, 22, G)
  b.berryLine(2, 6, G - 1, 2)
  b.berryLine(11, 15, G - 1, 2)
  b.onGround('grunt', 18)
  ruinColumn(b, 8, G, 5)
  b.spawn('berry', 8, G - 7)

  // ── Beat 2 · the first cloud. One bouncy tile, on the ground, with a berry
  //    hanging where the bounce takes you.
  b.ground(23, 34, G)
  b.bouncy(24, 26, G)
  b.berryArc(24, G - 4, 6, 5)
  b.onGround('grunt', 32)

  // ── Beat 3 · the first island chain. Three platforms with sky between them,
  //    the gaps inside a standing jump, and the drop below is the whole sky.
  b.pit(35, W - 1)
  b.ground(35, 43, G)
  b.ledge(48, 55, G - 1)
  b.ledge(60, 68, G - 3)
  b.ledge(73, 82, G - 2)
  b.berryLine(49, 54, G - 3, 2)
  b.berryLine(61, 67, G - 5, 2)
  b.spawn('bat', 57, G - 6)
  b.spawn('bat', 70, G - 8)
  b.onGround('checkpoint', 78, undefined, G - 2)

  // ── Beat 4 · the bounce ladder. Clouds stacked so each one throws you to the
  //    next; the first fragment sits at the top of the throw, above the line
  //    the road takes.
  b.ledge(88, 96, G)
  b.bouncy(90, 94, G)
  b.ledge(98, 106, G - 4)
  b.bouncy(102, 105, G - 4)
  b.ledge(110, 118, G - 8)
  b.bouncy(112, 116, G - 8)
  b.spawn('fragment', 114, G - 14, { index: 0 })
  b.berryLine(111, 117, G - 11, 2)
  b.spawn('bat', 98, G - 10)
  b.spawn('bat', 108, G - 12)

  // ── Beat 5 · the long ferry. Two lifts in series over open sky, with a
  //    perch between them so the crossing has a beat in the middle.
  b.spawn('platform', 128, G - 6, { spanX: 104, spanY: 0, period: 4.6, width: 48 })
  b.ledge(140, 146, G - 6)
  b.spawn('platform', 158, G - 6, { spanX: 104, spanY: 40, period: 5, width: 48 })
  b.berryLine(141, 145, G - 8, 2)
  b.spawn('bat', 134, G - 11)
  b.spawn('bat', 152, G - 9)
  b.spawn('meat', 143, G - 9)

  // ── Beat 6 · the shrine terrace. Solid ground again, and a set of stepped
  //    eaves to climb — the reward for the climb is the view and a life.
  b.ground(170, 200, G)
  b.onGround('checkpoint', 173)
  const top = tiers(b, 184, G, 4, 6)
  b.spawn('oneup', 184, top - 1)
  b.berryLine(179, 189, G - 3, 2)
  b.onGround('shielder', 178)
  b.onGround('grunt', 196)
  b.spawn('fruit', 192, G - 3, { tier: 'gear3' })

  // ── Beat 7 · the waterfall that spills into nothing. A pool with no far
  //    bank: the second fragment is at the bottom of it, and the only way out
  //    is the cloud under the fall.
  b.water(202, 214, G - 2, G + 3)
  b.spawn('fragment', 208, G + 1, { index: 1 })
  b.bouncy(206, 210, G + 3)
  b.spawn('fishman', 212, G + 2)
  b.berryLine(203, 213, G - 4, 3)

  // ── Beat 8 · the rope run. A line of rigging above a bottomless span, with
  //    the third fragment on the highest nest.
  b.ledge(215, 222, G)
  rigging(b, 219, G, G - 9)
  b.spawn('fragment', 219, G - 10, { index: 2 })
  bridge(b, 226, 234, G - 2)
  b.spawn('bat', 230, G - 7)
  b.berryLine(227, 233, G - 4, 2)

  // ── Beat 9 · the gate home.
  b.ground(236, W - 1, G)
  b.spawn('goal', 240, G - 1)

  return {
    id: 'skypiea-1',
    name: 'Isla de Ángeles',
    biome: 'skypiea',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 340,
    music: 'sky',
    weather: 'clear',
    timeOfDay: 0.1,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3-2 · La Campana de Oro
// ─────────────────────────────────────────────────────────────────────────────

function buildGoldenBell(): LevelDef {
  const W = 232
  const H = 30
  const G = 25 // the cloud sea, at the bottom
  const b = new LevelBuilder(W, H)

  // ── Beat 1 · the root of the beanstalk. The stage climbs from the bottom of
  //    the map to the top of it, and it says so in the first ten tiles.
  b.ground(0, 24, G)
  b.berryLine(2, 12, G - 1, 3)
  b.onGround('grunt', 16)
  b.onGround('crab', 21)

  // ── Beat 2 · the stalk. One long line with branches off it, alternating
  //    sides so the climb is a zigzag and not a lift.
  b.pit(25, W - 1)
  b.ground(25, 32, G)
  // The stalk runs the full height of the map, past the last branch, so the
  //    limb above the canopy is something you can actually get to.
  b.vline(29, 2, G - 1, C.climb)
  for (const [y, x0, x1] of [
    [G - 4, 30, 37], [G - 8, 22, 28], [G - 12, 30, 38],
    [G - 16, 21, 28], [G - 19, 30, 36],
  ] as const) {
    b.ledge(x0, x1, y)
    b.berryLine(x0 + 1, x1 - 1, y - 2, 2)
  }
  b.spawn('bat', 34, G - 6)
  b.spawn('bat', 24, G - 14)
  b.spawn('bat', 34, G - 18)
  b.spawn('meat', 25, G - 17)

  // ── Beat 3 · the canopy. Out along the branches at the top of the stalk,
  //    with the first fragment out on the limb that goes nowhere.
  b.ledge(38, 48, G - 21)
  b.ledge(21, 28, G - 22)
  b.spawn('fragment', 24, G - 23, { index: 0 })
  b.onGround('checkpoint', 42, undefined, G - 21)
  b.berryLine(39, 47, G - 23, 2)

  // ── Beat 4 · the sky road. Islands at altitude with clouds between them —
  //    the bounce is now transport rather than a toy.
  b.ledge(54, 62, G - 20)
  b.bouncy(56, 60, G - 20)
  b.ledge(68, 76, G - 16)
  b.ledge(80, 88, G - 18)
  b.bouncy(82, 86, G - 18)
  b.ledge(92, 102, G - 21)
  b.spawn('bat', 66, G - 22)
  b.spawn('bat', 78, G - 14)
  b.berryLine(69, 75, G - 18, 2)
  b.berryLine(93, 101, G - 23, 2)

  // ── Beat 5 · the drop. Deliberately: the road down is faster than the road
  //    along, and a lift at the bottom brings you back up.
  b.ledge(108, 118, G - 8)
  b.spawn('platform', 124, G - 12, { spanX: 0, spanY: 104, period: 5.2, width: 48 })
  b.ledge(130, 140, G - 6)
  b.onGround('checkpoint', 134, undefined, G - 6)
  b.spawn('fruit', 113, G - 9, { tier: 'gear4' })
  b.berryLine(109, 117, G - 10, 2)
  b.spawn('bat', 122, G - 4)

  // ── Beat 6 · the ruined shrine. Broken columns over open sky, at heights
  //    that make a rhythm, and the second fragment under the lowest of them
  //    where nothing suggests looking.
  for (const [x, y] of [[146, G - 6], [154, G - 9], [162, G - 7], [170, G - 10]] as const) {
    b.ledge(x, x + 5, y)
    b.spawn('berry', x + 2, y - 2)
  }
  b.ledge(146, 151, G - 2)
  b.spawn('fragment', 148, G - 3, { index: 1 })
  b.spawn('shielder', 164, G - 8)
  b.spawn('bat', 158, G - 14)

  // ── Beat 7 · the bell tower. Stepped eaves up to the platform the bell
  //    hangs from, and the third fragment on the far side of the swing.
  b.ledge(178, 196, G - 12)
  const bell = tiers(b, 187, G - 12, 4, 7)
  b.spawn('fragment', 187, bell - 1, { index: 2 })
  b.spawn('oneup', 194, G - 15)
  b.spawn('shielder', 182, G - 13)
  b.berryLine(180, 194, G - 15, 3)

  // ── Beat 8 · the last hop, and the way down to the island below.
  b.ledge(202, 210, G - 10)
  b.bouncy(204, 208, G - 10)
  b.ground(214, W - 1, G - 4)
  b.spawn('goal', 224, G - 5)
  b.berryLine(216, 226, G - 6, 2)

  return {
    id: 'skypiea-2',
    name: 'La Campana de Oro',
    biome: 'skypiea',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 400,
    music: 'sky',
    weather: 'clear',
    timeOfDay: 0.24,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

export const skypiea1 = buildAngelIsland()
export const skypiea2 = buildGoldenBell()
