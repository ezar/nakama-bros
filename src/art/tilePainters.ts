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
 * of them look like one continuous piece of ground, so the rules here are:
 *
 *  - Anything that must read as *continuous* across a tile border (the grass
 *    line, masonry courses, basalt columns) is pinned to a value that does not
 *    depend on the variant, so neighbours always agree and a horizontal flip
 *    stays seamless.
 *  - Anything that must read as *irregular* (bedding lenses, pebbles, blades,
 *    chips) is kept strictly inside the cell and placed from a hash, so nothing
 *    is ever cut in half at a border and no two variants share a rhythm.
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
 * left to wander so the line still reads as hand-drawn.
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

export type Bedding = 'turf' | 'sandstone' | 'cloud' | 'quay' | 'rot' | 'volcanic'
export type Crown = 'blades' | 'crust' | 'wisp' | 'boards' | 'fungus' | 'ash'

/**
 * What a biome's ground is actually made of.
 *
 * The old tileset drew every biome from `ground` and `groundDeep`, which is why
 * east-blue was a flat green mass: the grass and the metres of soil under it
 * were the same colour. A recipe separates the skin from the body.
 */
export interface Terrain {
  bedding: Bedding
  crown: Crown
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
      return {
        bedding: 'sandstone',
        crown: 'crust',
        cap: mix(p.ground, PAL.cream, 0.1),
        soil: p.groundDeep,
        rock: p.groundEdge,
        moss: mix(p.groundEdge, PAL.zoroGreen, 0.2),
        grit: mix(p.groundEdge, PAL.ink, 0.42),
        timber: PAL.wood,
        metal: PAL.steel,
      }
    case 'skypiea':
      // Cloud-turf still has to have a value range. Painting it in the palette's
      // near-white leaves the shade tone nowhere to go, and the island reads as
      // a hole cut in the sky.
      return {
        bedding: 'cloud',
        crown: 'wisp',
        cap: p.ground,
        soil: mix(p.groundEdge, PAL.skyLow, 0.42),
        rock: mix(PAL.mist, PAL.skyLow, 0.3),
        moss: p.groundDeep,
        grit: mix(PAL.mist, PAL.steel, 0.35),
        timber: PAL.cream,
        metal: PAL.mist,
      }
    case 'water7':
      return {
        bedding: 'quay',
        crown: 'boards',
        cap: p.ground,
        soil: PAL.rock,
        rock: PAL.rockDeep,
        moss: mix(PAL.fishmanTeal, PAL.rockDeep, 0.42),
        grit: mix(PAL.rock, PAL.ink, 0.3),
        timber: p.groundEdge,
        metal: PAL.steel,
      }
    case 'thriller-bark':
      return {
        bedding: 'rot',
        crown: 'fungus',
        cap: p.groundEdge,
        soil: p.ground,
        rock: p.groundDeep,
        moss: mix(PAL.poison, p.groundDeep, 0.45),
        grit: mix(PAL.mist, p.ground, 0.5),
        timber: mix(PAL.woodDeep, p.ground, 0.4),
        metal: PAL.slate,
      }
    case 'wano':
      return {
        bedding: 'volcanic',
        crown: 'ash',
        cap: mix(p.ground, PAL.ink, 0.4),
        soil: mix(p.ground, PAL.ink, 0.34),
        rock: mix(p.groundDeep, PAL.ink, 0.42),
        moss: mix(PAL.zoroGreen, p.groundDeep, 0.58),
        grit: mix(PAL.ink, p.groundDeep, 0.35),
        timber: PAL.luffyRedDeep,
        metal: PAL.steel,
      }
    default:
      return {
        bedding: 'turf',
        crown: 'blades',
        cap: p.ground,
        soil: p.groundEdge,
        rock: mix(p.groundEdge, PAL.rockDeep, 0.42),
        moss: p.groundDeep,
        grit: mix(PAL.rockDeep, p.groundEdge, 0.42),
        timber: PAL.wood,
        metal: PAL.steel,
      }
  }
}

const lightOf = (biome: Biome): Light => {
  const p = biomePalette(biome)
  return { x: p.lightDirX, y: p.lightDirY }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bedding — the body of the mass
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
  const pts = contour(v, y, 0.5)
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

/** Inclusions: pebbles, shell, bone, obsidian. Rare, and never on a grid. */
function inclusions(ctx: CanvasRenderingContext2D, v: Vary, t: Terrain, light: Light): void {
  const grit = cel(t.grit)
  // One stone in four tiles, not one in every other: an inclusion is only
  // interesting while it is still a surprise, and an ellipse repeated at a
  // fixed rate is the single loudest way to advertise a tile grid.
  if (v.chance(0.26)) {
    const cx = v.range(3, TILE - 3)
    const cy = v.range(CAP_Y + 2.5, TILE - 2)
    const r = v.range(1, 2.6)
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
  if (v.chance(0.14)) {
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = grit.deep
    const bx = v.range(2.5, TILE - 4)
    const by = v.range(CAP_Y + 1.5, TILE - 3)
    for (let i = 0; i < 3; i++) {
      const r = v.range(0.3, 0.7)
      ctx.fill(ellipsePath(bx + v.range(-2, 2.5), by + v.range(-1.5, 2), r, r * 0.8, 0))
    }
    ctx.restore()
  }
}

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
        const line = contour(v, ys[v.int(ys.length)], 2)
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
      // The tide leaves the lower courses darker and green.
      ctx.save()
      ctx.globalAlpha = 0.26
      ctx.fillStyle = t.moss
      ctx.fillRect(0, TILE - h * v.range(0.5, 0.95), TILE, TILE)
      ctx.restore()
      break
    }
    case 'rot': {
      lenses(ctx, v, [soil.shade, rock.core, mix(soil.deep, rock.core, 0.5)], 4, 0.05, 2, TILE, 6, 0.38)
      // Bone shards: pale, angular, and sparse enough to be a find.
      if (v.chance(0.14)) {
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
      // Turf sits on soil, not on more turf: loamy lenses with grit through it.
      lenses(
        ctx, v,
        [soil.shade, rock.core, mix(soil.core, rock.core, 0.55), mix(soil.core, soil.light, 0.45)],
        4, 0.06, CAP_Y + 1, TILE - 0.5, 6, 0.34,
      )
      seam(ctx, v, rock.shade, [8.6, 12.4], 0.32)
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
  const line = contour(v, CAP_Y, soft ? 2.4 : 2)
  const path = new Path2D()
  path.moveTo(0, -0.5)
  path.lineTo(TILE, -0.5)
  path.lineTo(TILE, CAP_Y)
  smooth(path, line.slice().reverse(), false)
  path.closePath()

  paint(ctx, path, cap, {
    shadow: 0.46, radius: 3.4, pivot: [TILE / 2, 2.2], rim: 0.6, line: 0, light,
  })
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

  capSurface(ctx, t, v, cap)

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
      ctx.globalAlpha = 0.8
      ctx.fillStyle = cel(t.metal).core
      for (const x of [2, TILE - 2]) {
        for (const y of [0.9, 2.6]) {
          ctx.beginPath()
          ctx.arc(x, y, 0.3, 0, TAU)
          ctx.fill()
        }
      }
      ctx.restore()
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
      // Cooled crust with heat still in the cracks.
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
  const lush = density > 0.42
  const bare = density < 0.16

  switch (t.crown) {
    case 'crust': {
      const cap = cel(t.cap)
      const n = bare ? 1 : 2 + v.int(3)
      for (let i = 0; i < n; i++) {
        const x = v.range(0, TILE)
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
      if (!bare && v.chance(0.4)) {
        const x = v.range(2, TILE - 2)
        paint(ctx, ellipsePath(x, base - v.range(0.8, 1.6), v.range(0.8, 1.5), v.range(0.6, 1.1), v.range(0, 1)), cel(t.grit), {
          shadow: 0.5, radius: 1.2, pivot: [x, base - 1], rim: 0.25, line: 0.28, light,
        })
      }
      break
    }
    case 'wisp': {
      const cap = cel(t.cap)
      const n = bare ? 1 : 3 + v.int(4)
      for (let i = 0; i < n; i++) {
        const x = v.range(0.5, TILE - 0.5)
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
      break
    }
    case 'boards': {
      // A dock lip: low, worked, with iron. It should never look like foliage.
      const timber = cel(t.timber)
      paint(ctx, roundRectPath(0, base - 1.5, TILE, 1.7, 0.3), timber, {
        shadow: 0.3, radius: 1, pivot: [TILE / 2, base - 0.8], rim: 0.3, line: 0.3, light,
      })
      ctx.save()
      ctx.fillStyle = cel(t.metal).core
      for (const x of [2.5, TILE - 2.5]) {
        ctx.beginPath()
        ctx.arc(x, base - 0.8, 0.35, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
      if (lush && v.chance(0.35)) {
        // A cleat, or a coil of rope left on the quay.
        const x = v.range(4, TILE - 4)
        paint(ctx, roundRectPath(x - 1.4, base - 4.2, 2.8, 2.8, 0.8), cel(t.metal), {
          shadow: 0.42, radius: 1.6, pivot: [x, base - 2.8], rim: 0.35, line: 0.35, light,
        })
      }
      if (v.chance(0.4)) {
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
        const x = v.range(2, TILE - 2)
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
      if (v.chance(0.45)) {
        ctx.save()
        ctx.globalAlpha = 0.75
        ctx.strokeStyle = cel(t.timber).deep
        ctx.lineWidth = 0.4
        const x = v.range(1, TILE - 1)
        ctx.stroke(curve([[x, base], [x + v.range(-2, 2), base - 2.5], [x + v.range(-3.5, 3.5), base - v.range(3, 5.5)]] as Pt[]))
        ctx.restore()
      }
      break
    }
    case 'ash': {
      const cap = cel(t.cap)
      const n = bare ? 1 : 2 + v.int(3)
      for (let i = 0; i < n; i++) {
        const x = v.range(0, TILE)
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
      // Grass. Height, width, lean and spacing all come off the stream, and a
      // fifth of the variants are close to bald so a run of ground has gaps.
      const cap = cel(t.cap)
      // The back rank is only a shade deeper than the front. Dropping it all the
      // way to the moss tone turned the fringe into a row of dark spikes.
      const back = cel(mix(t.cap, t.moss, 0.55))
      const n = bare ? 1 : lush ? 6 + v.int(4) : 3 + v.int(3)
      // Back rank first, in the darker tone, so the fringe has depth.
      for (let i = 0; i < n; i++) {
        const front = i >= n / 2
        const x = v.range(0.4, TILE - 0.4)
        // Squaring the roll gives a few tall blades and many short ones, which
        // is what a real fringe looks like; a flat range gives a comb.
        const roll = v.next()
        const h = (1.3 + roll * roll * (lush ? 6.2 : 3)) * (front ? 1 : 0.72)
        const w = v.range(0.55, 1.35)
        let lean = v.range(-2.2, 2.2)
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
        const x = v.range(2, TILE - 2)
        const h = v.range(4, 6.5)
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.fillStyle = cap.light
        ctx.fill(ellipsePath(x, base - h, 0.5, 1.1, v.range(-0.5, 0.5)))
        ctx.restore()
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
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Built and special tiles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A one-way platform: two rails on iron brackets with daylight under them.
 * The gap below the rails is the whole readability trick — a tile you can jump
 * through must not have a filled underside.
 */
function paintOneWay({ ctx, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x1f0d))
  const timber = cel(t.timber)
  const metal = cel(t.metal)

  paint(ctx, roundRectPath(0, 0.4, TILE, 3.4, 0.6), timber, {
    shadow: 0.3, radius: 2, pivot: [TILE / 2, 2], rim: 0.5, line: 0.4, light,
  })
  paint(ctx, roundRectPath(0, 4.2, TILE, 1.8, 0.4), cel(mix(t.timber, PAL.ink, 0.2)), {
    shadow: 0.5, radius: 1.2, pivot: [TILE / 2, 5], line: 0.35, light,
  })
  // Grain, and the brackets that hold the rail up.
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = timber.deep
  ctx.lineWidth = 0.28
  for (let i = 0; i < 3; i++) {
    const y = 1 + v.range(0, 2.2)
    ctx.stroke(curve([[0, y], [TILE * 0.5, y + v.range(-0.4, 0.4)], [TILE, y]] as Pt[]))
  }
  ctx.restore()
  for (const x of [2.6, TILE - 2.6]) {
    paint(ctx, roundRectPath(x - 0.7, 0.2, 1.4, 6, 0.4), metal, {
      shadow: 0.44, radius: 1, pivot: [x, 3], rim: 0.3, line: 0.3, light,
    })
  }
}

function paintBrick({ ctx, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x4c21))
  const c = cel(mix(t.rock, t.timber, 0.35))

  ctx.fillStyle = c.deep
  ctx.fillRect(0, 0, TILE, TILE)
  const h = TILE / 3
  for (let r = 0; r < 3; r++) {
    const y = r * h
    const off = r % 2 === 0 ? 0 : -4
    for (let x = off; x < TILE; x += 8) {
      const bx = Math.max(0, x)
      const bw = Math.min(x + 8, TILE) - bx
      if (bw < 1.5) continue
      const tone = mix(c.core, v.chance(0.5) ? c.light : c.shade, v.range(0, 0.3))
      block(ctx, bx + 0.4, y + 0.4, bw - 0.8, h - 0.8, cel(tone), light, 0.7)
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

function paintQuestion({ ctx }: TileDrawArgs): void {
  // Deliberately identical everywhere: this is a piece of interface, and six
  // subtly different ones would read as a bug rather than as variety.
  const gold = cel(PAL.gold)
  const light: Light = { x: -0.6, y: -0.8 }
  paint(ctx, roundRectPath(0.5, 0.5, TILE - 1, TILE - 1, 2.6), gold, {
    shadow: 0.34, radius: 7, pivot: [TILE / 2, TILE / 2], rim: 0.8, line: 0.7, light,
  })
  // A raised bezel, so the face sits inside a frame and catches its own shadow.
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = gold.deep
  ctx.lineWidth = 0.5
  ctx.stroke(roundRectPath(2.4, 2.4, TILE - 4.8, TILE - 4.8, 1.4))
  ctx.restore()
  ctx.save()
  ctx.fillStyle = gold.deep
  for (const [x, y] of [[2.8, 2.8], [TILE - 2.8, 2.8], [2.8, TILE - 2.8], [TILE - 2.8, TILE - 2.8]] as Pt[]) {
    ctx.beginPath()
    ctx.arc(x, y, 0.8, 0, TAU)
    ctx.fill()
    ctx.fillStyle = gold.light
    ctx.beginPath()
    ctx.arc(x - 0.25, y - 0.25, 0.3, 0, TAU)
    ctx.fill()
    ctx.fillStyle = gold.deep
  }
  ctx.restore()

  const markColor = mix(PAL.goldDeep, PAL.ink, 0.55)
  ctx.save()
  ctx.strokeStyle = markColor
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.stroke(curve([[5.5, 6.2], [6.5, 4.6], [9.2, 4.9], [9.7, 6.6], [8, 7.8], [8, 9.4]] as Pt[]))
  ctx.beginPath()
  ctx.arc(8, 11.7, 1.05, 0, TAU)
  ctx.fillStyle = markColor
  ctx.fill()
  ctx.restore()
  glint(ctx, 4.6, 4.2, 2.1, 1, -0.7, PAL.white, 0.55)
}

function paintUsed({ ctx, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const c = cel(mix(t.rock, PAL.ink, 0.22))
  paint(ctx, roundRectPath(0.5, 0.5, TILE - 1, TILE - 1, 2.6), c, {
    shadow: 0.5, radius: 7, pivot: [TILE / 2, TILE / 2], line: 0.6, light,
  })
  // Spent: the face is dished in and the bezel has lost its highlight.
  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.strokeStyle = c.deep
  ctx.lineWidth = 0.6
  ctx.stroke(roundRectPath(2.6, 2.6, TILE - 5.2, TILE - 5.2, 1.4))
  ctx.restore()
  gradientFill(ctx, roundRectPath(3, 3, TILE - 6, TILE - 6, 1.2), 0, 3, 0, TILE - 3, [
    [0, rgba(PAL.ink, 0.3)],
    [1, rgba(PAL.ink, 0)],
  ])
}

function paintSpike({ ctx, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light: Light = { x: -0.6, y: -0.8 }
  const steel = cel(mix(t.metal, PAL.mist, 0.35))
  const bed = cel(mix(t.metal, PAL.ink, 0.4))

  paint(ctx, roundRectPath(0, TILE - 3.6, TILE, 3.6, 0.6), bed, {
    shadow: 0.45, radius: 2, pivot: [TILE / 2, TILE - 1.8], rim: 0.4, line: 0.5, light,
  })
  ctx.save()
  ctx.fillStyle = bed.light
  for (const x of [1.6, TILE - 1.6]) {
    ctx.beginPath()
    ctx.arc(x, TILE - 1.6, 0.5, 0, TAU)
    ctx.fill()
  }
  ctx.restore()

  for (let i = 0; i < 3; i++) {
    const x = 2.8 + i * 5.2
    const blade = blob([
      [x - 2.3, TILE - 3.2],
      [x - 0.7, TILE - 7],
      [x, 1.4],
      [x + 0.7, TILE - 7],
      [x + 2.3, TILE - 3.2],
    ] as Pt[], 0.3)
    paint(ctx, blade, steel, {
      shadow: 0.46, radius: 2.4, pivot: [x, 8], rim: 0.5, line: 0.55, light,
    })
    glint(ctx, x - 0.55, 6.5, 0.3, 2.6, 0.1, PAL.white, 0.8)
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

function paintIce({ ctx, mask, variant, biome }: TileDrawArgs): void {
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x2bb7))
  // A real blue, not a white. Ice painted near-white has nowhere left to go for
  // its highlight, which is why the old block read as fog rather than as glass.
  const ice = cel(mix(PAL.ice, PAL.iceDeep, 0.55))
  const openN = (mask & 1) === 0
  const openE = (mask & 2) === 0
  const openS = (mask & 4) === 0
  const openW = (mask & 8) === 0

  ctx.fillStyle = ice.core
  ctx.fillRect(0, 0, TILE, TILE)

  // Fracture planes. They all lean the same way and run the full height, so a
  // field of ice reads as one shattered mass rather than as separate cubes —
  // parallel fractures the eye accepts even where they do not meet.
  const skew = 4.5
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
    ctx.fillStyle = v.chance(0.55) ? ice.light : ice.deep
    ctx.fill(slab)
    ctx.restore()
  }
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = PAL.white
  ctx.lineWidth = 0.35
  for (let i = 0; i < 2; i++) {
    const x = v.range(1, TILE - 1)
    ctx.beginPath()
    ctx.moveTo(x, -1)
    ctx.lineTo(x - skew, TILE + 1)
    ctx.stroke()
  }
  ctx.restore()

  // Trapped air. Small, few, and the only round thing in a block of facets.
  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.fillStyle = PAL.white
  for (let i = 0; i < 1 + v.int(3); i++) {
    const r = v.range(0.3, 0.75)
    ctx.fill(ellipsePath(v.range(2, TILE - 2), v.range(2, TILE - 2), r, r, 0))
  }
  ctx.restore()

  if (openN) {
    // Frosted, walkable lip: opaque and matt, so the player can tell at a glance
    // which face they are standing on and which one they will slide off.
    const line = contour(v, 2.8, 0.9)
    const path = new Path2D()
    path.moveTo(0, -0.5)
    path.lineTo(TILE, -0.5)
    path.lineTo(TILE, 2.8)
    smooth(path, line.slice().reverse(), false)
    path.closePath()
    paint(ctx, path, cel(PAL.foam), {
      shadow: 0.3, radius: 2, pivot: [TILE / 2, 1.2], rim: 0.5, line: 0, light,
    })
  }
  if (openS) {
    ctx.save()
    ctx.fillStyle = rgba(PAL.foam, 0.8)
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
  // Exposed edges catch a hard specular; it is what separates a block of ice
  // from a block of anything else.
  ctx.save()
  ctx.lineWidth = 0.7
  ctx.strokeStyle = rgba(PAL.white, 0.65)
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
 * A bouncy pad. It has to look sprung: a taut convex dome, a compressed collar
 * under it, and a gap of shadow so it reads as sitting on the surface rather
 * than being part of it.
 */
function paintBouncy({ ctx }: TileDrawArgs): void {
  const light: Light = { x: -0.6, y: -0.8 }
  const skin = cel(PAL.heal)
  const collar = cel(mix(PAL.heal, PAL.ink, 0.42))

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
  // Tension lines running over the dome — the visual cue for "this is stretched".
  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.strokeStyle = skin.light
  ctx.lineWidth = 0.45
  ctx.stroke(curve([[3, 8], [TILE / 2, 3.4], [TILE - 3, 8]] as Pt[]))
  ctx.globalAlpha = 0.3
  ctx.stroke(curve([[2, 10.5], [TILE / 2, 6], [TILE - 2, 10.5]] as Pt[]))
  ctx.restore()
  glint(ctx, 5, 4, 2.4, 1.1, -0.6, PAL.white, 0.55)
}

/** A crumbling block: already fractured, already shedding dust. */
function paintCrumble({ ctx, mask, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x6d31))
  const c = cel(mix(mix(t.rock, t.timber, 0.28), PAL.ink, 0.12))
  const openS = (mask & 4) === 0

  paint(ctx, roundRectPath(0.2, 0.2, TILE - 0.4, TILE - 0.4, 0.8), c, {
    shadow: 0.4, radius: 7, pivot: [TILE / 2, TILE / 2], rim: 0.5, line: 0.55, light,
  })

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

/** Climbable rigging: rope, not ladder — it should look grabbable and slack. */
function paintClimb({ ctx, variant, biome }: TileDrawArgs): void {
  const t = terrainOf(biome)
  const light = lightOf(biome)
  const v = new Vary(hash2(variant, 0x8ac2))
  const rope = cel(mix(t.timber, PAL.sand, 0.45))
  const sag = v.range(0.5, 1.4)

  for (const x of [3.6, TILE - 3.6]) {
    const strand = new Path2D()
    smooth(strand, [
      [x, -0.5],
      [x + v.range(-0.4, 0.4), TILE * 0.5],
      [x, TILE + 0.5],
    ] as Pt[], true)
    ctx.save()
    ctx.strokeStyle = rope.core
    ctx.lineWidth = 1.9
    ctx.stroke(strand)
    ctx.strokeStyle = rope.shade
    ctx.lineWidth = 0.8
    ctx.translate(0.5, 0.4)
    ctx.stroke(strand)
    ctx.restore()
    // Twist: the fibre marks that make rope read as rope at a glance.
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.strokeStyle = rope.deep
    ctx.lineWidth = 0.32
    for (let y = 0; y < TILE; y += 1.9) {
      ctx.beginPath()
      ctx.moveTo(x - 0.9, y)
      ctx.lineTo(x + 0.9, y + 1.1)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Rungs sag between the strands and are lashed on at the ends.
  for (const y of [3.6, 11.6]) {
    const rung = new Path2D()
    smooth(rung, [
      [2.6, y],
      [TILE / 2, y + sag],
      [TILE - 2.6, y],
    ] as Pt[], true)
    ctx.save()
    ctx.strokeStyle = rope.core
    ctx.lineWidth = 1.6
    ctx.stroke(rung)
    ctx.strokeStyle = rope.light
    ctx.lineWidth = 0.5
    ctx.translate(light.x * 0.3, light.y * 0.3)
    ctx.stroke(rung)
    ctx.restore()
    ctx.save()
    ctx.fillStyle = rope.deep
    for (const x of [3.6, TILE - 3.6]) {
      ctx.fill(ellipsePath(x, y + 0.2, 1.1, 0.8, 0))
    }
    ctx.restore()
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
