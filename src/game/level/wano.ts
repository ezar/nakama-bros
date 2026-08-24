import type { LevelDef } from '../../types'
import { C, LevelBuilder } from './builder'
import { bridge, crates, gate, rigging, shack, stones, tiers, tower } from './props'

/**
 * Wano — the last island: ink-wash mountains, a volcano, and a fight.
 *
 * The final world asks for everything at once. 6-1 is a road through the
 * country that combines the whole campaign's vocabulary at speed; 6-2 climbs
 * the volcano and is the hardest platforming in the game; 6-3 is the summit.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 6-1 · Camino de Kuri
// ─────────────────────────────────────────────────────────────────────────────

function buildKuri(): LevelDef {
  const W = 256
  const H = 24
  const G = 16
  const b = new LevelBuilder(W, H)

  // ── Beat 1 · the road out of the village, under a gate. Wano opens gently
  //    and then never does again.
  b.terrain(0, [[16, G], [10, G - 1], [13, G]])
  gate(b, 6, 10, G, 5)
  b.berryLine(2, 14, G - 1, 3)
  shack(b, 18, 23, G - 1, 3)
  b.onGround('grunt', 27)
  b.onGround('crab', 33)

  // ── Beat 2 · the frozen river. Ice on the surface, a current of water
  //    under the break in it, and a run-up that will not stop when you want.
  b.ground(39, 92, G)
  b.hline(39, 58, G, C.ice)
  b.berryLine(40, 56, G - 2, 3)
  b.onGround('checkpoint', 42)
  b.water(59, 70, G, G + 5)
  bridge(b, 60, 64, G - 3)
  b.spawn('fishman', 68, G - 1)
  b.spawn('urchin', 66, G + 4)
  b.spawn('berry', 67, G + 2)
  b.hline(71, 92, G, C.ice)
  b.onGround('crab', 80)
  b.onGround('grunt', 88)

  // ── Beat 3 · the torii road. A line of gates whose lintels are a road above
  //    the road, and the first fragment on the tallest of them.
  b.ground(93, 140, G)
  for (let i = 0; i < 5; i++) {
    const x = 96 + i * 8
    const lintel = gate(b, x, x + 4, G, 3)
    b.spawn('berry', x + 2, lintel - 1)
  }
  // The lantern rail over the third gate: two hops off the lintel road, and
  // the first fragment on it.
  b.ledge(118, 124, G - 6)
  b.spawn('fragment', 121, G - 7, { index: 0 })
  b.spawn('meat', 105, G - 6)
  b.onGround('shielder', 108)
  b.spawn('bat', 116, G - 9)
  b.spawn('bat', 134, G - 8)

  // ── Beat 4 · the terraced hillside. Steps up, a run along the top, and the
  //    whole thing falling away on the far side into the gorge.
  b.stepUp(141, G, 3, 3)
  b.ground(150, 168, G - 3)
  stones(b, 152, 158, G - 3, 11)
  b.onGround('grunt', 156, undefined, G - 4)
  b.onGround('shielder', 166, undefined, G - 4)
  b.berryLine(151, 167, G - 6, 3)
  // A well in the terrace floor. Three tiles deep — a hole you fall into and
  // jump out of — and the only thing in the stage that is below the road.
  b.clear(160, G - 3, 163, G - 1)
  b.spawn('fragment', 162, G - 1, { index: 1 })
  b.descend(169, G - 3, 3)
  b.ground(172, 183, G)

  // ── Beat 5 · the gorge. Bottomless, crossed by a lift, with the second
  //    fragment on the pillar the lift passes but does not stop at.
  b.pit(184, 208)
  b.spawn('platform', 196, G - 1, { spanX: 128, spanY: 0, period: 5, width: 48 })
  b.spawn('bat', 190, G - 7)
  b.spawn('bat', 202, G - 8)
  b.berryLine(186, 206, G - 5, 4)
  b.ground(209, W - 1, G)

  // ── Beat 6 · the town. Pagoda roofs as a staircase, lanterns as the trail,
  //    and the third fragment at the top of the tallest roof.
  b.onGround('checkpoint', 212)
  const roof = tiers(b, 224, G, 4, 7)
  b.spawn('fragment', 224, roof - 1, { index: 2 })
  b.spawn('oneup', 231, G - 3)
  b.berryLine(218, 230, G - 3, 3)
  b.onGround('shielder', 216)
  b.onGround('grunt', 234)
  b.spawn('fruit', 238, G - 3, { tier: 'gear4' })

  // ── Beat 7 · the last gate.
  b.pit(241, 245)
  b.berryArc(241, G - 2, 4, 3)
  b.ground(246, W - 1, G)
  b.spawn('goal', 251, G - 1)

    // ── A secret under the terraces. Last in the builder, as everywhere else.
  b.block(174, 13, 178, 15)
  b.secret(175, 14, 177, 15, 'left')
  b.spawn('fruit', 176, 15)

return {
    id: 'wano-1',
    name: 'Camino de Kuri',
    biome: 'wano',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 380,
    music: 'wano',
    weather: 'ash',
    timeOfDay: 0.52,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6-2 · Onigashima
// ─────────────────────────────────────────────────────────────────────────────

function buildOnigashima(): LevelDef {
  const W = 248
  const H = 30
  const G = 25
  const b = new LevelBuilder(W, H)

  // ── Beat 1 · the beach under the skull cliff. The last flat ground.
  b.ground(0, 28, G)
  stones(b, 6, 20, G, 3)
  b.berryLine(2, 18, G - 3, 3)
  b.onGround('grunt', 24)
  b.spawn('bat', 14, G - 7)

  // ── Beat 2 · the cliff stair. Ledges up the face with a bottomless sea
  //    under them: the stage's first statement is that it goes up.
  b.pit(29, 96)
  b.ledge(30, 36, G - 2)
  b.ledge(40, 46, G - 5)
  b.ledge(50, 56, G - 8)
  b.ledge(60, 66, G - 11)
  b.ledge(70, 78, G - 14)
  b.berryLine(31, 35, G - 4, 2)
  b.berryLine(51, 55, G - 10, 2)
  b.spawn('bat', 48, G - 8)
  b.spawn('bat', 64, G - 15)
  b.onGround('checkpoint', 74, undefined, G - 14)

  // ── Beat 3 · the crumbling ledge and the fragment under it. The shelf that
  //    holds is the one nothing is standing on.
  bridge(b, 82, 92, G - 14, true)
  b.ledge(86, 89, G - 10)
  b.spawn('fragment', 87, G - 11, { index: 0 })
  b.spawn('bat', 90, G - 18)
  b.berryLine(83, 91, G - 16, 2)

  // ── Beat 4 · the lava terrace. Solid rock, spikes in the cracks, and a
  //    rhythm of three.
  b.ground(97, 140, G - 14)
  for (const x of [104, 114, 124]) {
    b.spikes(x, x + 2, G - 15)
    b.ledge(x - 1, x + 3, G - 18)
    b.spawn('berry', x + 1, G - 19)
  }
  b.onGround('shielder', 110, undefined, G - 14)
  b.onGround('grunt', 132, undefined, G - 14)
  b.spawn('meat', 136, G - 17)

  // ── Beat 5 · the scaffold. Two towers up the volcano's flank with a line
  //    between them and a lift above.
  b.pit(141, 190)
  b.rect(142, G - 14, 148, H - 1, C.solid)
  const t1 = tower(b, 142, 148, G - 14, G - 18)
  b.ledge(149, 156, t1.deck)
  b.spawn('platform', 164, G - 18, { spanX: 96, spanY: 0, period: 4.4, width: 48 })
  b.ledge(174, 184, G - 18)
  const t2 = tower(b, 178, 184, G - 18, G - 22)
  b.spawn('fragment', 181, t2.deck - 1, { index: 1 })
  b.spawn('bat', 160, G - 21)
  b.spawn('bat', 170, G - 16)
  b.berryLine(150, 155, t1.deck - 2, 2)
  b.onGround('checkpoint', 176, undefined, G - 18)

  // ── Beat 6 · the vent. Cloud-white steam that throws you: the bounce, used
  //    here as the only way up a wall too high to jump.
  b.ground(191, 214, G - 18)
  b.bouncy(196, 200, G - 18)
  b.ledge(204, 212, G - 23)
  b.spawn('oneup', 208, G - 24)
  b.berryLine(205, 211, G - 25, 2)
  b.spawn('bat', 202, G - 21)

  // ── Beat 7 · the caldera rim, and the third fragment out on the spur.
  b.ledge(216, 226, G - 20)
  b.rect(228, G - 17, 230, H - 1, C.solid)
  b.ledge(227, 231, G - 18)
  b.spawn('fragment', 229, G - 19, { index: 2 })
  b.pit(232, 235)
  b.ground(236, W - 1, G - 17)
  b.spawn('goal', 242, G - 18)
  b.berryLine(237, 245, G - 18, 2)
  b.onGround('shielder', 239, undefined, G - 17)

  return {
    id: 'wano-2',
    name: 'Onigashima',
    biome: 'wano',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 420,
    music: 'wano',
    weather: 'ash',
    timeOfDay: 0.9,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6-3 · Cumbre de Onigashima — boss stage
// ─────────────────────────────────────────────────────────────────────────────

function buildSummit(): LevelDef {
  const W = 208
  const H = 24
  const G = 17
  const b = new LevelBuilder(W, H)

  b.ground(0, W - 1, G)

  // ── The approach. Short, and made of the hardest things the campaign has
  //    taught, so the fight is earned rather than announced.
  b.berryLine(2, 10, G - 1, 3)
  b.onGround('grunt', 12)
  b.onGround('shielder', 18)
  b.pit(22, 26)
  b.berryArc(22, G - 2, 4, 3)
  b.ground(27, 70, G)
  b.hline(30, 44, G, C.ice)
  b.spikes(36, 38, G - 1)
  b.ledge(34, 40, G - 4)
  b.berryLine(35, 39, G - 6, 2)
  b.spawn('bat', 42, G - 7)
  b.onGround('checkpoint', 48)
  crates(b, 52, G, 3)
  crates(b, 53, G, 2)
  b.spawn('fragment', 52, G - 5, { index: 0 })
  b.onGround('crab', 60)
  b.spawn('barrel', 66, G - 1)

  // ── The lantern stair. Roofs of the keep, climbed in the dark.
  b.pit(71, 100)
  b.ledge(72, 78, G - 2)
  b.ledge(82, 88, G - 5)
  b.ledge(92, 99, G - 8)
  b.berryLine(73, 77, G - 4, 2)
  b.spawn('bat', 86, G - 10)
  b.spawn('bat', 96, G - 12)
  b.spawn('fragment', 95, G - 12, { index: 1 })
  b.ground(101, 132, G)
  b.spawn('meat', 106, G - 4)
  rigging(b, 112, G, G - 9)
  b.spawn('oneup', 112, G - 10)
  b.onGround('shielder', 120)
  b.onGround('grunt', 128)
  b.spawn('fruit', 124, G - 3, { tier: 'gear4' })
  b.onGround('checkpoint', 131)

  // ── The summit. A flat ring with a wall at the back, a drum tower to one
  //    side, and enough room to run a pattern in.
  b.ground(133, 190, G)
  b.spawn('boss-kaido', 164, G - 1)
  b.spawn('meat', 140, G - 4)
  const drum = tower(b, 146, 150, G, G - 8)
  b.spawn('berry', 148, drum.deck - 1)
  b.berryLine(136, 144, G - 2, 3)
  b.berryLine(172, 184, G - 2, 4)

  // ── The lantern rail. A line of paper lanterns strung across the ring at
  //    roof height: an optional road over the fight, and the last fragment at
  //    the end of it.
  b.ledge(155, 160, G - 8)
  b.ledge(165, 170, G - 8)
  b.ledge(175, 180, G - 9)
  b.ledge(185, 192, G - 8)
  b.berryLine(156, 191, G - 10, 5)
  b.spawn('fragment', 189, G - 9, { index: 2 })

  // ── Past the ring: the stair down off the island.
  b.stepUp(191, G, 3, 2)
  b.ground(197, W - 1, G - 3)
  b.spawn('goal', 202, G - 4)
  b.berryLine(198, 206, G - 4, 2)

  return {
    id: 'wano-3',
    name: 'Cumbre de Onigashima',
    biome: 'wano',
    w: W,
    h: H,
    startX: 3,
    startY: G - 1,
    timeLimit: 320,
    music: 'boss',
    weather: 'ash',
    timeOfDay: 0.98,
    rows: b.rows(),
    spawns: b.spawns(),
  }
}

export const wano1 = buildKuri()
export const wano2 = buildOnigashima()
export const wano3 = buildSummit()
