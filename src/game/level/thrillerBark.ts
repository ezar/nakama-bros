import type { LevelDef } from '../../types'
import { C, LevelBuilder } from './builder'
import { bridge, crates, deadTree, stones, tower } from './props'

/**
 * Thriller Bark — the island under a full moon.
 *
 * Everything here is rotten: the branches you cross give way, the floors of the
 * mansion give way, and the only things that hold are stone. The island is also
 * the campaign's first true night, so its levels are built with more vertical
 * separation than usual — what you cannot see below you, you have to commit to.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 5-1 · Bosque de Sombras
// ─────────────────────────────────────────────────────────────────────────────

function buildForest(): LevelDef {
  const W = 244
  const H = 26
  const G = 18
  const b = new LevelBuilder(W, H)

  // ── Beat 1 · the shore of the island. Gravestones for cover, a bat before
  //    anything else, so the vocabulary of the world is set immediately.
  b.ground(0, 30, G)
  stones(b, 4, 18, G, 7)
  b.berryLine(2, 16, G - 3, 3)
  b.spawn('bat', 12, G - 6)
  b.onGround('grunt', 24)
  b.spawn('barrel', 28, G - 1)

  // ── Beat 2 · the first trees. Branches at heights that make a road above
  //    the ground, and a road on the ground that is shorter but has things on
  //    it.
  b.ground(31, 76, G)
  deadTree(b, 34, G, 8)
  deadTree(b, 42, G, 11)
  deadTree(b, 50, G, 8)
  b.onGround('shielder', 38)
  b.onGround('crab', 46)
  b.spawn('bat', 44, G - 13)
  b.berryLine(35, 53, G - 9, 3)
  b.onGround('checkpoint', 56)

  // ── Beat 3 · the rotten canopy. The same road, one storey up, made of
  //    branches that will not hold: the island's mechanic, taught over ground
  //    you land on rather than a pit you do not.
  bridge(b, 58, 76, G - 6, true)
  b.berryLine(59, 75, G - 8, 3)
  b.spawn('bat', 66, G - 11)
  b.spawn('urchin', 70, G - 1)

  // ── Beat 4 · the ravine. A real drop, three trunks standing in it, and the
  //    first fragment on the lowest one, below the line of the crossing.
  b.pit(77, 108)
  for (const [x, top] of [[82, G - 2], [90, G - 4], [98, G - 3], [104, G - 1]] as const) {
    b.rect(x, top + 1, x + 1, H - 1, C.solid)
    b.ledge(x - 1, x + 2, top)
  }
  b.spawn('fragment', 82, G - 3, { index: 0 })
  b.spawn('bat', 86, G - 9)
  b.spawn('bat', 94, G - 10)
  b.berryLine(89, 92, G - 6, 1)
  b.ground(109, 150, G)

  // ── Beat 5 · the fog bank. Ground that steps, a shielder on every step, and
  //    nothing above to escape onto.
  b.terrain(109, [[10, G], [8, G - 2], [10, G], [8, G - 1], [6, G + 2]])
  b.onGround('shielder', 114)
  b.onGround('shielder', 128)
  b.onGround('grunt', 136)
  b.spawn('meat', 122, G - 5)
  b.berryLine(110, 148, G - 4, 4)

  // ── Beat 6 · the great tree. The set piece: a trunk with a ladder up it and
  //    branches on both sides, the second fragment out on the limb that hangs
  //    over the ravine.
  b.ground(151, 190, G)
  const t = tower(b, 158, 164, G, G - 12)
  b.ledge(151, 157, G - 5)
  b.ledge(165, 172, G - 8)
  b.ledge(174, 180, G - 4)
  b.spawn('fragment', 170, G - 9, { index: 1 })
  b.spawn('oneup', 161, t.deck - 1)
  b.spawn('bat', 168, G - 14)
  b.spawn('bat', 178, G - 9)
  b.berryLine(166, 171, G - 10, 2)
  b.onGround('checkpoint', 184)

  // ── Beat 7 · the graveyard gate. Crumbling ground over a real pit, with the
  //    third fragment under the one slab that holds.
  //    Falling through the planks is not the failure here — it is the route:
  //    the ledge under the bridge is where the fragment is, and the ladder at
  //    its end is the only way back up.
  b.pit(191, 214)
  bridge(b, 191, 202, G, true)
  b.ledge(195, 201, G + 4)
  b.spawn('fragment', 197, G + 3, { index: 2 })
  b.ladder(201, G, G + 3)
  b.spawn('bat', 198, G - 5)
  b.berryLine(192, 200, G - 3, 3)
  b.ledge(204, 209, G - 1)
  b.ledge(211, 214, G - 2)

  // ── Beat 8 · the mansion gate.
  b.ground(215, W - 1, G)
  crates(b, 220, G, 3)
  b.onGround('shielder', 228)
  b.spawn('goal', 238, G - 1)
  b.berryLine(230, 236, G - 1, 2)

  return {
    id: 'thriller-bark-1',
    name: 'Bosque de Sombras',
    biome: 'thriller-bark',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 360,
    music: 'ghost',
    weather: 'clear',
    timeOfDay: 1,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5-2 · Mansión de Moria
// ─────────────────────────────────────────────────────────────────────────────

function buildMansion(): LevelDef {
  const W = 252
  const H = 28
  const b = new LevelBuilder(W, H)

  // The stage is the inside of a house, so the walls are real: everything is
  // masonry with rooms cut out of it, and `decor` is the fill behind the rooms
  // — the one place it belongs, and the reason a doorway reads as a doorway
  // rather than as a hole punched through to the night sky.
  b.rect(0, 6, W - 1, H - 1, C.decor)

  /** A floor of the house: a room with a stone floor and an open front. */
  const floor = (x0: number, x1: number, y: number, height = 5) => {
    b.clear(x0, y - height, x1, y - 1)
    b.hline(x0, x1, y, C.solid)
    b.rect(x0, y + 1, x1, y + 1, C.solid)
  }

  // ── Beat 1 · the hall. Long, empty, and lit only at the ends, with the
  //    chandeliers overhead announcing that this level has an upstairs.
  b.clear(0, 0, W - 1, 5)
  floor(0, 46, 21, 8)
  b.berryLine(3, 15, 20, 3)
  b.onGround('grunt', 20, undefined, 21)
  b.onGround('shielder', 32, undefined, 21)
  b.ledge(10, 16, 16)
  b.ledge(24, 30, 14)
  b.ledge(38, 44, 16)
  b.berryLine(25, 29, 12, 2)
  b.spawn('bat', 20, 12)
  b.spawn('bat', 36, 11)
  b.onGround('checkpoint', 6, undefined, 21)

  // ── Beat 2 · the stair. Two ladders offset, so the climb crosses the room
  //    rather than running up one wall.
  floor(47, 70, 21, 14)
  b.ledge(47, 62, 15)
  b.ledge(60, 70, 11)
  b.ladder(52, 15, 20)
  b.ladder(60, 11, 14)
  b.spawn('fragment', 49, 10, { index: 0 })
  b.ledge(47, 52, 11)
  b.berryLine(61, 69, 9, 2)
  b.spawn('bat', 58, 13)
  b.spawn('grunt', 66, 10)

  // ── Beat 3 · the gallery. A floor that gives way over a drop into the
  //    cellar, which is survivable and slow — the punishment for rushing here
  //    is losing the height you climbed.
  b.clear(71, 7, 104, 20)
  b.hline(71, 104, 21, C.solid)
  bridge(b, 72, 90, 11, true)
  b.ledge(93, 104, 11)
  b.spawn('urchin', 80, 20)
  b.spawn('urchin', 96, 20)
  b.berryLine(73, 89, 9, 3)
  b.spawn('bat', 86, 7)
  b.onGround('checkpoint', 100, undefined, 11)

  // ── Beat 4 · the spike cellar. If the gallery dropped you, this is where
  //    you land, and the way back up is a ladder at the far end.
  b.spikes(76, 78, 20)
  b.spikes(86, 88, 20)
  b.ladder(102, 11, 20)
  b.berryLine(72, 100, 19, 4)

  // ── Beat 5 · the ballroom. Chandeliers on a vertical swing, over a floor
  //    that is not there.
  b.clear(105, 7, 148, H - 1)
  b.ledge(105, 113, 11)
  b.spawn('platform', 118, 12, { spanX: 0, spanY: 72, period: 3.4, width: 46 })
  b.ledge(124, 132, 14)
  b.spawn('platform', 137, 11, { spanX: 0, spanY: 72, period: 4.2, width: 46 })
  b.ledge(142, 150, 13)
  b.spawn('bat', 121, 8)
  b.spawn('bat', 134, 9)
  b.berryLine(106, 112, 9, 2)
  b.berryLine(125, 131, 12, 2)
  b.spawn('fruit', 145, 12, { tier: 'gear3' })

  // ── Beat 6 · the portrait wall. A room you cross on picture rails, with the
  //    second fragment behind the one panel set back into the wall.
  floor(151, 190, 21, 12)
  b.ledge(151, 158, 13)
  b.ledge(162, 170, 16)
  b.ledge(174, 182, 13)
  b.rect(184, 14, 190, 16, C.decor)
  b.spawn('fragment', 187, 16, { index: 1 })
  b.hline(184, 190, 13, C.solid)
  b.spawn('shielder', 166, 15)
  b.spawn('grunt', 178, 12)
  b.berryLine(163, 169, 14, 2)
  b.spawn('bat', 176, 9)

  // ── Beat 7 · the tower stair. Up the outside of the house, in the open, on
  //    ledges with a long fall under them.
  b.clear(191, 0, 220, H - 1)
  b.ledge(191, 198, 20)
  b.ledge(200, 206, 17)
  b.ledge(208, 214, 14)
  b.ledge(216, 222, 11)
  b.spawn('bat', 204, 13)
  b.spawn('bat', 212, 10)
  b.berryLine(192, 197, 18, 2)
  b.berryLine(209, 213, 12, 2)

  // ── Beat 8 · the roof, the moon, and the third fragment on the chimney the
  //    path runs past.
  b.clear(221, 0, W - 1, H - 1)
  b.ground(223, W - 1, 12)
  b.rect(230, 9, 232, 11, C.solid)
  b.spawn('fragment', 231, 8, { index: 2 })
  b.onGround('shielder', 238, undefined, 12)
  b.spawn('goal', 246, 11)
  b.berryLine(234, 244, 11, 2)

  return {
    id: 'thriller-bark-2',
    name: 'Mansión de Moria',
    biome: 'thriller-bark',
    w: W,
    h: H,
    startX: 3,
    startY: 20,
    timeLimit: 400,
    music: 'ghost',
    weather: 'clear',
    timeOfDay: 0.95,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

export const thrillerBark1 = buildForest()
export const thrillerBark2 = buildMansion()
