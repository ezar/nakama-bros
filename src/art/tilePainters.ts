import { TILE, Tile } from '../types'
import type { Biome } from '../types'
import { cel, mix, rgba, type Cel } from './color'
import { PAL, biomePalette } from './palette'
import {
  blob,
  curve,
  ellipsePath,
  glint,
  gradientFill,
  paint,
  roundRectPath,
  type Light,
  type Pt,
  type Surface,
} from './ink'

/**
 * Terrain painters.
 *
 * Every cell of the tile atlas is one call into this file. The hard part of
 * code-drawn terrain is not making one tile look good — it is making a hundred
 * of them look like one continuous piece of ground that still belongs to a
 * named island, so the rules here are:
 *
 *  - Anything that must read as *continuous* across a tile border (the grass
 *    line, masonry courses, basalt columns) is pinned to a value that does not
 *    depend on the variant, so neighbours always agree and a horizontal flip
 *    stays seamless.
 *  - Anything that must read as *irregular* (bedding lenses, tufts, pebbles,
 *    chips) is kept strictly inside the cell and placed from a hash, so nothing
 *    is ever cut in half at a border and no two variants share a rhythm.
 *  - Every tile in a biome is cut from the same short list of materials. An
 *    island is recognisable because its ground, its walls, its ladders and its
 *    hazards are all made of the same stuff — a desert with dock planking in it
 *    is a tileset, not a place. `Terrain` below is that list.
 *  - Nothing here carries a per-tile vertical ramp. Depth below the surface is
 *    the renderer's job, because only the renderer knows how deep a tile is;
 *    baking it into a cell is what makes a wall band at every row.
 */

const TAU = Math.PI * 2

/** World-space y where the grass / crust line meets the tile border. */
const CAP_Y = 4.6

export interface TileDrawArgs {
  s: Surface
  ctx: CanvasRenderingContext2D
  /** Neighbour mask. Bit set means "the same tile is there". */
  mask: number
  variant: number
  biome: Biome
}

export type TilePainter = (a: TileDrawArgs) => void

/**
 * Ids that exist only inside the atlas. The renderer composites these over real
 * tiles; they are numbered clear of `Tile` so a level's data can never name one.
 */
export const Overlay = {
  /** Grass / crust / wisps that overhang the tile above a ground surface. */
  Crown: 64,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Determinism
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A 32-bit integer hash.
 *
 * The old `sin(x * 12.9898) * 43758` trick is fine for shader noise but visibly
 * correlated for small integer inputs, which is exactly what tile coordinates
 * are — it is why the old embedded stones landed on a diagonal lattice.
 */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  h ^= h >>> 13
  h = Math.imul(h, 0x27d4eb2d)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * A deterministic value stream.
 *
 * Painters pull from a stream rather than indexing a jitter table so a shape
 * can consume as many numbers as it needs; a table forces every feature to
 * share the same handful of values, which is how a "random" tileset ends up
 * with every stone the same size.
 */
class Vary {
  private i = 0

  constructor(private seed: number) {}

  next(): number {
    return hash2(this.seed, this.i++) / 0x100000000
  }

  range(a: number, b: number): number {
    return a + this.next() * (b - a)
  }

  int(n: number): number {
    return Math.min(n - 1, Math.floor(this.next() * n))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1
  }

  /** One of `xs`, chosen uniformly. */
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(xs.length)]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contours
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A smooth open curve appended to `p`, passing exactly through its endpoints.
 *
 * Catmull-Rom (what `curve()` gives) overshoots at the ends, which would leave a
 * step at every tile border on a contour that is meant to be pinned. Midpoint
 * quadratics are C1 continuous and honour the first and last point exactly.
 */
function smooth(p: Path2D, pts: Pt[], move: boolean): void {
  const n = pts.length
  if (n === 0) return
  if (move) p.moveTo(pts[0][0], pts[0][1])
  else p.lineTo(pts[0][0], pts[0][1])
  if (n === 1) return
  for (let i = 1; i < n - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    p.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
  }
  p.quadraticCurveTo(pts[n - 2][0], pts[n - 2][1], pts[n - 1][0], pts[n - 1][1])
}

/**
 * A contour across the whole cell, pinned to `edgeY` at both borders.
 *
 * Pinning both ends to the same value is what lets neighbouring tiles join and
 * lets the renderer mirror a tile horizontally for free variety; the interior is
 * left to wander so the line still reads as hand-drawn. The sample count is
 * varied by the caller so two variants never share a wavelength.
 */
function contour(v: Vary, edgeY: number, amp: number, samples = 5): Pt[] {
  const pts: Pt[] = [[0, edgeY]]
  for (let i = 1; i < samples; i++) {
    pts.push([(TILE / samples) * i, edgeY + (v.next() - 0.5) * 2 * amp])
  }
  pts.push([TILE, edgeY])
  return pts
}

// ─────────────────────────────────────────────────────────────────────────────
// Materials
// ─────────────────────────────────────────────────────────────────────────────

/** The body of the ground mass. */
export type Bedding = 'turf' | 'sandstone' | 'cloud' | 'quay' | 'rot' | 'volcanic'
/** What grows or flakes off the top edge. */
export type Crown = 'blades' | 'crust' | 'wisp' | 'boards' | 'fungus' | 'ash'
/** Laid stone: the brick tile and anything coursed. */
export type Masonry = 'harbour' | 'adobe' | 'skystone' | 'wet' | 'crypt' | 'castle'
/** Worked wood: one-way platforms, crumbling blocks, block frames. */
export type Joinery = 'dock' | 'palm' | 'skywood' | 'shipyard' | 'coffin' | 'lacquer'
/** What you climb. */
export type Rigging = 'ratline' | 'knotted' | 'vine' | 'ironladder' | 'boneladder' | 'bamboo'
/** What impales you. */
export type Barb = 'harpoon' | 'bone' | 'shard' | 'railspike' | 'ironfence' | 'blade'
/** What throws you back up. */
export type Spring = 'gum' | 'awning' | 'puff' | 'tarp' | 'hide' | 'taiko'
/** The slippery tile. Ice is only one island's answer to it. */
export type Slick = 'wetstone' | 'glass' | 'cloudice' | 'wetdeck' | 'slime' | 'blackglass'

/**
 * What a biome is actually made of.
 *
 * The old tileset drew every biome from `ground` and `groundDeep` and gave every
 * island the same brown plank and the same brown brick, which is why five of the
 * six read as the same level in a different jumper. A recipe separates the skin
 * from the body and names the worked materials, so a ladder in Water 7 is
 * riveted iron and a ladder in Wano is lashed bamboo without either painter
 * knowing what a biome is.
 */
export interface Terrain {
  bedding: Bedding
  crown: Crown
  masonry: Masonry
  joinery: Joinery
  rigging: Rigging
  barb: Barb
  spring: Spring
  slick: Slick
  /** The thin lit skin on an upward-facing surface. */
  cap: string
  /** The mass immediately under the cap. */
  soil: string
  /** The harder material the strata are cut from. */
  rock: string
  /** What gathers where two surfaces meet. */
  moss: string
  /** Small hard inclusions: pebbles, shell, bone, obsidian. */
  grit: string
  /** Worked wood: one-way platforms, ladders, crumbling blocks. */
  timber: string
  /** Metal fittings, blades, brackets. */
  metal: string
  /** The island's signature colour, for the one small thing that should sing. */
  accent: string
}

const terrainCache = new Map<string, Terrain>()

export function terrainOf(biome: Biome): Terrain {
  let t = terrainCache.get(biome)
  if (!t) {
    t = buildTerrain(biome)
    terrainCache.set(biome, t)
  }
  return t
}

function buildTerrain(biome: Biome): Terrain {
  const p = biomePalette(biome)
  switch (biome) {
    case 'alabasta':
      // Layered sandstone, sun-bleached brick and cracked clay. Everything is
      // one warm family; the only cool note allowed is the shadow.
      return {
        bedding: 'sandstone', crown: 'crust', masonry: 'adobe', joinery: 'palm',
        rigging: 'knotted', barb: 'bone', spring: 'awning', slick: 'glass',
        cap: mix(p.ground, PAL.cream, 0.1),
        soil: p.groundDeep,
        rock: p.groundEdge,
        moss: mix(p.groundEdge, PAL.zoroGreen, 0.2),
        grit: mix(p.groundEdge, PAL.ink, 0.42),
        timber: mix(PAL.wood, PAL.sand, 0.4),
        metal: mix(PAL.steel, PAL.sand, 0.25),
        accent: PAL.bloodOrange,
      }
    case 'skypiea':
      // Cloud-turf still has to have a value range. Painting it in the palette's
      // near-white leaves the shade tone nowhere to go, and the island reads as
      // a hole cut in the sky.
      return {
        bedding: 'cloud', crown: 'wisp', masonry: 'skystone', joinery: 'skywood',
        rigging: 'vine', barb: 'shard', spring: 'puff', slick: 'cloudice',
        cap: p.ground,
        soil: mix(p.groundEdge, PAL.skyLow, 0.42),
        rock: mix(PAL.mist, PAL.skyLow, 0.3),
        moss: p.groundDeep,
        grit: mix(PAL.mist, PAL.steel, 0.35),
        timber: mix(PAL.cream, PAL.sand, 0.35),
        metal: mix(PAL.gold, PAL.cream, 0.3),
        accent: PAL.gold,
      }
    case 'water7':
      // Wet timber, barnacled stone, iron and rivets. The whole island is a
      // shipyard standing in the sea, so nothing here is ever quite dry.
      return {
        bedding: 'quay', crown: 'boards', masonry: 'wet', joinery: 'shipyard',
        rigging: 'ironladder', barb: 'railspike', spring: 'tarp', slick: 'wetdeck',
        cap: p.ground,
        soil: PAL.rock,
        rock: PAL.rockDeep,
        moss: mix(PAL.fishmanTeal, PAL.rockDeep, 0.42),
        grit: mix(PAL.rock, PAL.ink, 0.3),
        timber: p.groundEdge,
        metal: PAL.steel,
        accent: PAL.seaLight,
      }
    case 'thriller-bark':
      return {
        bedding: 'rot', crown: 'fungus', masonry: 'crypt', joinery: 'coffin',
        rigging: 'boneladder', barb: 'ironfence', spring: 'hide', slick: 'slime',
        cap: p.groundEdge,
        soil: p.ground,
        rock: p.groundDeep,
        moss: mix(PAL.poison, p.groundDeep, 0.45),
        grit: mix(PAL.mist, p.ground, 0.5),
        timber: mix(PAL.woodDeep, p.ground, 0.4),
        metal: PAL.slate,
        accent: PAL.poison,
      }
    case 'wano':
      // Dark volcanic rock, lacquered timber, cut stone. The red is lacquer and
      // torii paint, never the rock.
      return {
        bedding: 'volcanic', crown: 'ash', masonry: 'castle', joinery: 'lacquer',
        rigging: 'bamboo', barb: 'blade', spring: 'taiko', slick: 'blackglass',
        cap: mix(p.ground, PAL.ink, 0.4),
        soil: mix(p.ground, PAL.ink, 0.34),
        rock: mix(p.groundDeep, PAL.ink, 0.42),
        moss: mix(PAL.zoroGreen, p.groundDeep, 0.58),
        grit: mix(PAL.ink, p.groundDeep, 0.35),
        timber: PAL.luffyRedDeep,
        metal: PAL.steel,
        accent: PAL.chopperPink,
      }
    default:
      // East Blue: lush grass over dark loam, weathered dock planking, mossy
      // harbour stone. The loam is deliberately far darker than the palette's
      // `dirt` — grass sitting on a tone two steps down is what gives the
      // headland its weight.
      return {
        bedding: 'turf', crown: 'blades', masonry: 'harbour', joinery: 'dock',
        rigging: 'ratline', barb: 'harpoon', spring: 'gum', slick: 'wetstone',
        cap: p.ground,
        soil: mix(p.groundEdge, PAL.ink, 0.3),
        rock: mix(p.groundEdge, PAL.rockDeep, 0.5),
        moss: p.groundDeep,
        grit: mix(PAL.rockDeep, p.groundEdge, 0.35),
        timber: PAL.wood,
        metal: PAL.steel,
        accent: PAL.seaLight,
      }
  }
}

const lightOf = (biome: Biome): Light => {
  const p = biomePalette(biome)
  return { x: p.lightDirX, y: p.lightDirY }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared material primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bedding lenses: flattened, tilted blobs of a neighbouring tone.
 *
 * Full-width strata bands would have to line up across every tile border, which
 * forces them onto a fixed grid and reproduces the very repetition we are trying
 * to kill. Lenses read as the same fabric — sediment laid down, then faulted —
 * while staying inside the cell, so their placement is free.
 */
function lenses(
  ctx: CanvasRenderingContext2D,
  v: Vary,
  tones: string[],
  count: number,
  tilt: number,
  y0: number,
  y1: number,
  maxR: number,
  alpha: number,
): void {
  ctx.save()
  for (let i = 0; i < count; i++) {
    const rx = v.range(maxR * 0.4, maxR)
    const ry = v.range(0.45, 1.5)
    const cx = v.range(rx + 0.4, TILE - rx - 0.4)
    const cy = v.range(y0, y1)
    const rot = tilt + v.range(-0.09, 0.09)
    ctx.globalAlpha = alpha * v.range(0.6, 1)
    ctx.fillStyle = tones[v.int(tones.length)]
    ctx.fill(ellipsePath(cx, cy, rx, ry, rot))
    // A hairline on the upper edge is the bedding plane itself; without it the
    // lens reads as a stain rather than a layer.
    if (v.chance(0.45)) {
      ctx.globalAlpha = alpha * 0.5
      ctx.strokeStyle = tones[v.int(tones.length)]
      ctx.lineWidth = 0.28
      ctx.beginPath()
      ctx.ellipse(cx, cy - ry * 0.5, rx * 0.85, ry * 0.5, rot, Math.PI * 0.15, Math.PI * 0.85, true)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * A full-width bedding plane pinned to one of a shared set of heights.
 *
 * Because the heights are shared, two neighbours that happen to pick the same
 * one join into a single line running across several tiles, and where they
 * disagree the plane pinches out — which is what real bedding does.
 */
function seam(ctx: CanvasRenderingContext2D, v: Vary, color: string, ys: number[], width: number): void {
  if (!v.chance(0.55)) return
  const y = ys[v.int(ys.length)]
  const pts = contour(v, y, 0.5, 4 + v.int(3))
  const p = new Path2D()
  smooth(p, pts, true)
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke(p)
  ctx.restore()
}

/**
 * One laid block: a flat tone with a thin bevel.
 *
 * Running `paint()` over a block this small gives every one of them the same
 * hard diagonal terminator, and a wall of them turns into a lattice of
 * identical diamonds — the exact artefact this tileset exists to remove. A
 * stone that protrudes a few millimetres has a lit edge and a dark edge, not a
 * lit half and a dark half, so that is what is drawn.
 */
function block(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  c: Cel,
  light: Light,
  strength = 0.55,
): void {
  ctx.save()
  ctx.fillStyle = c.core
  ctx.fill(roundRectPath(x, y, w, h, Math.min(0.7, h * 0.2)))
  const lx = light.x < 0 ? x + 0.5 : x + w - 0.5
  const dx = light.x < 0 ? x + w - 0.5 : x + 0.5
  ctx.globalAlpha = strength
  ctx.lineWidth = 0.45
  ctx.strokeStyle = c.light
  ctx.beginPath()
  ctx.moveTo(lx, y + h - 0.8)
  ctx.lineTo(lx, y + 0.6)
  ctx.lineTo(dx, y + 0.6)
  ctx.stroke()
  ctx.strokeStyle = c.deep
  ctx.beginPath()
  ctx.moveTo(dx, y + 1)
  ctx.lineTo(dx, y + h - 0.6)
  ctx.lineTo(lx, y + h - 0.6)
  ctx.stroke()
  ctx.restore()
}

/**
 * One board, drawn along its length with grain, an end seam and a lit arris.
 *
 * Worked timber is the one material a player reads instantly as *made*, so it
 * gets the straight lit edge that natural rock never gets.
 */
function plank(
  ctx: CanvasRenderingContext2D,
  v: Vary,
  x: number, y: number, w: number, h: number,
  c: Cel,
  light: Light,
  grain = 2,
): void {
  ctx.save()
  ctx.fillStyle = c.core
  ctx.fill(roundRectPath(x, y, w, h, Math.min(0.5, h * 0.25)))
  // Grain: long shallow arcs that follow the board, never crossing it.
  ctx.globalAlpha = 0.36
  ctx.strokeStyle = c.deep
  ctx.lineWidth = 0.26
  for (let i = 0; i < grain; i++) {
    const gy = y + v.range(h * 0.2, h * 0.8)
    ctx.stroke(curve([
      [x, gy],
      [x + w * 0.45, gy + v.range(-0.35, 0.35)],
      [x + w, gy + v.range(-0.25, 0.25)],
    ] as Pt[]))
  }
  // A knot, occasionally — the one place the eye lands on a plain board.
  if (v.chance(0.3)) {
    const kx = v.range(x + 1.5, x + w - 1.5)
    const ky = y + h * 0.5
    ctx.globalAlpha = 0.5
    ctx.fillStyle = c.deep
    ctx.fill(ellipsePath(kx, ky, v.range(0.5, 0.9), v.range(0.35, 0.6), v.range(-0.4, 0.4)))
  }
  ctx.globalAlpha = 0.75
  ctx.strokeStyle = light.y < 0 ? c.light : c.deep
  ctx.lineWidth = 0.35
  ctx.beginPath()
  ctx.moveTo(x + 0.3, y + 0.3)
  ctx.lineTo(x + w - 0.3, y + 0.3)
  ctx.stroke()
  ctx.strokeStyle = c.deep
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  ctx.moveTo(x + 0.3, y + h - 0.3)
  ctx.lineTo(x + w - 0.3, y + h - 0.3)
  ctx.stroke()
  ctx.restore()
}

/** Iron fixings. Small, domed, and always in a row — nobody hammers one rivet. */
function rivets(
  ctx: CanvasRenderingContext2D,
  xs: number[],
  y: number,
  c: Cel,
  r = 0.42,
): void {
  ctx.save()
  for (const x of xs) {
    ctx.fillStyle = c.shade
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
    ctx.fillStyle = c.light
    ctx.beginPath()
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

/** Rope: a laid line with the fibre marks that make it read as rope. */
function rope(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  c: Cel,
  width: number,
): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = c.core
  ctx.lineWidth = width
  ctx.stroke(path)
  ctx.strokeStyle = c.deep
  ctx.globalAlpha = 0.5
  ctx.lineWidth = width * 0.4
  ctx.setLineDash([width * 0.5, width * 0.55])
  ctx.stroke(path)
  ctx.setLineDash([])
  ctx.globalAlpha = 0.8
  ctx.strokeStyle = c.light
  ctx.lineWidth = width * 0.22
  ctx.save()
  ctx.translate(-width * 0.22, -width * 0.22)
  ctx.stroke(path)
  ctx.restore()
  ctx.restore()
}

/**
 * A desiccation net: polygonal cracks like dried clay or old lacquer.
 *
 * Drawn as a set of chords between points on a ring, which gives closed cells
 * of different sizes without the plotted-grid look of drawing a lattice.
 */
function crackNet(
  ctx: CanvasRenderingContext2D,
  v: Vary,
  x: number, y: number, w: number, h: number,
  color: string,
  count: number,
  alpha = 0.4,
): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = 0.28
  ctx.lineJoin = 'miter'
  for (let i = 0; i < count; i++) {
    const cx = v.range(x, x + w)
    const cy = v.range(y, y + h)
    const n = 3 + v.int(3)
    const r = v.range(1.6, 4.2)
    ctx.beginPath()
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * TAU + v.range(-0.25, 0.25)
      const rr = r * v.range(0.55, 1)
      const px = cx + Math.cos(a) * rr
      const py = cy + Math.sin(a) * rr * 0.7
      if (k === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Barnacles and weed: the tell that a stone spends half its life underwater. */
function barnacles(
  ctx: CanvasRenderingContext2D,
  v: Vary,
  x: number, y: number, w: number, h: number,
  shell: Cel,
  count: number,
): void {
  ctx.save()
  for (let i = 0; i < count; i++) {
    const cx = v.range(x, x + w)
    const cy = v.range(y, y + h)
    const r = v.range(0.5, 1.1)
    ctx.fillStyle = shell.core
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 0.72, 0, Math.PI, TAU)
    ctx.fill()
    ctx.fillStyle = shell.deep
    ctx.beginPath()
    ctx.ellipse(cx, cy - r * 0.28, r * 0.32, r * 0.2, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = shell.light
    ctx.lineWidth = 0.18
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 0.72, 0, Math.PI, TAU)
    ctx.stroke()
  }
  ctx.restore()
}

/** Inclusions: pebbles, shell, bone, obsidian. Rare, and never on a grid. */
function inclusions(ctx: CanvasRenderingContext2D, v: Vary, t: Terrain, light: Light): void {
  const grit = cel(t.grit)
  // One stone in four tiles, not one in every other: an inclusion is only
  // interesting while it is still a surprise, and an ellipse repeated at a
  // fixed rate is the single loudest way to advertise a tile grid.
  if (v.chance(0.24)) {
    const cx = v.range(3, TILE - 3)
    const cy = v.range(CAP_Y + 2.5, TILE - 2)
    const r = v.range(1, 2.8)
    const pts: Pt[] = []
    const lobes = 5 + v.int(3)
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * TAU
      const rr = r * v.range(0.62, 1)
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * v.range(0.55, 0.8)])
    }
    paint(ctx, blob(pts, 0.85), grit, {
      shadow: 0.52, radius: r, pivot: [cx, cy], rim: 0.28, line: 0.3, occlusion: 0.4, light,
    })
  }
  // Grit trails: a handful of chips washed into one pocket, not a scatter.
  if (v.chance(0.1)) {
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = grit.deep
    const bx = v.range(2.5, TILE - 4)
    const by = v.range(CAP_Y + 1.5, TILE - 3)
    const lean = v.range(-0.5, 0.5)
    for (let i = 0; i < 3 + v.int(3); i++) {
      const r = v.range(0.26, 0.62)
      const d = v.range(-2.2, 2.6)
      ctx.fill(ellipsePath(bx + d, by + d * lean + v.range(-0.6, 0.6), r, r * 0.78, 0))
    }
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bedding — the body of the mass
// ─────────────────────────────────────────────────────────────────────────────

function bedding(
  ctx: CanvasRenderingContext2D,
  t: Terrain,
  v: Vary,
  light: Light,
): void {
  const soil = cel(t.soil)
  const rock = cel(t.rock)

  switch (t.bedding) {
    case 'sandstone': {
      // Wind-carved bedding: many thin, near-horizontal layers of close value.
      lenses(
        ctx, v,
        [mix(soil.core, rock.core, 0.35), mix(soil.core, soil.light, 0.5), mix(soil.core, rock.core, 0.2)],
        5, 0.02, 1.5, TILE - 0.5, 7, 0.26,
      )
      // Sandstone's character is the bedding plane, not the blotch: several
      // pinned seams per tile, each faint, joining across neighbours into long
      // lines that pinch out where two tiles disagree.
      seam(ctx, v, rock.shade, [3.4, 7.2, 11.4], 0.3)
      seam(ctx, v, rock.shade, [5.4, 9.6, 13.6], 0.26)
      seam(ctx, v, soil.light, [2.2, 6.4, 10.2], 0.3)
      // Cracked clay in the pockets between the beds, and a wind-scour hollow
      // where the sand has been cut back under a harder layer.
      if (v.chance(0.5)) crackNet(ctx, v, 1, CAP_Y + 1, TILE - 2, TILE - CAP_Y - 2, rock.deep, 1 + v.int(2), 0.3)
      if (v.chance(0.45)) {
        ctx.save()
        ctx.globalAlpha = 0.3
        ctx.fillStyle = rock.deep
        const hy = v.range(CAP_Y + 2, TILE - 3)
        ctx.fill(ellipsePath(v.range(2, TILE - 2), hy, v.range(3, 6.5), v.range(0.8, 1.8), 0.03))
        ctx.restore()
      }
      break
    }
    case 'cloud': {
      // Cloud has no strata; it has billows. Stepping the value at fixed heights
      // banded a stack of tiles into stripes — the reset at each border was the
      // loudest thing on screen — so the mass stays one tone and the billow is
      // carried by its lip alone, placed the same way a bedding plane is: pinned
      // so neighbours can join, probable rather than certain so a column of
      // tiles never repeats.
      for (const ys of [[2.4, 6.6], [8.4, 12.6]]) {
        if (!v.chance(0.7)) continue
        const line = contour(v, ys[v.int(ys.length)], 2, 4 + v.int(3))
        const lip = new Path2D()
        smooth(lip, line, true)
        ctx.save()
        ctx.globalAlpha = 0.5
        ctx.strokeStyle = soil.shade
        ctx.lineWidth = 1.1
        ctx.translate(0, 1)
        ctx.stroke(lip)
        ctx.restore()
        ctx.save()
        ctx.globalAlpha = 0.85
        ctx.strokeStyle = rock.light
        ctx.lineWidth = 0.7
        ctx.stroke(lip)
        ctx.restore()
      }
      // Cloud-turf should look like it would not take your weight: the mass
      // thins out toward the bottom of the cell into torn wisps rather than
      // ending on a cut edge.
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = '#000'
      for (let i = 0; i < 2 + v.int(3); i++) {
        const x = v.range(-1, TILE + 1)
        ctx.fill(ellipsePath(x, TILE + v.range(0.4, 2.2), v.range(1.6, 4), v.range(1.2, 2.6), 0))
      }
      ctx.restore()
      break
    }
    case 'quay': {
      // Coursed masonry. The course pitch divides the tile exactly, so blocks
      // run unbroken across a whole quay wall — a mason laid these, they are
      // meant to be regular; the variation is in wear, not in layout.
      ctx.fillStyle = rock.deep
      ctx.fillRect(0, 0, TILE, TILE)
      const h = TILE / 2
      for (let c = 0; c < 2; c++) {
        const y = c * h
        const off = c % 2 === 0 ? 0 : -4
        for (let x = off; x < TILE; x += 8) {
          const bx = Math.max(0, x)
          const bw = Math.min(x + 8, TILE) - bx
          if (bw < 1) continue
          const tone = mix(rock.core, v.chance(0.5) ? rock.light : rock.shade, v.range(0, 0.22))
          block(ctx, bx + 0.35, y + 0.35, bw - 0.7, h - 0.7, cel(tone), light, 0.45)
          // Wear: a chip or a stain on roughly one stone in four.
          if (v.chance(0.26)) {
            ctx.save()
            ctx.globalAlpha = v.range(0.14, 0.32)
            ctx.fillStyle = v.chance(0.5) ? rock.deep : t.moss
            ctx.fill(ellipsePath(
              bx + v.range(1.5, bw - 1.5), y + v.range(1.5, h - 1.5),
              v.range(1, 2.6), v.range(0.7, 1.6), v.range(0, 1),
            ))
            ctx.restore()
          }
        }
      }
      // An iron tie-plate strapping two courses together, on the odd stone.
      if (v.chance(0.3)) {
        const metal = cel(t.metal)
        const py = v.range(2, TILE - 5)
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.fillStyle = metal.shade
        ctx.fill(roundRectPath(v.range(1, 5), py, v.range(5, 8), 3, 0.5))
        ctx.restore()
      }
      // The tide leaves the lower courses darker, green and shelled.
      const tide = TILE - h * v.range(0.5, 0.95)
      ctx.save()
      ctx.globalAlpha = 0.26
      ctx.fillStyle = t.moss
      ctx.fillRect(0, tide, TILE, TILE)
      ctx.restore()
      if (v.chance(0.55)) barnacles(ctx, v, 1, tide, TILE - 2, TILE - tide - 1, cel(mix(PAL.mist, t.rock, 0.35)), 2 + v.int(4))
      break
    }
    case 'rot': {
      // The island is itself a ship, so its ground is decking: warped boards
      // laid in courses, strapped with wrought iron, with the dark under them
      // showing through wherever a board has finally gone.
      const boardC = cel(t.timber)
      ctx.fillStyle = cel(t.rock).deep
      ctx.fillRect(0, 0, TILE, TILE)
      let y = -v.range(0, 2)
      while (y < TILE) {
        const bh = v.range(3, 5)
        plank(ctx, v, -1, y, TILE + 2, Math.min(bh, TILE - y + 1), boardC, light, 2)
        // A board that has rotted through, showing the hold beneath.
        if (v.chance(0.3)) {
          ctx.save()
          ctx.globalAlpha = 0.75
          ctx.fillStyle = cel(t.rock).deep
          ctx.fill(ellipsePath(v.range(2, TILE - 2), y + bh * 0.5, v.range(1.4, 3.4), v.range(0.6, 1.4), 0))
          ctx.restore()
        }
        y += bh + 0.35
      }
      // Wrought-iron strap across the boards.
      if (v.chance(0.35)) {
        const metal = cel(t.metal)
        const sx = v.range(1, TILE - 4)
        ctx.save()
        ctx.globalAlpha = 0.85
        ctx.fillStyle = metal.shade
        ctx.fill(roundRectPath(sx, -1, v.range(2.4, 3.4), TILE + 2, 0.4))
        ctx.restore()
        rivets(ctx, [sx + 1.4], v.range(2, TILE - 2), metal, 0.38)
      }
      // Bone shards: pale, angular, and sparse enough to be a find.
      if (v.chance(0.16)) {
        const bx = v.range(3, TILE - 3)
        const by = v.range(CAP_Y + 2, TILE - 2.5)
        ctx.save()
        ctx.translate(bx, by)
        ctx.rotate(v.range(-0.9, 0.9))
        paint(ctx, roundRectPath(-1.8, -0.45, 3.6, 0.9, 0.45), cel(t.grit), {
          shadow: 0.5, radius: 1.4, pivot: [0, 0], rim: 0.2, line: 0.25, light,
        })
        ctx.restore()
      }
      break
    }
    case 'volcanic': {
      // Basalt columns. The joint pitch divides the tile so a cliff reads as one
      // colonnade rather than a stack of separate tiles.
      const w = TILE / 2
      for (let c = 0; c < 2; c++) {
        const x = c * w
        ctx.fillStyle = mix(rock.core, v.chance(0.5) ? rock.light : rock.deep, v.range(0.04, 0.18))
        ctx.fillRect(x, 0, w, TILE)
      }
      ctx.save()
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 0.45
      for (let c = 0; c < 2; c++) {
        const x = c * w
        ctx.strokeStyle = rock.deep
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, TILE)
        ctx.stroke()
        // The lit side of each column edge; without it a colonnade is stripes.
        ctx.globalAlpha = 0.3
        ctx.strokeStyle = rock.light
        ctx.beginPath()
        ctx.moveTo(x + (light.x < 0 ? 0.6 : -0.6), 0)
        ctx.lineTo(x + (light.x < 0 ? 0.6 : -0.6), TILE)
        ctx.stroke()
        ctx.globalAlpha = 0.5
      }
      ctx.restore()
      // Dressed stone: somebody has cut steps and revetments into this rock, and
      // the join between the worked course and the raw basalt is where Wano's
      // ground stops being a cliff and starts being a castle wall.
      if (v.chance(0.4)) {
        const c = cel(mix(t.rock, PAL.mist, 0.28))
        const y = v.range(CAP_Y + 0.5, TILE - 5)
        for (let x = v.chance(0.5) ? 0 : -3.5; x < TILE; x += 7) {
          const bx = Math.max(0, x)
          const bw = Math.min(x + 7, TILE) - bx
          if (bw < 1.5) continue
          block(ctx, bx + 0.3, y, bw - 0.6, 3.6, c, light, 0.5)
        }
      }
      // A conchoidal chip out of one column face: basalt breaks in shells.
      if (v.chance(0.4)) {
        const cx = v.range(2, TILE - 2)
        const cy = v.range(2, TILE - 2)
        ctx.save()
        ctx.globalAlpha = 0.3
        ctx.fillStyle = v.chance(0.5) ? rock.light : rock.deep
        ctx.fill(ellipsePath(cx, cy, v.range(1.5, 3.4), v.range(1.2, 2.6), v.range(0, 1)))
        ctx.restore()
      }
      // One tile in six keeps any heat, and only near the bottom. Additive so
      // it glows rather than being a drawn orange line — but rare, because a
      // wall of glowing cracks stops reading as rock at all.
      if (v.chance(0.16)) {
        const x = v.range(1.5, TILE - 1.5)
        const p = curve([
          [x, TILE],
          [x + v.range(-1.5, 1.5), TILE * 0.7],
          [x + v.range(-2, 2), TILE * 0.45],
        ] as Pt[])
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.strokeStyle = rgba(PAL.ember, 0.14)
        ctx.lineWidth = 1.2
        ctx.stroke(p)
        ctx.strokeStyle = rgba(PAL.ember, 0.24)
        ctx.lineWidth = 0.3
        ctx.stroke(p)
        ctx.restore()
      }
      break
    }
    default: {
      // Loam. Dark, wet, full of roots and stones — the point of East Blue's
      // ground is that the grass is bright *because* what it sits on is not.
      lenses(
        ctx, v,
        [soil.shade, rock.core, mix(soil.core, rock.core, 0.55), mix(soil.core, soil.light, 0.45)],
        4, 0.06, CAP_Y + 1, TILE - 0.5, 6, 0.34,
      )
      seam(ctx, v, rock.shade, [8.6, 12.4], 0.32)
      // A stone big enough to be a landmark, once in a while: loam is not a
      // uniform paste, and one large form does more for the read than twenty
      // small ones, which only ever add up to noise.
      if (v.chance(0.2)) {
        const cx = v.range(3, TILE - 3)
        const cy = v.range(TILE * 0.45, TILE - 1)
        ctx.save()
        ctx.globalAlpha = 0.5
        ctx.fillStyle = rock.shade
        ctx.fill(ellipsePath(cx, cy, v.range(3, 5.5), v.range(1.6, 3), v.range(-0.2, 0.2)))
        ctx.globalAlpha = 0.35
        ctx.fillStyle = rock.light
        ctx.fill(ellipsePath(cx - 0.4, cy - 0.8, v.range(2, 4), v.range(0.5, 1), v.range(-0.2, 0.2)))
        ctx.restore()
      }
      break
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The cap — the skin on an upward-facing surface
// ─────────────────────────────────────────────────────────────────────────────

function capBand(
  ctx: CanvasRenderingContext2D,
  t: Terrain,
  v: Vary,
  light: Light,
  openW: boolean,
  openE: boolean,
): void {
  const cap = cel(t.cap)
  const soft = t.bedding === 'cloud'
  // Amplitude and wavelength both move, so no two variants share a rhythm; the
  // ends stay pinned to CAP_Y because that is the only value a neighbour can
  // agree with without knowing which neighbour it is.
  const line = contour(v, CAP_Y, v.range(1.2, soft ? 3 : 2.4), 4 + v.int(3))
  const path = new Path2D()
  path.moveTo(0, -0.5)
  path.lineTo(TILE, -0.5)
  path.lineTo(TILE, CAP_Y)
  smooth(path, line.slice().reverse(), false)
  path.closePath()

  paint(ctx, path, cap, {
    shadow: 0.46, radius: 3.4, pivot: [TILE / 2, 2.2], rim: 0.6, line: 0, light,
  })

  // A transition zone under the skin, in a tone between cap and body, whose
  // depth is *not* pinned. It is the boundary the eye actually follows, and
  // because it disagrees at every border it hides the pinned line above it —
  // which is what stops a long run of ground reading as a stack of stamps.
  const blendTone = cel(mix(t.cap, t.soil, 0.62))
  const blend = new Path2D()
  const bpts: Pt[] = []
  const depth = v.range(1.4, 4.2)
  for (let i = 0; i <= 5; i++) {
    bpts.push([(TILE / 5) * i, CAP_Y + depth * v.range(0.35, 1.15)])
  }
  smooth(blend, line, true)
  smooth(blend, bpts.slice().reverse(), false)
  blend.closePath()
  ctx.save()
  ctx.globalAlpha = 0.72
  ctx.fillStyle = blendTone.shade
  ctx.fill(blend)
  ctx.restore()

  // Occlusion under the skin. Without it the grass looks printed on the soil
  // instead of lying on top of it, and the whole surface goes flat.
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = cel(t.soil).deep
  ctx.lineWidth = 0.7
  const under = new Path2D()
  smooth(under, line, true)
  ctx.translate(0, 0.5)
  ctx.stroke(under)
  ctx.restore()

  // Roots feeling their way down out of the turf. They stitch the bright cap to
  // the dark body; without them the green looks printed on. They only exist
  // where there *is* turf, which is why they are drawn here and not in the
  // bedding — a tile ten metres down has no grass to grow them.
  if (t.bedding === 'turf') {
    ctx.save()
    ctx.globalAlpha = 0.45
    ctx.strokeStyle = cel(t.moss).deep
    ctx.lineCap = 'round'
    for (let i = 0; i < v.int(3); i++) {
      const x = v.range(1, TILE - 1)
      const d = v.range(2.5, 7)
      ctx.lineWidth = v.range(0.22, 0.4)
      ctx.stroke(curve([
        [x, CAP_Y - 0.5],
        [x + v.range(-1.4, 1.4), CAP_Y + d * 0.5],
        [x + v.range(-2.2, 2.2), CAP_Y + d],
      ] as Pt[]))
    }
    ctx.restore()
  }

  // Where the skin meets the body it frays: roots, crust flakes, splinters.
  const fringe = v.int(6)
  if (fringe > 0) {
    ctx.save()
    ctx.fillStyle = cap.shade
    for (let i = 0; i < fringe; i++) {
      const x = v.range(1, TILE - 1)
      const d = v.range(1.2, 4.6)
      const w = v.range(0.5, 1.3)
      ctx.globalAlpha = v.range(0.55, 0.95)
      ctx.fill(
        blob([
          [x - w, CAP_Y - 0.6],
          [x + w, CAP_Y - 0.6],
          [x + v.range(-1.2, 1.2), CAP_Y + d],
        ] as Pt[], 0.6),
      )
    }
    ctx.restore()
  }

  capSurface(ctx, t, v, cap, light)

  // The corner where the top meets an exposed face gathers growth on one side
  // and gets chipped away on the other.
  if (openW || openE) {
    const side = openW ? 0 : TILE
    const dir = openW ? 1 : -1
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = cel(t.moss).core
    ctx.fill(
      blob([
        [side, 0],
        [side + dir * v.range(2, 4), 0.4],
        [side + dir * v.range(1.4, 3), CAP_Y + v.range(0.5, 3)],
        [side, CAP_Y + v.range(1, 2)],
      ] as Pt[], 0.8),
    )
    ctx.restore()
  }
}

/** Per-material treatment of the lit top: ripples, planks, ember crust. */
function capSurface(
  ctx: CanvasRenderingContext2D,
  t: Terrain,
  v: Vary,
  cap: Cel,
  light: Light,
): void {
  switch (t.bedding) {
    case 'sandstone': {
      // Wind ripples: shallow arcs all bowing the same way, like a dune face.
      ctx.save()
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = cap.light
      ctx.lineWidth = 0.3
      const n = 2 + v.int(3)
      for (let i = 0; i < n; i++) {
        const y = v.range(0.8, CAP_Y - 0.9)
        const x = v.range(-2, TILE - 4)
        ctx.stroke(curve([[x, y], [x + 4, y - 0.5], [x + 8, y]] as Pt[]))
      }
      ctx.restore()
      // Where the sand has blown off, the bedrock underneath is cracked clay.
      if (v.chance(0.35)) crackNet(ctx, v, 1, 0.6, TILE - 2, CAP_Y - 1.4, cel(t.rock).deep, 1, 0.34)
      break
    }
    case 'quay': {
      // A walked-on deck: boards running with the path, nailed at the joints.
      ctx.save()
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = cap.deep
      ctx.lineWidth = 0.3
      for (const y of [1.7, 3.4]) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(TILE, y)
        ctx.stroke()
      }
      ctx.restore()
      rivets(ctx, [2, TILE - 2], 0.9, cel(t.metal), 0.32)
      rivets(ctx, [2, TILE - 2], 2.6, cel(t.metal), 0.32)
      // Standing water on the boards, catching the sky.
      if (v.chance(0.4)) {
        const x = v.range(3, TILE - 5)
        glint(ctx, x, v.range(1, 3.4), v.range(1.4, 2.6), 0.4, 0, PAL.foam, 0.3)
      }
      break
    }
    case 'rot': {
      // Rotted boards: the gaps are cut out of the silhouette so the top edge
      // is genuinely broken, not just painted dark.
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      const gaps = v.int(3)
      for (let i = 0; i < gaps; i++) {
        const x = v.range(1, TILE - 2)
        ctx.fillStyle = '#000'
        ctx.fill(roundRectPath(x, -0.5, v.range(0.5, 1.2), v.range(1.5, 3.2), 0.3))
      }
      ctx.restore()
      ctx.save()
      ctx.globalAlpha = 0.45
      ctx.strokeStyle = cap.deep
      ctx.lineWidth = 0.35
      for (let i = 0; i < 3; i++) {
        const x = v.range(0, TILE)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + v.range(-0.6, 0.6), CAP_Y)
        ctx.stroke()
      }
      ctx.restore()
      break
    }
    case 'volcanic': {
      // A cut-stone nosing along the walking surface — the top of a revetment,
      // not the top of a boulder — and heat still in the cracks behind it.
      if (v.chance(0.55)) {
        ctx.save()
        ctx.globalAlpha = 0.7
        ctx.strokeStyle = cel(mix(t.rock, PAL.mist, 0.4)).light
        ctx.lineWidth = 0.4
        ctx.beginPath()
        ctx.moveTo(0, 1.5)
        ctx.lineTo(TILE, 1.5)
        ctx.stroke()
        ctx.globalAlpha = 0.4
        ctx.strokeStyle = cel(t.rock).deep
        for (const x of [v.range(2, 6), v.range(9, 14)]) {
          ctx.beginPath()
          ctx.moveTo(x, 1.5)
          ctx.lineTo(x + v.range(-0.3, 0.3), CAP_Y)
          ctx.stroke()
        }
        ctx.restore()
      }
      if (v.chance(0.4)) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const x = v.range(1, TILE - 1)
        ctx.strokeStyle = rgba(PAL.ember, 0.3)
        ctx.lineWidth = 0.7
        ctx.stroke(curve([[x, 0.6], [x + v.range(-1.5, 1.5), 2.4], [x + v.range(-2, 2), CAP_Y]] as Pt[]))
        ctx.restore()
      }
      break
    }
    case 'cloud': {
      glint(ctx, v.range(3, TILE - 3), v.range(1, 2.6), v.range(1.5, 3), 0.5, 0, PAL.white, 0.35)
      break
    }
    default: {
      // A lit lip along the very top: the single most useful line on a grass
      // tile, because it is what separates ground from sky at a glance.
      ctx.save()
      ctx.globalAlpha = 0.85
      ctx.strokeStyle = cap.light
      ctx.lineWidth = 0.55
      ctx.stroke(curve([[0, 0.35], [TILE / 2, 0.3 + (v.next() - 0.5) * 0.4], [TILE, 0.35]] as Pt[]))
      ctx.restore()
      // A worn path where the turf has been walked off, once in a while.
      if (v.chance(0.22)) {
        ctx.save()
        ctx.globalAlpha = 0.3
        ctx.fillStyle = cel(t.soil).light
        ctx.fill(ellipsePath(v.range(3, TILE - 3), v.range(1.4, 3), v.range(2, 4), v.range(0.7, 1.4), light.x < 0 ? -0.1 : 0.1))
        ctx.restore()
      }
      break
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Faces and undersides
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vertical faces.
 *
 * A cliff is not the top of the ground stood on its end: it is the material
 * underneath, sheared. So the face gets fracture rather than growth, and it is
 * lit or shadowed depending on which way the biome's key light points.
 */
function face(
  ctx: CanvasRenderingContext2D,
  t: Terrain,
  v: Vary,
  light: Light,
  side: -1 | 1,
): void {
  const rock = cel(t.rock)
  const lit = side === -1 ? light.x < 0 : light.x > 0
  const x0 = side === -1 ? 0 : TILE - 4

  ctx.save()
  if (lit) {
    gradientFill(ctx, roundRectPath(x0, 0, 4, TILE, 0), x0, 0, x0 + side * -4, 0, [
      [0, rgba(rock.light, 0)],
      [1, rgba(rock.light, 0.4)],
    ])
    ctx.globalAlpha = 0.75
    ctx.strokeStyle = rock.light
    ctx.lineWidth = 0.5
    ctx.beginPath()
    const e = side === -1 ? 0.3 : TILE - 0.3
    ctx.moveTo(e, 0)
    ctx.lineTo(e, TILE)
    ctx.stroke()
  } else {
    gradientFill(ctx, roundRectPath(x0, 0, 4.5, TILE, 0), x0, 0, x0 + side * -4.5, 0, [
      [0, rgba(rock.deep, 0)],
      [1, rgba(rock.deep, 0.62)],
    ])
  }
  ctx.restore()

  // What a sheared face shows depends on what the mass is made of.
  const ex = side === -1 ? 1.8 : TILE - 1.8
  switch (t.bedding) {
    case 'quay':
      if (v.chance(0.5)) barnacles(ctx, v, ex - 1.2, v.range(6, TILE - 3), 2.4, 3, cel(mix(PAL.mist, t.rock, 0.4)), 2 + v.int(2))
      break
    case 'rot':
      // Board ends, splintered.
      ctx.save()
      ctx.globalAlpha = 0.6
      ctx.strokeStyle = cel(t.timber).deep
      ctx.lineWidth = 0.35
      for (let y = v.range(0, 4); y < TILE; y += v.range(3, 5)) {
        ctx.beginPath()
        ctx.moveTo(side === -1 ? 0 : TILE, y)
        ctx.lineTo(side === -1 ? 3.4 : TILE - 3.4, y + v.range(-0.4, 0.4))
        ctx.stroke()
      }
      ctx.restore()
      break
    case 'cloud':
      // Cloud has no cliff: the edge tears instead of shearing.
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = '#000'
      for (let i = 0; i < 2 + v.int(2); i++) {
        ctx.fill(ellipsePath(side === -1 ? -0.4 : TILE + 0.4, v.range(1, TILE - 1), v.range(1.4, 3), v.range(1.4, 3), 0))
      }
      ctx.restore()
      break
    default:
      break
  }

  // Fracture running down the face, and a chip taken out of the silhouette so
  // a long cliff does not read as a ruler-straight wall.
  if (v.chance(0.55)) {
    ctx.save()
    ctx.globalAlpha = 0.26
    ctx.strokeStyle = rock.deep
    ctx.lineWidth = 0.3
    const fx = side === -1 ? v.range(1.2, 3.4) : TILE - v.range(1.2, 3.4)
    ctx.stroke(curve([
      [fx, v.range(-1, 3)],
      [fx + v.range(-1, 1), TILE * 0.5],
      [fx + v.range(-1.4, 1.4), TILE + 1],
    ] as Pt[]))
    ctx.restore()
  }

  if (v.chance(0.5)) {
    const cy = v.range(2, TILE - 2)
    const d = v.range(0.4, 1.2)
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000'
    ctx.fill(ellipsePath(side === -1 ? -d * 0.2 : TILE + d * 0.2, cy, d, v.range(1.2, 2.6), 0))
    ctx.restore()
  }
}

/** The underside of an overhang: occluded, with whatever hangs off it. */
function underside(ctx: CanvasRenderingContext2D, t: Terrain, v: Vary): void {
  const rock = cel(t.rock)
  gradientFill(ctx, roundRectPath(0, TILE - 6, TILE, 6, 0), 0, TILE, 0, TILE - 6, [
    [0, rgba(PAL.ink, 0.5)],
    [1, rgba(PAL.ink, 0)],
  ])
  const n = v.int(4)
  ctx.save()
  ctx.fillStyle = rock.deep
  for (let i = 0; i < n; i++) {
    const x = v.range(1.5, TILE - 1.5)
    const w = v.range(0.5, 1.4)
    ctx.fill(
      blob([
        [x - w, TILE - 1.2],
        [x + w, TILE - 1.2],
        [x + v.range(-0.8, 0.8), TILE + v.range(0.6, 2.4)],
      ] as Pt[], 0.6),
    )
  }
  ctx.restore()
  // Something hanging off the underside: a root, a vine, a strand of weed.
  if (v.chance(0.3)) {
    const x = v.range(2, TILE - 2)
    ctx.save()
    ctx.globalAlpha = 0.7
    ctx.strokeStyle = cel(t.moss).shade
    ctx.lineWidth = v.range(0.25, 0.5)
    ctx.lineCap = 'round'
    ctx.stroke(curve([
      [x, TILE - 2],
      [x + v.range(-1, 1), TILE + v.range(1, 3)],
      [x + v.range(-2, 2), TILE + v.range(3, 6)],
    ] as Pt[]))
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Solid ground
// ─────────────────────────────────────────────────────────────────────────────

export function paintSolid({ ctx, mask, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x51ed))
  const openN = (mask & 1) === 0
  const openE = (mask & 2) === 0
  const openS = (mask & 4) === 0
  const openW = (mask & 8) === 0

  // The mass, flat. Depth below the surface is added by the renderer.
  ctx.fillStyle = cel(t.soil).core
  ctx.fillRect(0, 0, TILE, TILE)

  bedding(ctx, t, v, light)
  inclusions(ctx, v, t, light)

  if (openN) capBand(ctx, t, v, light, openW, openE)
  if (openW) face(ctx, t, v, light, -1)
  if (openE) face(ctx, t, v, light, 1)
  if (openS) underside(ctx, t, v)

  // Inner corner: a tile with ground above it but open air beside it sits in
  // the crease, and creases are dark.
  if (!openN && (openW || openE)) {
    gradientFill(ctx, roundRectPath(0, 0, TILE, 5, 0), 0, 0, 0, 5, [
      [0, rgba(PAL.ink, 0.3)],
      [1, rgba(PAL.ink, 0)],
    ])
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The crown — what overhangs the surface into the tile above
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grass, crust, wisps and fungus that break the ground's top edge.
 *
 * This lives in the cell *above* the ground tile, which is the only way to get
 * a genuinely irregular silhouette against the sky without moving the surface
 * the player stands on. The renderer blits only the lower half of the cell.
 *
 * Repetition is fought three ways: the atlas gives this id sixteen variants
 * rather than six (it needs them more than any other tile, and it only cares
 * about two mask bits, so the cells are there to spend); the renderer mirrors
 * half of them; and everything inside is *clumped* rather than spread, so a
 * run of ground has thickets and bald patches instead of an even comb.
 */
export function paintCrown({ ctx, mask, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x9a3c))
  const openE = (mask & 2) === 0
  const openW = (mask & 8) === 0
  const base = TILE

  // Density is the first thing drawn from the stream, so a variant is bald or
  // lush as a whole rather than tile-by-tile — a run of ground then has thick
  // patches and thin patches instead of an even comb.
  const density = v.next()
  const lush = density > 0.55
  const bare = density < 0.18

  // Clump centres. Growth gathers where the ground holds water; spreading tufts
  // uniformly across the cell is what produced the old picket fence.
  const clumps: number[] = []
  const nClumps = bare ? 1 : 1 + v.int(2)
  for (let i = 0; i < nClumps; i++) clumps.push(v.range(-1, TILE + 1))
  const spread = v.range(2.2, 5.5)
  const at = (): number => clumps[v.int(clumps.length)] + (v.next() + v.next() - 1) * spread

  switch (t.crown) {
    case 'crust': {
      const cap = cel(t.cap)
      const n = bare ? 1 : 2 + v.int(3)
      for (let i = 0; i < n; i++) {
        const x = at()
        const w = v.range(2.5, 6)
        const h = v.range(0.5, lush ? 2.2 : 1.1)
        ctx.save()
        ctx.fillStyle = cap.core
        ctx.fill(blob([
          [x - w, base + 1],
          [x - w * 0.5, base - h * 0.7],
          [x + v.range(-1, 1), base - h],
          [x + w * 0.6, base - h * 0.6],
          [x + w, base + 1],
        ] as Pt[], 0.9))
        ctx.globalAlpha = 0.7
        ctx.strokeStyle = cap.light
        ctx.lineWidth = 0.35
        ctx.stroke(curve([[x - w * 0.7, base - h * 0.4], [x, base - h * 0.9], [x + w * 0.7, base - h * 0.4]] as Pt[]))
        ctx.restore()
      }
      // A dry twig or a wind-rolled pebble on the crust.
      if (!bare && v.chance(0.35)) {
        const x = at()
        paint(ctx, ellipsePath(x, base - v.range(0.8, 1.6), v.range(0.8, 1.5), v.range(0.6, 1.1), v.range(0, 1)), cel(t.grit), {
          shadow: 0.5, radius: 1.2, pivot: [x, base - 1], rim: 0.25, line: 0.28, light,
        })
      }
      if (lush && v.chance(0.3)) {
        // A tuft of dead scrub, bleached to nearly the sand's own value.
        const x = at()
        ctx.save()
        ctx.globalAlpha = 0.75
        ctx.strokeStyle = cel(mix(t.cap, t.grit, 0.5)).shade
        ctx.lineWidth = 0.3
        for (let i = 0; i < 4; i++) {
          ctx.stroke(curve([[x, base], [x + v.range(-1.5, 1.5), base - v.range(1.5, 3)], [x + v.range(-3, 3), base - v.range(2.5, 4.5)]] as Pt[]))
        }
        ctx.restore()
      }
      break
    }
    case 'wisp': {
      const cap = cel(t.cap)
      const n = bare ? 1 : 3 + v.int(4)
      for (let i = 0; i < n; i++) {
        const x = at()
        const h = v.range(2, lush ? 7 : 3.5)
        const lean = v.range(-2.5, 2.5)
        const w = v.range(0.35, 0.75)
        ctx.save()
        ctx.globalAlpha = v.range(0.4, 0.8)
        ctx.fillStyle = i % 4 === 0 ? cel(t.moss).core : cap.core
        ctx.fill(blob([
          [x - w, base + 0.5],
          [x + w, base + 0.5],
          [x + lean * 0.5 + w * 0.4, base - h * 0.6],
          [x + lean, base - h],
        ] as Pt[], 0.7))
        ctx.restore()
      }
      // Motes of cloud-light drifting off the turf.
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.fillStyle = PAL.white
      for (let i = 0; i < 2; i++) {
        ctx.fill(ellipsePath(v.range(1, TILE - 1), base - v.range(2, 7), v.range(0.4, 1), v.range(0.3, 0.6), 0))
      }
      ctx.restore()
      // A golden seed-pod on a stem: Skypiea's turf is not grass, and one
      // unmistakably not-grass shape per few tiles is what says so.
      if (lush && v.chance(0.4)) {
        const x = at()
        const h = v.range(4, 7)
        ctx.save()
        ctx.strokeStyle = cel(t.moss).core
        ctx.lineWidth = 0.35
        ctx.stroke(curve([[x, base], [x + v.range(-1, 1), base - h * 0.6], [x + v.range(-2, 2), base - h]] as Pt[]))
        ctx.restore()
        paint(ctx, ellipsePath(x + v.range(-2, 2), base - h, 0.9, 1.4, v.range(-0.4, 0.4)), cel(t.accent), {
          shadow: 0.4, radius: 1.2, pivot: [x, base - h], rim: 0.3, line: 0.25, light,
        })
      }
      break
    }
    case 'boards': {
      // A dock lip: low, worked, with iron. It should never look like foliage.
      const timber = cel(t.timber)
      paint(ctx, roundRectPath(0, base - 1.5, TILE, 1.7, 0.3), timber, {
        shadow: 0.3, radius: 1, pivot: [TILE / 2, base - 0.8], rim: 0.3, line: 0.3, light,
      })
      rivets(ctx, [2.5, TILE - 2.5], base - 0.8, cel(t.metal), 0.35)
      if (lush && v.chance(0.4)) {
        // A bollard with a rope turned around it — the quay's one silhouette.
        const x = v.range(4, TILE - 4)
        paint(ctx, roundRectPath(x - 1.5, base - 5.4, 3, 4, 1), cel(t.metal), {
          shadow: 0.42, radius: 1.8, pivot: [x, base - 3.4], rim: 0.35, line: 0.35, light,
        })
        paint(ctx, ellipsePath(x, base - 5.4, 2, 0.9, 0), cel(t.metal), {
          shadow: 0.4, radius: 1.4, pivot: [x, base - 5.4], rim: 0.3, line: 0.3, light,
        })
        rope(ctx, curve([
          [x - 2.6, base - 1.2],
          [x - 0.4, base - 3],
          [x + 2.4, base - 1.6],
        ] as Pt[]), cel(mix(t.timber, PAL.sand, 0.5)), 0.9)
      } else if (v.chance(0.4)) {
        ctx.save()
        ctx.globalAlpha = 0.5
        ctx.fillStyle = cel(t.moss).core
        ctx.fill(blob([
          [v.range(1, TILE - 3), base],
          [v.range(2, TILE - 2), base - v.range(0.8, 1.8)],
          [v.range(3, TILE - 1), base],
        ] as Pt[], 0.8))
        ctx.restore()
      }
      break
    }
    case 'fungus': {
      const cap = cel(t.cap)
      const moss = cel(t.moss)
      const n = bare ? 0 : 1 + v.int(3)
      for (let i = 0; i < n; i++) {
        const x = at()
        const h = v.range(2.5, lush ? 6.5 : 4)
        const lean = v.range(-1.6, 1.6)
        // Stalk, then a heavy cap that overhangs it — the silhouette has to be
        // top-heavy or it reads as grass.
        paint(ctx, roundRectPath(x - 0.45, base - h, 0.9, h, 0.4), cel(t.grit), {
          shadow: 0.45, radius: 0.9, pivot: [x, base - h / 2], line: 0.25, light,
        })
        const r = v.range(1.4, 2.6)
        paint(
          ctx,
          blob([
            [x + lean - r, base - h + 0.4],
            [x + lean, base - h - r * 0.9],
            [x + lean + r, base - h + 0.4],
            [x + lean, base - h + 0.9],
          ] as Pt[], 0.9),
          i % 2 === 0 ? moss : cap,
          { shadow: 0.4, radius: r, pivot: [x + lean, base - h], rim: 0.4, line: 0.32, light },
        )
      }
      // A wrought-iron railing spike, rusted, left over from the ship this
      // island used to be.
      if (v.chance(0.3)) {
        const x = at()
        paint(ctx, blob([
          [x - 0.55, base],
          [x + 0.55, base],
          [x + 0.35, base - v.range(3.5, 6)],
          [x, base - v.range(6.5, 8)],
          [x - 0.35, base - v.range(3.5, 6)],
        ] as Pt[], 0.4), cel(t.metal), {
          shadow: 0.5, radius: 2, pivot: [x, base - 4], rim: 0.3, line: 0.3, light,
        })
      }
      if (v.chance(0.45)) {
        ctx.save()
        ctx.globalAlpha = 0.75
        ctx.strokeStyle = cel(t.timber).deep
        ctx.lineWidth = 0.4
        const x = at()
        ctx.stroke(curve([[x, base], [x + v.range(-2, 2), base - 2.5], [x + v.range(-3.5, 3.5), base - v.range(3, 5.5)]] as Pt[]))
        ctx.restore()
      }
      break
    }
    case 'ash': {
      const cap = cel(t.cap)
      const n = bare ? 1 : 2 + v.int(3)
      for (let i = 0; i < n; i++) {
        const x = at()
        const w = v.range(2, 5)
        const h = v.range(0.6, lush ? 2.6 : 1.2)
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.fillStyle = i % 2 === 0 ? cap.core : cel(t.rock).light
        ctx.fill(blob([
          [x - w, base + 1],
          [x - w * 0.4, base - h],
          [x + w * 0.5, base - h * 0.7],
          [x + w, base + 1],
        ] as Pt[], 0.9))
        ctx.restore()
      }
      // Blossom caught on the rock. Two or three petals, never a drift — the
      // wind carries them, the ground does not grow them.
      if (v.chance(0.5)) {
        const petal = cel(t.accent)
        for (let i = 0; i < 1 + v.int(3); i++) {
          const x = v.range(0.5, TILE - 0.5)
          const y = base - v.range(0.4, 5)
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(v.range(-1, 1))
          paint(ctx, blob([[-0.9, 0], [0, -0.75], [0.9, 0], [0, 0.5]] as Pt[], 1), petal, {
            shadow: 0.35, radius: 0.9, pivot: [0, 0], rim: 0.2, line: 0.2, light,
          })
          ctx.restore()
        }
      }
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = rgba(PAL.ember, 0.4)
      for (let i = 0; i < 1 + v.int(2); i++) {
        ctx.fill(ellipsePath(v.range(1, TILE - 1), base - v.range(0.5, 5), v.range(0.2, 0.45), v.range(0.2, 0.45), 0))
      }
      ctx.restore()
      break
    }
    default: {
      // Grass. Height, width, lean and spacing all come off the stream, and the
      // balder variants leave real gaps so a run of ground breathes.
      const cap = cel(t.cap)
      // The back rank is only a shade deeper than the front. Dropping it all the
      // way to the moss tone turned the fringe into a row of dark spikes.
      const back = cel(mix(t.cap, t.moss, 0.55))
      const n = bare ? 1 + v.int(2) : lush ? 7 + v.int(5) : 3 + v.int(4)
      for (let i = 0; i < n; i++) {
        const front = i >= n / 2
        const x = at()
        // Squaring the roll gives a few tall blades and many short ones, which
        // is what a real fringe looks like; a flat range gives a comb.
        const roll = v.next()
        const h = (1.3 + roll * roll * (lush ? 6.6 : 3.4)) * (front ? 1 : 0.72)
        const w = v.range(0.5, 1.4)
        let lean = v.range(-2.4, 2.4)
        // Blades at an exposed edge fall away from the cliff.
        if (openW && x < 4) lean -= v.range(0.5, 2)
        if (openE && x > TILE - 4) lean += v.range(0.5, 2)
        const blade = blob([
          [x - w, base + 1],
          [x + w, base + 1],
          [x + lean * 0.55 + w * 0.3, base - h * 0.62],
          [x + lean, base - h],
        ] as Pt[], 0.75)
        paint(ctx, blade, front ? cap : back, {
          shadow: front ? 0.34 : 0.6, radius: Math.max(1.2, h * 0.5),
          pivot: [x, base - h * 0.5], rim: front && h > 3 ? 0.35 : 0, line: 0, light,
        })
      }
      // A seed head on the odd tall blade — detail where the eye goes.
      if (lush && v.chance(0.3)) {
        const x = at()
        const h = v.range(4, 6.5)
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.fillStyle = cap.light
        ctx.fill(ellipsePath(x, base - h, 0.5, 1.1, v.range(-0.5, 0.5)))
        ctx.restore()
      }
      // One flower in a handful of tiles. It is the whole reason the headland
      // reads as somewhere pleasant rather than as a green stripe.
      if (v.chance(0.16)) {
        const x = at()
        const h = v.range(3, 5.5)
        ctx.save()
        ctx.strokeStyle = back.shade
        ctx.lineWidth = 0.3
        ctx.stroke(curve([[x, base], [x + v.range(-0.6, 0.6), base - h * 0.6], [x + v.range(-1.2, 1.2), base - h]] as Pt[]))
        ctx.restore()
        const fx = x + v.range(-1.2, 1.2)
        const petals = cel(v.chance(0.5) ? PAL.cream : PAL.namiOrange)
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU
          ctx.save()
          ctx.fillStyle = petals.core
          ctx.fill(ellipsePath(fx + Math.cos(a) * 0.65, base - h + Math.sin(a) * 0.65, 0.55, 0.4, a))
          ctx.restore()
        }
        ctx.fillStyle = cel(PAL.gold).core
        ctx.beginPath()
        ctx.arc(fx, base - h, 0.35, 0, TAU)
        ctx.fill()
      }
      break
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Slopes
// ─────────────────────────────────────────────────────────────────────────────

function paintSlope(dir: 1 | -1): TilePainter {
  return ({ ctx, variant, biome }) => {
    const t = terrainOf(biome)
    const light = lightOf(biome)
    const v = new Vary(hash2(variant, dir === 1 ? 0x3311 : 0x77aa))
    const wedge = blob(
      dir === 1
        ? ([[0, TILE + 1], [TILE + 1, -1], [TILE + 1, TILE + 1]] as Pt[])
        : ([[-1, -1], [TILE + 1, TILE + 1], [-1, TILE + 1]] as Pt[]),
      0,
    )

    ctx.save()
    ctx.clip(wedge)
    ctx.fillStyle = cel(t.soil).core
    ctx.fillRect(0, 0, TILE, TILE)
    bedding(ctx, t, v, light)
    inclusions(ctx, v, t, light)
    ctx.restore()

    // The cap runs along the diagonal, thick enough to read at speed.
    const cap = cel(t.cap)
    const a: Pt = dir === 1 ? [-1, TILE + 1] : [TILE + 1, TILE + 1]
    const b: Pt = dir === 1 ? [TILE + 1, -1] : [-1, -1]
    ctx.save()
    ctx.clip(wedge)
    const band = new Path2D()
    band.moveTo(a[0], a[1])
    band.lineTo(b[0], b[1])
    band.lineTo(b[0] + dir * -4.6, b[1] + 4.6)
    band.lineTo(a[0] + dir * -4.6, a[1] + 4.6)
    band.closePath()
    paint(ctx, band, cap, {
      shadow: 0.26, radius: 4, pivot: [TILE / 2, TILE / 2], rim: 0.6, line: 0, light,
    })
    ctx.strokeStyle = cap.light
    ctx.globalAlpha = 0.85
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(a[0], a[1] - 0.4)
    ctx.lineTo(b[0], b[1] - 0.4)
    ctx.stroke()
    ctx.restore()

    // Whatever grows on the flat grows on the slope too, lying along it.
    ctx.save()
    ctx.clip(wedge)
    ctx.globalAlpha = 0.9
    const n = 2 + v.int(4)
    for (let i = 0; i < n; i++) {
      const s = v.range(0.05, 0.95)
      const px = a[0] + (b[0] - a[0]) * s
      const py = a[1] + (b[1] - a[1]) * s
      const h = v.range(1.2, 3.6)
      const lean = dir * v.range(0.4, 2)
      ctx.fillStyle = i % 3 === 0 ? cel(t.moss).core : cap.shade
      ctx.fill(blob([
        [px - 0.9, py + 0.6],
        [px + 0.9, py + 0.6],
        [px + lean, py - h],
      ] as Pt[], 0.7))
    }
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Built tiles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A one-way platform.
 *
 * The gap below the deck is the whole readability trick — a tile you can jump
 * through must not have a filled underside — but *what the deck is made of* is
 * how the island introduces itself, so every biome builds it differently out of
 * its own timber and its own fixings.
 */
function paintOneWay({ ctx, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x1f0d))
  const timber = cel(t.timber)
  const metal = cel(t.metal)

  // The deck: two boards with a shadowed edge under them, common to every kind.
  plank(ctx, v, 0, 0.4, TILE, 3.2, timber, light, 2)
  plank(ctx, v, 0, 3.9, TILE, 2.1, cel(mix(t.timber, PAL.ink, 0.28)), light, 1)
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = rgba(PAL.ink, 0.5)
  ctx.fillRect(0, 5.8, TILE, 0.7)
  ctx.restore()

  switch (t.joinery) {
    case 'dock': {
      // A jetty. The deck runs on unbroken; each variant carries at most one
      // fitting, at its own place along the span, so a long platform reads as a
      // walkway with the odd cleat rather than as a row of identical stamps.
      const cord = cel(mix(t.timber, PAL.sand, 0.55))
      const fitting = v.int(4)
      const fx = v.range(3, TILE - 3)
      if (fitting === 0) {
        // A rope turn taken around the deck.
        rope(ctx, curve([[fx - 1.8, -0.2], [fx + 0.4, 3], [fx - 1.5, 6.2]] as Pt[]), cord, 1)
      } else if (fitting === 1) {
        // An iron strap over the joint, riveted through.
        paint(ctx, roundRectPath(fx - 1, 0.1, 2, 6.1, 0.4), metal, {
          shadow: 0.42, radius: 1.2, pivot: [fx, 3], rim: 0.3, line: 0.3, light,
        })
        rivets(ctx, [fx], 1.4, metal, 0.4)
        rivets(ctx, [fx], 4.7, metal, 0.4)
      } else if (fitting === 2) {
        // The butt joint between two boards, and the nails holding it down.
        ctx.save()
        ctx.globalAlpha = 0.55
        ctx.strokeStyle = timber.deep
        ctx.lineWidth = 0.4
        ctx.beginPath()
        ctx.moveTo(fx, 0.4)
        ctx.lineTo(fx + v.range(-0.3, 0.3), 5.9)
        ctx.stroke()
        ctx.restore()
        rivets(ctx, [fx - 1.4, fx + 1.4], 2, cel(mix(t.metal, PAL.ink, 0.2)), 0.3)
      }
      break
    }
    case 'palm': {
      // A bleached beam on palm-fibre binding, with a strip of awning canvas.
      const fibre = cel(mix(t.timber, PAL.ink, 0.3))
      for (const x of [3, TILE - 3]) {
        ctx.save()
        ctx.globalAlpha = 0.85
        ctx.fillStyle = fibre.core
        ctx.fill(roundRectPath(x - 1.1, 0.2, 2.2, 5.8, 0.4))
        ctx.globalAlpha = 0.6
        ctx.strokeStyle = fibre.deep
        ctx.lineWidth = 0.28
        for (let y = 0.8; y < 5.6; y += 1.1) {
          ctx.beginPath()
          ctx.moveTo(x - 1.1, y)
          ctx.lineTo(x + 1.1, y + 0.5)
          ctx.stroke()
        }
        ctx.restore()
      }
      // Canvas hanging under the beam, stirred by the desert wind.
      ctx.save()
      ctx.fillStyle = cel(mix(PAL.cream, t.accent, 0.25)).core
      ctx.fill(blob([
        [4, 5.9], [TILE - 4, 5.9], [TILE - 5, 8.4], [8, 7.4], [5, 8.6],
      ] as Pt[], 0.6))
      ctx.globalAlpha = 0.4
      ctx.fillStyle = cel(t.accent).core
      ctx.fillRect(6.5, 5.9, 1.6, 2.2)
      ctx.fillRect(10.5, 5.9, 1.6, 1.8)
      ctx.restore()
      break
    }
    case 'skywood': {
      // Pale board bound with living vine; a leaf turned to the light.
      const vine = cel(t.moss)
      ctx.save()
      ctx.strokeStyle = vine.core
      ctx.lineWidth = 0.55
      ctx.lineCap = 'round'
      ctx.stroke(curve([[-1, 4.6], [4, 1.2], [9, 5], [14, 1.4], [TILE + 1, 3.6]] as Pt[]))
      ctx.strokeStyle = vine.light
      ctx.lineWidth = 0.22
      ctx.translate(-0.2, -0.25)
      ctx.stroke(curve([[-1, 4.6], [4, 1.2], [9, 5], [14, 1.4], [TILE + 1, 3.6]] as Pt[]))
      ctx.restore()
      for (const [lx, ly] of [[4.6, 1.4], [13.4, 1.6]] as Pt[]) {
        paint(ctx, blob([[lx - 1.4, ly], [lx, ly - 1.5], [lx + 1.4, ly], [lx, ly + 0.9]] as Pt[], 1), vine, {
          shadow: 0.35, radius: 1.4, pivot: [lx, ly], rim: 0.3, line: 0.25, light,
        })
      }
      glint(ctx, 3, 1.4, 2.4, 0.5, -0.05, PAL.white, 0.4)
      break
    }
    case 'shipyard': {
      // Iron end plates, rivets, and a rail: everything here came out of a yard.
      for (const x of [0.2, TILE - 3.4]) {
        paint(ctx, roundRectPath(x, 0.2, 3.2, 5.9, 0.5), metal, {
          shadow: 0.44, radius: 1.8, pivot: [x + 1.6, 3], rim: 0.35, line: 0.3, light,
        })
        rivets(ctx, [x + 0.9, x + 2.3], 1.3, metal, 0.36)
        rivets(ctx, [x + 0.9, x + 2.3], 4.9, metal, 0.36)
      }
      paint(ctx, roundRectPath(3.6, -0.4, TILE - 7.2, 1.5, 0.4), cel(mix(t.metal, PAL.mist, 0.3)), {
        shadow: 0.36, radius: 1, pivot: [TILE / 2, 0.4], rim: 0.35, line: 0.25, light,
      })
      break
    }
    case 'coffin': {
      // A board that has already given up: warped, split, held by rusted iron.
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = '#000'
      for (let i = 0; i < 2; i++) {
        const x = v.range(2, TILE - 3)
        ctx.fill(blob([[x, 6.2], [x + v.range(0.6, 1.6), 3.4], [x + v.range(1.6, 3), 6.4]] as Pt[], 0.5))
      }
      ctx.restore()
      for (const x of [2.8, TILE - 2.8]) {
        paint(ctx, roundRectPath(x - 1.1, -0.2, 2.2, 6.6, 0.3), cel(mix(t.metal, PAL.ink, 0.2)), {
          shadow: 0.5, radius: 1.4, pivot: [x, 3], rim: 0.25, line: 0.3, light,
        })
        rivets(ctx, [x], 0.9, metal, 0.34)
        rivets(ctx, [x], 5.2, metal, 0.34)
      }
      // Rust bleeding down from the fixings.
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.fillStyle = cel(PAL.bloodOrange).shade
      ctx.fill(blob([[2.4, 5.6], [3.4, 5.6], [3, 8.2], [2.6, 7]] as Pt[], 0.6))
      ctx.restore()
      break
    }
    case 'lacquer': {
      // A lacquered beam with a gold band and pegged ends — joinery, not nails.
      ctx.save()
      ctx.globalAlpha = 0.5
      ctx.fillStyle = cel(PAL.ink).core
      ctx.fillRect(0, 0.4, TILE, 0.5)
      ctx.restore()
      paint(ctx, roundRectPath(0, 1.6, TILE, 1.2, 0.2), cel(mix(PAL.gold, t.timber, 0.25)), {
        shadow: 0.3, radius: 0.8, pivot: [TILE / 2, 2.2], rim: 0.25, line: 0.2, light,
      })
      for (const x of [3, TILE - 3]) {
        paint(ctx, roundRectPath(x - 0.8, 3.9, 1.6, 2.1, 0.3), cel(mix(t.timber, PAL.ink, 0.35)), {
          shadow: 0.45, radius: 1, pivot: [x, 5], line: 0.25, light,
        })
      }
      glint(ctx, 4.5, 1, 3, 0.4, -0.03, PAL.white, 0.45)
      break
    }
  }
}

/**
 * The breakable block.
 *
 * It has to read as *laid* — something a person built and something a person
 * can knock down — so every biome gets coursed units with a joint, and the
 * courses are pinned to the cell so a wall of them lines up.
 */
function paintBrick({ ctx, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x4c21))

  const courses = (n: number, c: Cel, stagger: number, strength: number): void => {
    const h = TILE / n
    for (let r = 0; r < n; r++) {
      const y = r * h
      const off = r % 2 === 0 ? 0 : -stagger
      for (let x = off; x < TILE; x += stagger * 2) {
        const bx = Math.max(0, x)
        const bw = Math.min(x + stagger * 2, TILE) - bx
        if (bw < 1.5) continue
        const tone = mix(c.core, v.chance(0.5) ? c.light : c.shade, v.range(0, 0.3))
        block(ctx, bx + 0.4, y + 0.4, bw - 0.8, h - 0.8, cel(tone), light, strength)
      }
    }
  }

  switch (t.masonry) {
    case 'adobe': {
      // Sun-bleached mudbrick: big soft units, straw in the mix, hairline
      // shrinkage cracks and a dusting of sand on every upward edge.
      const c = cel(mix(t.cap, PAL.sand, 0.35))
      ctx.fillStyle = cel(mix(t.rock, PAL.ink, 0.2)).core
      ctx.fillRect(0, 0, TILE, TILE)
      courses(2, c, 4, 0.6)
      crackNet(ctx, v, 1, 1, TILE - 2, TILE - 2, c.deep, 2, 0.3)
      ctx.save()
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = c.light
      ctx.lineWidth = 0.22
      for (let i = 0; i < 5; i++) {
        const x = v.range(1, TILE - 3)
        const y = v.range(1, TILE - 1)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + v.range(1, 2.4), y + v.range(-0.4, 0.4))
        ctx.stroke()
      }
      ctx.restore()
      break
    }
    case 'skystone': {
      // One pale golden ashlar with a chiselled spiral. Skypiea's ruins are
      // carved, not stacked.
      const c = cel(mix(t.rock, PAL.gold, 0.22))
      paint(ctx, roundRectPath(0.4, 0.4, TILE - 0.8, TILE - 0.8, 1.2), c, {
        shadow: 0.34, radius: 7, pivot: [TILE / 2, TILE / 2], rim: 0.6, line: 0.5, light,
      })
      ctx.save()
      ctx.globalAlpha = 0.6
      ctx.strokeStyle = cel(t.metal).shade
      ctx.lineWidth = 0.5
      ctx.lineCap = 'round'
      const spiral = new Path2D()
      for (let i = 0; i <= 26; i++) {
        const a = (i / 26) * TAU * 1.5
        const r = 1 + (i / 26) * 4
        const px = TILE / 2 + Math.cos(a) * r
        const py = TILE / 2 + Math.sin(a) * r
        if (i === 0) spiral.moveTo(px, py)
        else spiral.lineTo(px, py)
      }
      ctx.stroke(spiral)
      ctx.restore()
      // A vine that has found the ruin.
      if (v.chance(0.5)) {
        ctx.save()
        ctx.strokeStyle = cel(t.moss).core
        ctx.lineWidth = 0.45
        ctx.stroke(curve([[TILE, v.range(2, 6)], [10, v.range(6, 10)], [v.range(2, 6), TILE]] as Pt[]))
        ctx.restore()
      }
      break
    }
    case 'wet': {
      // Dressed stone standing in salt water: dark below the tide line, shelled,
      // and strapped with an iron tie-plate.
      const c = cel(t.rock)
      ctx.fillStyle = c.deep
      ctx.fillRect(0, 0, TILE, TILE)
      courses(3, c, 4, 0.55)
      ctx.save()
      ctx.globalAlpha = 0.3
      ctx.fillStyle = cel(t.moss).core
      ctx.fillRect(0, TILE * 0.58, TILE, TILE * 0.42)
      ctx.restore()
      barnacles(ctx, v, 1, TILE * 0.6, TILE - 2, TILE * 0.35, cel(mix(PAL.mist, t.rock, 0.3)), 2 + v.int(3))
      const metal = cel(t.metal)
      paint(ctx, roundRectPath(1.4, TILE / 2 - 1.4, TILE - 2.8, 2.8, 0.5), metal, {
        shadow: 0.44, radius: 1.6, pivot: [TILE / 2, TILE / 2], rim: 0.3, line: 0.3, light,
      })
      rivets(ctx, [2.8, TILE - 2.8], TILE / 2, metal, 0.45)
      break
    }
    case 'crypt': {
      // Old grave-stone: cracked, strapped with rusted iron, lichen in the cuts.
      const c = cel(mix(t.rock, PAL.mist, 0.16))
      ctx.fillStyle = c.deep
      ctx.fillRect(0, 0, TILE, TILE)
      courses(2, c, 8, 0.5)
      crackNet(ctx, v, 1, 1, TILE - 2, TILE - 2, c.deep, 2, 0.45)
      const metal = cel(mix(t.metal, PAL.ink, 0.25))
      paint(ctx, roundRectPath(TILE / 2 - 1.2, -0.4, 2.4, TILE + 0.8, 0.4), metal, {
        shadow: 0.5, radius: 1.4, pivot: [TILE / 2, TILE / 2], rim: 0.25, line: 0.3, light,
      })
      rivets(ctx, [TILE / 2], 2.4, metal, 0.4)
      rivets(ctx, [TILE / 2], TILE - 2.4, metal, 0.4)
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.fillStyle = cel(t.moss).core
      ctx.fill(ellipsePath(v.range(2, 5), v.range(2, TILE - 2), v.range(1, 2.4), v.range(0.8, 1.6), 0))
      ctx.restore()
      break
    }
    case 'castle': {
      // Cut stone with wide dark joints and a chisel-dressed face: a castle
      // wall, and the only bright thing on it is the lacquered course above.
      const c = cel(mix(t.rock, PAL.mist, 0.2))
      ctx.fillStyle = cel(PAL.ink).core
      ctx.fillRect(0, 0, TILE, TILE)
      courses(2, c, 8, 0.5)
      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.strokeStyle = c.deep
      ctx.lineWidth = 0.22
      for (let i = 0; i < 9; i++) {
        const x = v.range(0.5, TILE - 3)
        const y = v.range(0.5, TILE - 1)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + 2.4, y - 1.2)
        ctx.stroke()
      }
      ctx.restore()
      paint(ctx, roundRectPath(-0.4, -0.4, TILE + 0.8, 2.2, 0.3), cel(t.timber), {
        shadow: 0.36, radius: 1.4, pivot: [TILE / 2, 0.8], rim: 0.3, line: 0.3, light,
      })
      break
    }
    default: {
      // Harbour granite: rounded blocks worn by a century of boots and salt,
      // with moss packed into every joint.
      const c = cel(mix(t.rock, PAL.mist, 0.22))
      ctx.fillStyle = cel(t.moss).deep
      ctx.fillRect(0, 0, TILE, TILE)
      courses(3, c, 4, 0.55)
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.fillStyle = cel(t.moss).core
      for (let i = 0; i < 3; i++) {
        const y = v.pick([TILE / 3, (TILE / 3) * 2])
        ctx.fill(ellipsePath(v.range(2, TILE - 2), y + v.range(-0.6, 0.6), v.range(1.4, 3.4), v.range(0.4, 0.9), 0))
      }
      ctx.restore()
      // One block carries an iron mooring ring.
      if (v.chance(0.4)) {
        const metal = cel(t.metal)
        const rx = v.range(4, TILE - 4)
        const ry = v.range(4, TILE - 4)
        ctx.save()
        ctx.strokeStyle = metal.core
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.arc(rx, ry, 2, 0, TAU)
        ctx.stroke()
        ctx.strokeStyle = metal.light
        ctx.lineWidth = 0.3
        ctx.beginPath()
        ctx.arc(rx - 0.2, ry - 0.2, 2, Math.PI * 0.8, Math.PI * 1.7)
        ctx.stroke()
        ctx.restore()
      }
      break
    }
  }

  // Chipped corners: a brick you are meant to smash should already look abused.
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000'
  for (let i = 0; i < 2; i++) {
    if (!v.chance(0.5)) continue
    const cx = v.chance(0.5) ? 0 : TILE
    ctx.fill(ellipsePath(cx, v.range(0, TILE), v.range(0.4, 1), v.range(0.5, 1.4), 0))
  }
  ctx.restore()
}

/**
 * The housing every prize block sits in.
 *
 * The gold face and the mark on it are interface and never change — a player
 * has to know a question block in a tenth of a second, on any island. What the
 * *frame* is made of is free, and it is what stops six biomes sharing one prop.
 */
function blockFrame(
  ctx: CanvasRenderingContext2D,
  t: Terrain,
  light: Light,
  spent: boolean,
): void {
  const frameTone = (): string => {
    switch (t.masonry) {
      case 'adobe': return mix(t.cap, PAL.sand, 0.3)
      case 'skystone': return mix(t.rock, PAL.gold, 0.2)
      case 'wet': return mix(t.metal, PAL.ink, 0.28)
      case 'crypt': return mix(t.metal, PAL.ink, 0.4)
      case 'castle': return mix(PAL.ink, t.timber, 0.35)
      default: return t.timber
    }
  }
  const frame = cel(spent ? mix(frameTone(), PAL.ink, 0.35) : frameTone())
  paint(ctx, roundRectPath(0.4, 0.4, TILE - 0.8, TILE - 0.8, 2.4), frame, {
    shadow: spent ? 0.55 : 0.36, radius: 7, pivot: [TILE / 2, TILE / 2],
    rim: spent ? 0.3 : 0.7, line: 0.6, light,
  })

  const metal = cel(spent ? mix(t.metal, PAL.ink, 0.4) : t.metal)
  const corners: Pt[] = [[2.9, 2.9], [TILE - 2.9, 2.9], [2.9, TILE - 2.9], [TILE - 2.9, TILE - 2.9]]
  switch (t.masonry) {
    case 'adobe':
      // Carved notches instead of fixings: nobody rivets mudbrick.
      ctx.save()
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = frame.deep
      ctx.lineWidth = 0.4
      for (const [cx, cy] of corners) {
        ctx.beginPath()
        ctx.moveTo(cx - 1, cy)
        ctx.lineTo(cx + 1, cy)
        ctx.stroke()
      }
      ctx.restore()
      break
    case 'skystone':
      for (const [cx, cy] of corners) {
        paint(ctx, ellipsePath(cx, cy, 1, 1, 0), cel(spent ? mix(PAL.gold, PAL.ink, 0.5) : PAL.gold), {
          shadow: 0.4, radius: 1, pivot: [cx, cy], rim: 0.3, line: 0.25, light,
        })
      }
      break
    case 'crypt':
      // Barbed studs: even the furniture on this island wants you off it.
      for (const [cx, cy] of corners) {
        paint(ctx, blob([[cx - 0.9, cy + 0.6], [cx, cy - 1.2], [cx + 0.9, cy + 0.6]] as Pt[], 0.4), metal, {
          shadow: 0.5, radius: 1, pivot: [cx, cy], rim: 0.25, line: 0.25, light,
        })
      }
      break
    case 'castle':
      for (const [cx, cy] of corners) {
        paint(ctx, blob([[cx - 1, cy], [cx, cy - 1], [cx + 1, cy], [cx, cy + 1]] as Pt[], 0.5),
          cel(spent ? mix(PAL.gold, PAL.ink, 0.5) : PAL.gold), {
            shadow: 0.4, radius: 1, pivot: [cx, cy], rim: 0.3, line: 0.22, light,
          })
      }
      break
    default:
      rivets(ctx, [corners[0][0], corners[1][0]], corners[0][1], metal, 0.75)
      rivets(ctx, [corners[2][0], corners[3][0]], corners[2][1], metal, 0.75)
      break
  }
}

function paintQuestion({ ctx, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const gold = cel(PAL.gold)
  blockFrame(ctx, t, light, false)

  // The face: a gold plate set into the frame. Identical on every island.
  paint(ctx, roundRectPath(2.6, 2.6, TILE - 5.2, TILE - 5.2, 1.4), gold, {
    shadow: 0.32, radius: 5, pivot: [TILE / 2, TILE / 2], rim: 0.6, line: 0.5, light,
  })
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = gold.deep
  ctx.lineWidth = 0.4
  ctx.stroke(roundRectPath(3.6, 3.6, TILE - 7.2, TILE - 7.2, 1))
  ctx.restore()

  const markColor = mix(PAL.goldDeep, PAL.ink, 0.55)
  ctx.save()
  ctx.strokeStyle = markColor
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.stroke(curve([[6, 6.4], [6.8, 5.1], [9, 5.4], [9.4, 6.8], [8, 7.9], [8, 9.2]] as Pt[]))
  ctx.beginPath()
  ctx.arc(8, 11.1, 0.95, 0, TAU)
  ctx.fillStyle = markColor
  ctx.fill()
  ctx.restore()
  glint(ctx, 5, 4.6, 1.7, 0.8, -0.7, PAL.white, 0.5)
}

function paintUsed({ ctx, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  blockFrame(ctx, t, light, true)
  const c = cel(mix(t.rock, PAL.ink, 0.3))
  paint(ctx, roundRectPath(2.6, 2.6, TILE - 5.2, TILE - 5.2, 1.4), c, {
    shadow: 0.55, radius: 5, pivot: [TILE / 2, TILE / 2], line: 0.5, light,
  })
  // Spent: the face is dished in and the bezel has lost its highlight.
  gradientFill(ctx, roundRectPath(3, 3, TILE - 6, TILE - 6, 1.2), 0, 3, 0, TILE - 3, [
    [0, rgba(PAL.ink, 0.42)],
    [1, rgba(PAL.ink, 0)],
  ])
}

/**
 * The hazard tile.
 *
 * Three barbs on a bed, always the same silhouette and always the same read —
 * but a desert impales you on bleached bone and a shipyard on rail spikes, and
 * that difference is most of what makes a level feel like a place.
 */
function paintSpike({ ctx, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light: Light = { x: -0.6, y: -0.8 }
  const v = new Vary(hash2(variant, 0x7e11))

  const bedTone = (): string => {
    switch (t.barb) {
      case 'bone': return mix(t.rock, PAL.sand, 0.3)
      case 'shard': return mix(t.rock, PAL.mist, 0.4)
      case 'blade': return t.timber
      case 'harpoon': return t.timber
      default: return mix(t.metal, PAL.ink, 0.4)
    }
  }
  const bed = cel(bedTone())
  paint(ctx, roundRectPath(0, TILE - 3.6, TILE, 3.6, 0.6), bed, {
    shadow: 0.45, radius: 2, pivot: [TILE / 2, TILE - 1.8], rim: 0.4, line: 0.5, light,
  })
  if (t.barb === 'bone') crackNet(ctx, v, 0.5, TILE - 3.4, TILE - 1, 3, bed.deep, 2, 0.4)
  else if (t.barb === 'harpoon' || t.barb === 'blade') {
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.strokeStyle = bed.deep
    ctx.lineWidth = 0.28
    for (const y of [TILE - 2.6, TILE - 1.2]) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(TILE, y)
      ctx.stroke()
    }
    ctx.restore()
  } else rivets(ctx, [1.6, TILE - 1.6], TILE - 1.6, cel(t.metal), 0.5)

  const steel = cel(mix(t.metal, PAL.mist, 0.35))
  const boneC = cel(mix(PAL.cream, t.grit, 0.3))
  const crystal = cel(mix(PAL.gold, PAL.cream, 0.35))

  for (let i = 0; i < 3; i++) {
    const x = 2.8 + i * 5.2
    const tip = v.range(1, 2.4)
    switch (t.barb) {
      case 'bone': {
        // A rib, snapped: uneven, matt, and never the same height twice.
        const h = tip + i * 0.6
        paint(ctx, blob([
          [x - 1.9, TILE - 3.2],
          [x - 0.8, TILE - 8],
          [x - 0.2, h],
          [x + 0.9, TILE - 7.4],
          [x + 1.9, TILE - 3.2],
        ] as Pt[], 0.55), boneC, {
          shadow: 0.44, radius: 2.4, pivot: [x, 8], rim: 0.45, line: 0.4, light,
        })
        ctx.save()
        ctx.globalAlpha = 0.4
        ctx.strokeStyle = boneC.deep
        ctx.lineWidth = 0.25
        ctx.stroke(curve([[x - 0.3, TILE - 4], [x - 0.5, TILE - 7], [x - 0.2, h + 1.5]] as Pt[]))
        ctx.restore()
        break
      }
      case 'shard': {
        // Grown, not forged: a faceted crystal with light inside it.
        const p = blob([
          [x - 1.8, TILE - 3.4],
          [x - 0.6, TILE - 8.5],
          [x, tip],
          [x + 0.7, TILE - 8],
          [x + 1.8, TILE - 3.4],
        ] as Pt[], 0.15)
        paint(ctx, p, crystal, {
          shadow: 0.4, radius: 2.4, pivot: [x, 8], rim: 0.55, line: 0.4, light,
        })
        ctx.save()
        ctx.globalAlpha = 0.55
        ctx.strokeStyle = crystal.light
        ctx.lineWidth = 0.3
        ctx.beginPath()
        ctx.moveTo(x, tip)
        ctx.lineTo(x - 0.3, TILE - 3.6)
        ctx.stroke()
        ctx.restore()
        break
      }
      case 'railspike': {
        // Square section, flat head, driven: the shape a yard would have.
        paint(ctx, blob([
          [x - 1.5, TILE - 3.4],
          [x - 1.5, TILE - 9],
          [x - 1.9, TILE - 9.6],
          [x + 1.9, TILE - 9.6],
          [x + 1.5, TILE - 9],
          [x + 1.5, TILE - 3.4],
        ] as Pt[], 0.1), steel, {
          shadow: 0.46, radius: 2.2, pivot: [x, 9], rim: 0.4, line: 0.5, light,
        })
        paint(ctx, blob([
          [x - 1.2, TILE - 9.6],
          [x, 1.6],
          [x + 1.2, TILE - 9.6],
        ] as Pt[], 0.1), steel, {
          shadow: 0.46, radius: 2.4, pivot: [x, 6], rim: 0.4, line: 0.5, light,
        })
        break
      }
      case 'ironfence': {
        // A railing spearhead with a collar — this island was a mansion first.
        paint(ctx, roundRectPath(x - 0.5, TILE - 9, 1, 6, 0.3), cel(mix(t.metal, PAL.ink, 0.2)), {
          shadow: 0.5, radius: 1, pivot: [x, TILE - 6], rim: 0.25, line: 0.35, light,
        })
        paint(ctx, blob([
          [x - 1.5, TILE - 8.4],
          [x, 1.2],
          [x + 1.5, TILE - 8.4],
          [x, TILE - 7.2],
        ] as Pt[], 0.35), steel, {
          shadow: 0.46, radius: 2.6, pivot: [x, 7], rim: 0.4, line: 0.45, light,
        })
        paint(ctx, roundRectPath(x - 1.3, TILE - 6.4, 2.6, 1, 0.3), cel(t.metal), {
          shadow: 0.45, radius: 1, pivot: [x, TILE - 6], rim: 0.25, line: 0.3, light,
        })
        break
      }
      case 'blade': {
        // A blade tip standing in a rack: straight, single-edged, honed.
        const p = blob([
          [x - 0.9, TILE - 3.4],
          [x - 0.9, TILE - 9],
          [x - 0.1, 1.4],
          [x + 0.9, TILE - 8.6],
          [x + 0.9, TILE - 3.4],
        ] as Pt[], 0.12)
        paint(ctx, p, steel, {
          shadow: 0.4, radius: 2, pivot: [x, 8], rim: 0.5, line: 0.45, light,
        })
        ctx.save()
        ctx.globalAlpha = 0.7
        ctx.strokeStyle = steel.light
        ctx.lineWidth = 0.3
        ctx.beginPath()
        ctx.moveTo(x - 0.5, TILE - 4)
        ctx.lineTo(x - 0.15, 2.2)
        ctx.stroke()
        ctx.restore()
        break
      }
      default: {
        // A harpoon head: two flukes and a socket, rusted at the root.
        const p = blob([
          [x - 2.2, TILE - 3.2],
          [x - 0.7, TILE - 6.4],
          [x - 1.7, TILE - 7],
          [x, 1.5],
          [x + 1.7, TILE - 7],
          [x + 0.7, TILE - 6.4],
          [x + 2.2, TILE - 3.2],
        ] as Pt[], 0.3)
        paint(ctx, p, steel, {
          shadow: 0.46, radius: 2.4, pivot: [x, 8], rim: 0.5, line: 0.5, light,
        })
        ctx.save()
        ctx.globalAlpha = 0.35
        ctx.fillStyle = cel(PAL.bloodOrange).shade
        ctx.fill(ellipsePath(x, TILE - 4.4, 1.4, 1, 0))
        ctx.restore()
        break
      }
    }
    glint(ctx, x - 0.55, 6.5, 0.28, 2.4, 0.1, PAL.white, 0.7)
  }
}

function paintWater({ ctx, biome }: TileDrawArgs): void {
  // Only a base: the renderer owns refraction, caustics, foam and depth.
  const p = biomePalette(biome)
  gradientFill(ctx, roundRectPath(0, 0, TILE, TILE, 0), 0, 0, 0, TILE, [
    [0, rgba(mix(PAL.sea, p.accent, 0.3), 0.5)],
    [1, rgba(PAL.seaDeep, 0.68)],
  ])
}

function paintDecor(a: TileDrawArgs): void {
  const p = biomePalette(a.biome)
  // Background terrain is the same rock seen through more air, so it is painted
  // in full and then pushed back: washed toward the fog, and darkened. The
  // darkening is the half that is easy to forget — haze alone makes a far wall
  // *lighter* than the lit ground in front of it, which reads as fog rolling in
  // rather than as distance.
  paintSolid(a)
  const ctx = a.ctx
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = rgba(p.fog, 0.3)
  ctx.fillRect(0, 0, TILE, TILE)
  ctx.fillStyle = rgba(PAL.ink, 0.26)
  ctx.fillRect(0, 0, TILE, TILE)
  ctx.restore()
}

/**
 * The slippery tile.
 *
 * Ice is only one island's answer to "you cannot get a grip here". What every
 * version must share is the read: a smooth, wet, specular surface with a hard
 * horizontal highlight, because that is the cue the player reacts to before
 * they have identified the material.
 */
function paintIce({ ctx, mask, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x2bb7))
  const openN = (mask & 1) === 0
  const openE = (mask & 2) === 0
  const openS = (mask & 4) === 0
  const openW = (mask & 8) === 0

  const body = ((): Cel => {
    switch (t.slick) {
      case 'glass': return cel(mix(PAL.sand, PAL.ember, 0.22))
      case 'cloudice': return cel(mix(PAL.ice, PAL.iceDeep, 0.55))
      case 'wetdeck': return cel(mix(t.timber, PAL.seaDeep, 0.22))
      case 'slime': return cel(mix(PAL.poison, PAL.ink, 0.35))
      case 'blackglass': return cel(mix(PAL.ink, PAL.dusk, 0.25))
      default: return cel(mix(t.rock, PAL.fishmanTeal, 0.3))
    }
  })()
  const sheen = t.slick === 'slime' ? PAL.heal : t.slick === 'blackglass' ? PAL.mist : PAL.white

  ctx.fillStyle = body.core
  ctx.fillRect(0, 0, TILE, TILE)

  if (t.slick === 'wetdeck') {
    // Planks first: the material is timber, the slipperiness is the water on it.
    let y = -v.range(0, 2)
    while (y < TILE) {
      const h = v.range(3.4, 5)
      plank(ctx, v, -1, y, TILE + 2, Math.min(h, TILE - y + 1), body, light, 2)
      y += h + 0.3
    }
  } else {
    // Fracture planes. They all lean the same way and run the full height, so a
    // field of it reads as one shattered mass rather than as separate cubes —
    // parallel fractures the eye accepts even where they do not meet.
    const skew = t.slick === 'slime' ? 1.5 : 4.5
    for (let i = 0; i < 2 + v.int(2); i++) {
      const x = v.range(-2, TILE + 2)
      const w = v.range(2.5, 6)
      const slab = new Path2D()
      slab.moveTo(x, -1)
      slab.lineTo(x + w, -1)
      slab.lineTo(x + w - skew, TILE + 1)
      slab.lineTo(x - skew, TILE + 1)
      slab.closePath()
      ctx.save()
      ctx.globalAlpha = v.range(0.14, 0.34)
      ctx.fillStyle = v.chance(0.55) ? body.light : body.deep
      ctx.fill(slab)
      ctx.restore()
    }
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = sheen
    ctx.lineWidth = 0.35
    for (let i = 0; i < 2; i++) {
      const x = v.range(1, TILE - 1)
      ctx.beginPath()
      ctx.moveTo(x, -1)
      ctx.lineTo(x - skew, TILE + 1)
      ctx.stroke()
    }
    ctx.restore()
  }

  if (t.slick === 'blackglass') {
    // Obsidian keeps the fire that made it, deep down and barely.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = rgba(PAL.ember, 0.1)
    ctx.fill(ellipsePath(v.range(4, TILE - 4), v.range(6, TILE - 2), v.range(2, 4), v.range(1.4, 3), 0))
    ctx.restore()
  }
  if (t.slick === 'slime') {
    // Bubbles rising through it, and a skin that has slumped.
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.fillStyle = body.light
    for (let i = 0; i < 3 + v.int(3); i++) {
      const r = v.range(0.4, 1.1)
      ctx.fill(ellipsePath(v.range(1.5, TILE - 1.5), v.range(2, TILE - 2), r, r, 0))
    }
    ctx.restore()
  } else if (t.slick !== 'wetdeck') {
    // Trapped air. Small, few, and the only round thing in a block of facets.
    ctx.save()
    ctx.globalAlpha = 0.45
    ctx.fillStyle = sheen
    for (let i = 0; i < 1 + v.int(3); i++) {
      const r = v.range(0.3, 0.75)
      ctx.fill(ellipsePath(v.range(2, TILE - 2), v.range(2, TILE - 2), r, r, 0))
    }
    ctx.restore()
  }

  if (openN) {
    // The walkable surface: opaque, wet and hard-lit, so the player can tell at
    // a glance which face they are standing on and which they will slide off.
    const line = contour(v, 2.8, 0.9, 4 + v.int(3))
    const path = new Path2D()
    path.moveTo(0, -0.5)
    path.lineTo(TILE, -0.5)
    path.lineTo(TILE, 2.8)
    smooth(path, line.slice().reverse(), false)
    path.closePath()
    const skin = t.slick === 'slime'
      ? cel(mix(PAL.poison, PAL.heal, 0.3))
      : t.slick === 'blackglass'
        ? cel(mix(PAL.slate, PAL.ink, 0.3))
        : t.slick === 'glass'
          ? cel(mix(PAL.cream, PAL.sand, 0.3))
          : cel(PAL.foam)
    paint(ctx, path, skin, {
      shadow: 0.3, radius: 2, pivot: [TILE / 2, 1.2], rim: 0.5, line: 0, light,
    })
    // The specular: one hard horizontal streak. This is the "you will slide"
    // signal, and it has to be the brightest thing on the tile.
    glint(ctx, v.range(4, TILE - 4), 1.3, v.range(2.5, 4.5), 0.42, 0, sheen, 0.85)
  }
  if (openS) {
    // Drips: icicles, or a slime thread, or water off a wet plank.
    ctx.save()
    ctx.fillStyle = rgba(t.slick === 'slime' ? PAL.heal : PAL.foam, 0.8)
    for (let i = 0; i < 1 + v.int(3); i++) {
      const x = v.range(1, TILE - 1)
      ctx.fill(blob([
        [x - 0.7, TILE - 1.5],
        [x + 0.7, TILE - 1.5],
        [x, TILE + v.range(0.8, 3)],
      ] as Pt[], 0.5))
    }
    ctx.restore()
  }
  // Exposed edges catch a hard specular; it is what separates a slick block
  // from a block of anything else.
  ctx.save()
  ctx.lineWidth = 0.7
  ctx.strokeStyle = rgba(sheen, 0.6)
  ctx.beginPath()
  if (openW) {
    ctx.moveTo(0.35, 0)
    ctx.lineTo(0.35, TILE)
  }
  if (openE) {
    ctx.moveTo(TILE - 0.35, 0)
    ctx.lineTo(TILE - 0.35, TILE)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * The launcher.
 *
 * Silhouette and signal are fixed everywhere — a taut dome on a compressed
 * collar, with two chevrons pointing up — because a player has to read "this
 * throws me" instantly. The skin under that signal is the island's own.
 */
function paintBouncy({ ctx, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light: Light = { x: -0.6, y: -0.8 }
  const v = new Vary(hash2(variant, 0x33bb))

  const skinTone = ((): string => {
    switch (t.spring) {
      case 'awning': return PAL.cream
      case 'puff': return PAL.white
      case 'tarp': return mix(PAL.sea, PAL.seaLight, 0.4)
      case 'hide': return mix(PAL.poison, PAL.mist, 0.25)
      case 'taiko': return mix(PAL.cream, PAL.sand, 0.35)
      default: return PAL.heal
    }
  })()
  const skin = cel(skinTone)
  const collarTone = t.spring === 'taiko' ? PAL.luffyRedDeep
    : t.spring === 'tarp' ? t.metal
      : t.spring === 'puff' ? mix(PAL.skyLow, PAL.mist, 0.4)
        : mix(PAL.heal, PAL.ink, 0.42)
  const collar = cel(collarTone)

  paint(ctx, roundRectPath(1, TILE - 5, TILE - 2, 4.4, 1.2), collar, {
    shadow: 0.5, radius: 2.4, pivot: [TILE / 2, TILE - 3], line: 0.5, light,
  })
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = collar.deep
  ctx.lineWidth = 0.4
  for (const x of [4, 8, 12]) {
    ctx.beginPath()
    ctx.moveTo(x, TILE - 4.6)
    ctx.lineTo(x, TILE - 1)
    ctx.stroke()
  }
  ctx.restore()

  const dome = blob([
    [0.4, TILE - 4.4],
    [2.4, 2.2],
    [TILE / 2, 0.8],
    [TILE - 2.4, 2.2],
    [TILE - 0.4, TILE - 4.4],
  ] as Pt[], 0.95)
  paint(ctx, dome, skin, {
    shadow: 0.36, radius: 7, pivot: [TILE / 2, 6], rim: 0.8, line: 0.65, light,
  })

  ctx.save()
  ctx.clip(dome)
  switch (t.spring) {
    case 'awning': {
      // Striped canvas over a frame, faded on the sun side.
      ctx.globalAlpha = 0.8
      ctx.fillStyle = cel(t.accent).core
      for (let x = -2; x < TILE; x += 5) ctx.fillRect(x, 0, 2.4, TILE)
      break
    }
    case 'tarp': {
      // Tied down at the corners; you can see the springs it is stretched over.
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = cel(PAL.mist).core
      ctx.lineWidth = 0.4
      for (const x of [3.5, TILE - 3.5]) {
        ctx.beginPath()
        ctx.moveTo(x, 3)
        ctx.lineTo(x + (x < 8 ? -2 : 2), TILE - 5)
        ctx.stroke()
      }
      break
    }
    case 'hide': {
      // Stitched hide. The stitches are the only straight line on the island.
      ctx.globalAlpha = 0.7
      ctx.strokeStyle = cel(t.grit).light
      ctx.lineWidth = 0.35
      ctx.setLineDash([0.8, 0.8])
      ctx.stroke(curve([[2.5, 6], [TILE / 2, 3.4], [TILE - 2.5, 6]] as Pt[]))
      ctx.setLineDash([])
      break
    }
    case 'taiko': {
      // A drum head lashed to its body with tension rope.
      ctx.globalAlpha = 0.85
      ctx.strokeStyle = cel(mix(PAL.sand, PAL.wood, 0.4)).core
      ctx.lineWidth = 0.55
      for (const x of [4.5, 8, 11.5]) {
        ctx.beginPath()
        ctx.moveTo(x - 1.5, TILE - 4.6)
        ctx.lineTo(x + 1.5, 3.2)
        ctx.stroke()
      }
      ctx.globalAlpha = 0.6
      ctx.fillStyle = cel(PAL.gold).core
      for (const x of [3, TILE - 3]) {
        ctx.beginPath()
        ctx.arc(x, 5.5, 0.5, 0, TAU)
        ctx.fill()
      }
      break
    }
    case 'puff': {
      ctx.globalAlpha = 0.5
      ctx.fillStyle = cel(PAL.skyLow).core
      for (let i = 0; i < 3; i++) {
        ctx.fill(ellipsePath(v.range(2, TILE - 2), v.range(4, TILE - 5), v.range(1.5, 3), v.range(1, 2), 0))
      }
      break
    }
    default: {
      // Gum: taut, glossy, and stretched — tension lines running over the dome.
      ctx.globalAlpha = 0.45
      ctx.strokeStyle = skin.light
      ctx.lineWidth = 0.45
      ctx.stroke(curve([[3, 8], [TILE / 2, 3.4], [TILE - 3, 8]] as Pt[]))
      ctx.globalAlpha = 0.3
      ctx.stroke(curve([[2, 10.5], [TILE / 2, 6], [TILE - 2, 10.5]] as Pt[]))
      break
    }
  }
  ctx.restore()

  // The signal: two chevrons pointing up. Material-independent on purpose.
  ctx.save()
  ctx.globalAlpha = 0.75
  ctx.strokeStyle = t.spring === 'puff' || t.spring === 'awning' ? cel(PAL.heal).shade : skin.light
  ctx.lineWidth = 0.7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const y of [6.6, 8.6]) {
    ctx.beginPath()
    ctx.moveTo(TILE / 2 - 2.4, y)
    ctx.lineTo(TILE / 2, y - 1.8)
    ctx.lineTo(TILE / 2 + 2.4, y)
    ctx.stroke()
  }
  ctx.restore()
  glint(ctx, 5, 4, 2.4, 1.1, -0.6, PAL.white, 0.5)
}

/**
 * The block that gives way.
 *
 * Whatever it is made of, it is already failing: cracked through, corners gone,
 * shedding dust. In East Blue and Water 7 that is a cargo crate, because a
 * harbour is made of crates and a crate is exactly the thing that should not
 * hold your weight.
 */
function paintCrumble({ ctx, mask, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x6d31))
  const openS = (mask & 4) === 0
  const crate = t.joinery === 'dock' || t.joinery === 'shipyard'
  const c = crate
    ? cel(mix(t.timber, PAL.sand, 0.18))
    : cel(mix(mix(t.rock, t.timber, 0.28), PAL.ink, 0.12))

  paint(ctx, roundRectPath(0.2, 0.2, TILE - 0.4, TILE - 0.4, 0.8), c, {
    shadow: 0.4, radius: 7, pivot: [TILE / 2, TILE / 2], rim: 0.5, line: 0.55, light,
  })

  if (crate) {
    // Boards, a diagonal brace and a burned-in mark: cargo, stacked and left.
    ctx.save()
    ctx.globalAlpha = 0.45
    ctx.strokeStyle = c.deep
    ctx.lineWidth = 0.35
    for (const y of [4.2, 8, 11.8]) {
      ctx.beginPath()
      ctx.moveTo(0.6, y)
      ctx.lineTo(TILE - 0.6, y)
      ctx.stroke()
    }
    ctx.restore()
    paint(ctx, roundRectPath(1, 1, TILE - 2, 1.6, 0.3), cel(mix(t.timber, PAL.ink, 0.25)), {
      shadow: 0.4, radius: 1, pivot: [TILE / 2, 1.8], line: 0.3, light,
    })
    paint(ctx, roundRectPath(1, TILE - 2.6, TILE - 2, 1.6, 0.3), cel(mix(t.timber, PAL.ink, 0.25)), {
      shadow: 0.5, radius: 1, pivot: [TILE / 2, TILE - 1.8], line: 0.3, light,
    })
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.strokeStyle = c.deep
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(1.6, TILE - 3)
    ctx.lineTo(TILE - 1.6, 3)
    ctx.stroke()
    ctx.restore()
    if (t.joinery === 'shipyard') {
      const metal = cel(t.metal)
      for (const [cx, cy] of [[2.2, 2.2], [TILE - 2.2, TILE - 2.2]] as Pt[]) {
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.fillStyle = metal.shade
        ctx.fill(roundRectPath(cx - 1.6, cy - 1.6, 3.2, 3.2, 0.4))
        ctx.restore()
        rivets(ctx, [cx], cy, metal, 0.4)
      }
    } else {
      // A stencilled mark: a ring and a bar, burned into the end board.
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.strokeStyle = c.deep
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.arc(TILE / 2, TILE / 2, 2.4, 0, TAU)
      ctx.moveTo(TILE / 2 - 3.2, TILE / 2)
      ctx.lineTo(TILE / 2 + 3.2, TILE / 2)
      ctx.stroke()
      ctx.restore()
    }
  } else if (t.joinery === 'lacquer') {
    // Stacked clay roof tiles, three courses of half-round.
    ctx.save()
    const tileC = cel(mix(t.rock, PAL.mist, 0.18))
    for (let r = 0; r < 3; r++) {
      const y = 1.4 + r * 4.8
      for (let x = -1.5; x < TILE; x += 4) {
        ctx.fillStyle = tileC.core
        ctx.beginPath()
        ctx.ellipse(x + 2, y + 1.6, 2, 1.7, 0, Math.PI, TAU)
        ctx.fill()
        ctx.strokeStyle = tileC.deep
        ctx.lineWidth = 0.25
        ctx.stroke()
      }
    }
    ctx.restore()
  } else if (t.joinery === 'coffin') {
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = c.deep
    ctx.lineWidth = 0.35
    for (const x of [4, 8, 12]) {
      ctx.beginPath()
      ctx.moveTo(x, 0.6)
      ctx.lineTo(x + v.range(-0.5, 0.5), TILE - 0.6)
      ctx.stroke()
    }
    ctx.restore()
    const metal = cel(mix(t.metal, PAL.ink, 0.3))
    for (const y of [3, TILE - 3]) {
      ctx.save()
      ctx.globalAlpha = 0.85
      ctx.fillStyle = metal.shade
      ctx.fill(roundRectPath(0.6, y - 0.9, TILE - 1.2, 1.8, 0.3))
      ctx.restore()
      rivets(ctx, [2, TILE - 2], y, metal, 0.38)
    }
  } else if (t.joinery === 'skywood') {
    // A clod of cloud, already coming apart at the edges.
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000'
    for (let i = 0; i < 5; i++) {
      const a = v.range(0, TAU)
      ctx.fill(ellipsePath(TILE / 2 + Math.cos(a) * 7.5, TILE / 2 + Math.sin(a) * 7.5, v.range(1.6, 3), v.range(1.6, 3), 0))
    }
    ctx.restore()
  } else {
    // Sun-dried mudbrick, shrunk and split.
    crackNet(ctx, v, 1.4, 1.4, TILE - 2.8, TILE - 2.8, c.deep, 3, 0.4)
  }

  // A fracture network, not three unrelated scratches: one trunk crack with
  // branches, so the block reads as a single failing piece.
  const trunkX = v.range(4, TILE - 4)
  const trunk = curve([
    [trunkX + v.range(-2, 2), -0.5],
    [trunkX, TILE * 0.42],
    [trunkX + v.range(-2.5, 2.5), TILE + 0.5],
  ] as Pt[])
  ctx.save()
  ctx.strokeStyle = c.deep
  ctx.lineWidth = 0.65
  ctx.stroke(trunk)
  ctx.globalAlpha = 0.6
  ctx.lineWidth = 0.4
  for (let i = 0; i < 3; i++) {
    const y = v.range(2, TILE - 2)
    const dir = v.sign()
    ctx.stroke(curve([
      [trunkX, y],
      [trunkX + dir * v.range(2, 4), y + v.range(-1.5, 1.5)],
      [trunkX + dir * v.range(4, 7), y + v.range(-2.5, 2.5)],
    ] as Pt[]))
  }
  // A lit edge along one side of the crack sells it as an opening, not a line.
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = c.light
  ctx.lineWidth = 0.3
  ctx.save()
  ctx.translate(0.35, -0.35)
  ctx.stroke(trunk)
  ctx.restore()
  ctx.restore()

  // Corners already gone, and dust falling from the seams: the block has to
  // look like it is losing the argument with gravity before it is stood on.
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000'
  for (let i = 0; i < 3; i++) {
    if (!v.chance(0.55)) continue
    const cx = v.chance(0.5) ? 0 : TILE
    const cy = v.chance(0.5) ? 0 : TILE
    ctx.fill(ellipsePath(cx, cy, v.range(0.8, 2), v.range(0.8, 2), 0))
  }
  ctx.restore()
  if (openS) {
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = c.shade
    for (let i = 0; i < 5; i++) {
      const x = v.range(1, TILE - 1)
      ctx.fill(ellipsePath(x, TILE + v.range(0, 2.2), v.range(0.2, 0.6), v.range(0.2, 0.5), 0))
    }
    ctx.restore()
  }
}

/**
 * Climbable rigging.
 *
 * Two stiles and a set of rungs is the shape the player has to recognise; what
 * the stiles are — laid rope, living vine, riveted iron, lashed bamboo — is the
 * island talking.
 */
function paintClimb({ ctx, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x8ac2))
  const sag = v.range(0.5, 1.4)
  const stiles = [3.6, TILE - 3.6]

  switch (t.rigging) {
    case 'vine': {
      // A living vine: one thick sinuous stem, tendrils, leaves turned to light.
      const vineC = cel(t.moss)
      for (const x of stiles) {
        const stem = new Path2D()
        smooth(stem, [
          [x + v.range(-1, 1), -0.5],
          [x + v.range(-2, 2), TILE * 0.35],
          [x + v.range(-2, 2), TILE * 0.7],
          [x + v.range(-1, 1), TILE + 0.5],
        ] as Pt[], true)
        ctx.save()
        ctx.strokeStyle = vineC.core
        ctx.lineWidth = 1.7
        ctx.lineCap = 'round'
        ctx.stroke(stem)
        ctx.strokeStyle = vineC.light
        ctx.lineWidth = 0.4
        ctx.translate(-0.4, -0.3)
        ctx.stroke(stem)
        ctx.restore()
      }
      for (let i = 0; i < 4; i++) {
        const lx = v.range(2, TILE - 2)
        const ly = v.range(1, TILE - 1)
        paint(ctx, blob([[lx - 1.8, ly], [lx, ly - 1.6], [lx + 1.8, ly], [lx, ly + 1]] as Pt[], 1), vineC, {
          shadow: 0.4, radius: 1.6, pivot: [lx, ly], rim: 0.3, line: 0.28, light,
        })
      }
      for (const y of [3.6, 11.6]) {
        const rung = new Path2D()
        smooth(rung, [[2.6, y], [TILE / 2, y + sag], [TILE - 2.6, y]] as Pt[], true)
        ctx.save()
        ctx.strokeStyle = vineC.shade
        ctx.lineWidth = 1.2
        ctx.stroke(rung)
        ctx.restore()
      }
      return
    }
    case 'ironladder': {
      // Riveted flat bar, wet, with rust bleeding from every fixing.
      const metal = cel(t.metal)
      for (const x of stiles) {
        paint(ctx, roundRectPath(x - 0.9, -0.5, 1.8, TILE + 1, 0.3), metal, {
          shadow: 0.42, radius: 1.2, pivot: [x, TILE / 2], rim: 0.35, line: 0.32, light,
        })
      }
      for (const y of [2.6, 8, 13.4]) {
        paint(ctx, roundRectPath(2.4, y - 0.7, TILE - 4.8, 1.4, 0.4), cel(mix(t.metal, PAL.mist, 0.2)), {
          shadow: 0.4, radius: 1, pivot: [TILE / 2, y], rim: 0.3, line: 0.3, light,
        })
        rivets(ctx, stiles, y, metal, 0.45)
      }
      ctx.save()
      ctx.globalAlpha = 0.3
      ctx.fillStyle = cel(PAL.bloodOrange).shade
      for (const x of stiles) {
        ctx.fill(blob([[x - 0.7, 3], [x + 0.7, 3], [x + 0.4, 6.5], [x - 0.3, 5]] as Pt[], 0.6))
      }
      ctx.restore()
      return
    }
    case 'bamboo': {
      // Bamboo poles with nodes, lashed with dark cord.
      const cane = cel(mix(PAL.zoroGreen, PAL.sand, 0.45))
      for (const x of stiles) {
        paint(ctx, roundRectPath(x - 1, -0.5, 2, TILE + 1, 0.5), cane, {
          shadow: 0.4, radius: 1.3, pivot: [x, TILE / 2], rim: 0.35, line: 0.3, light,
        })
        ctx.save()
        ctx.globalAlpha = 0.7
        ctx.strokeStyle = cane.deep
        ctx.lineWidth = 0.45
        for (const y of [1.5, 6.5, 11.5]) {
          ctx.beginPath()
          ctx.moveTo(x - 1, y)
          ctx.lineTo(x + 1, y)
          ctx.stroke()
        }
        ctx.restore()
      }
      const cord = cel(mix(PAL.ink, t.timber, 0.3))
      for (const y of [3.6, 11.6]) {
        paint(ctx, roundRectPath(2.4, y - 0.8, TILE - 4.8, 1.6, 0.6), cane, {
          shadow: 0.4, radius: 1, pivot: [TILE / 2, y], rim: 0.3, line: 0.28, light,
        })
        ctx.save()
        ctx.strokeStyle = cord.core
        ctx.lineWidth = 0.5
        for (const x of stiles) {
          for (let k = -1; k <= 1; k++) {
            ctx.beginPath()
            ctx.moveTo(x - 1.4, y + k * 0.5)
            ctx.lineTo(x + 1.4, y + k * 0.5 + 0.3)
            ctx.stroke()
          }
        }
        ctx.restore()
      }
      return
    }
    case 'boneladder': {
      // Wrought iron with bone rungs. It should look salvaged, not built.
      const metal = cel(mix(t.metal, PAL.ink, 0.2))
      const boneC = cel(mix(PAL.cream, t.grit, 0.35))
      for (const x of stiles) {
        const bar = new Path2D()
        smooth(bar, [[x, -0.5], [x + v.range(-0.6, 0.6), TILE / 2], [x, TILE + 0.5]] as Pt[], true)
        ctx.save()
        ctx.strokeStyle = metal.core
        ctx.lineWidth = 1.3
        ctx.stroke(bar)
        ctx.strokeStyle = metal.light
        ctx.lineWidth = 0.3
        ctx.translate(-0.35, -0.3)
        ctx.stroke(bar)
        ctx.restore()
      }
      for (const y of [3.6, 11.6]) {
        paint(ctx, roundRectPath(2.4, y - 0.75, TILE - 4.8, 1.5, 0.75), boneC, {
          shadow: 0.44, radius: 1, pivot: [TILE / 2, y], rim: 0.35, line: 0.3, light,
        })
        ctx.save()
        ctx.fillStyle = boneC.shade
        for (const x of stiles) ctx.fill(ellipsePath(x, y, 1.1, 0.95, 0))
        ctx.restore()
      }
      return
    }
    default: {
      // Laid rope: ship's ratlines, or a knotted line thrown over a wall.
      const ropeC = cel(mix(t.timber, PAL.sand, t.rigging === 'knotted' ? 0.6 : 0.45))
      for (const x of stiles) {
        const strand = new Path2D()
        smooth(strand, [
          [x, -0.5],
          [x + v.range(-0.5, 0.5), TILE * 0.5],
          [x, TILE + 0.5],
        ] as Pt[], true)
        rope(ctx, strand, ropeC, 1.9)
        if (t.rigging === 'knotted') {
          // Knots instead of rungs on the stiles: you climb the rope itself.
          for (const y of [1.8, 7, 12.2]) {
            paint(ctx, ellipsePath(x, y, 1.5, 1.1, 0), ropeC, {
              shadow: 0.42, radius: 1.4, pivot: [x, y], rim: 0.3, line: 0.28, light,
            })
          }
        }
      }
      for (const y of [3.6, 11.6]) {
        const rung = new Path2D()
        smooth(rung, [[2.6, y], [TILE / 2, y + sag], [TILE - 2.6, y]] as Pt[], true)
        rope(ctx, rung, ropeC, 1.6)
        ctx.save()
        ctx.fillStyle = ropeC.deep
        for (const x of stiles) ctx.fill(ellipsePath(x, y + 0.2, 1.1, 0.8, 0))
        ctx.restore()
      }
      return
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PAINTERS: Record<number, TilePainter> = {
  [Tile.Solid]: paintSolid,
  [Tile.OneWay]: paintOneWay,
  [Tile.Brick]: paintBrick,
  [Tile.Question]: paintQuestion,
  [Tile.Used]: paintUsed,
  [Tile.Spike]: paintSpike,
  [Tile.Water]: paintWater,
  [Tile.SlopeUp45]: paintSlope(1),
  [Tile.SlopeDown45]: paintSlope(-1),
  [Tile.Decor]: paintDecor,
  [Tile.Ice]: paintIce,
  [Tile.Bouncy]: paintBouncy,
  [Tile.Crumble]: paintCrumble,
  [Tile.Climb]: paintClimb,
  [Overlay.Crown]: paintCrown,
}
