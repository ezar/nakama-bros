import { BUFFER_H, BUFFER_W, GAME_H, GAME_W, RENDER_SCALE, TILE, Tile } from '../types'
import type { Biome, RenderContext } from '../types'
import type { ParallaxLayer, Tileset } from '../art'
import { Overlay, hash2 } from '../art/tiles'
import type { TileMap } from '../physics/TileMap'
import type { Camera } from '../engine/camera'
import type { Entity } from '../game/entities/Entity'
import type { ParticleSystem } from './particles'
import { PostFx, defaultPostFx, type PostFxSettings } from './postfx'
import { PAL, biomePalette } from '../art/palette'
import { mix, rgba } from '../art/color'

export interface DrawArgs {
  map: TileMap
  tileset: Tileset
  background: ParallaxLayer[]
  foreground?: ParallaxLayer[]
  entities: Entity[]
  camera: Camera
  particles: ParticleSystem
  biome: Biome
  time: number
  alpha: number
  weather?: 'clear' | 'rain' | 'snow' | 'sand' | 'ash'
  /** 0 = noon, 1 = night. Drives the ambient tint and the light pass. */
  timeOfDay?: number
}

const TAU = Math.PI * 2

/** How much darker terrain gets per tile of rock above it. Indexed by depth. */
const DEPTH_SHADE = [0, 0.08, 0.15, 0.2, 0.23, 0.25]

/**
 * The frame compositor.
 *
 * Draws into a device-resolution buffer whose context is scaled to world units,
 * so every painter and every entity works in the same coordinate space as the
 * physics. Layer order: sky parallax → terrain → entities (depth sorted) →
 * particles → water → foreground parallax → weather → lighting → post FX.
 */
export class Renderer {
  readonly buffer: HTMLCanvasElement
  private bctx: CanvasRenderingContext2D
  private postfx = new PostFx()
  private lightBuffer: HTMLCanvasElement
  private lctx: CanvasRenderingContext2D
  settings: PostFxSettings = defaultPostFx()
  /** Debug overlay: hitboxes and tile grid. */
  debug = false

  /** Gradients are keyed by row and reused within a frame; see `grad()`. */
  private gcache = new Map<number, CanvasGradient>()
  /** Pre-mixed water depth ramp, rebuilt only when the biome changes. */
  private waterRamp: string[] = []
  private waterRampBiome = ''
  /** Scratch buffers for the water passes, so no array is allocated per frame. */
  private waterTiles: number[] = []

  constructor(private canvas: HTMLCanvasElement) {
    this.buffer = document.createElement('canvas')
    this.buffer.width = BUFFER_W
    this.buffer.height = BUFFER_H
    this.bctx = this.buffer.getContext('2d')!
    this.lightBuffer = document.createElement('canvas')
    this.lightBuffer.width = BUFFER_W
    this.lightBuffer.height = BUFFER_H
    this.lctx = this.lightBuffer.getContext('2d')!
    this.resize()
  }

  /** Fit the visible canvas to its container, preserving the 16:9 frame. */
  resize(): void {
    const parent = this.canvas.parentElement
    const availW = parent?.clientWidth ?? window.innerWidth
    const availH = parent?.clientHeight ?? window.innerHeight
    const scale = Math.min(availW / GAME_W, availH / GAME_H)
    const cssW = Math.round(GAME_W * scale)
    const cssH = Math.round(GAME_H * scale)
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    // The backing store is fixed: the buffer is already above display
    // resolution, so matching it exactly avoids a second resample.
    this.canvas.width = BUFFER_W
    this.canvas.height = BUFFER_H
    const ctx = this.canvas.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
    }
  }

  draw(a: DrawArgs): void {
    const ctx = this.bctx
    const cam = a.camera.renderOrigin()

    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, GAME_W, GAME_H)

    const rc: RenderContext = {
      ctx,
      camera: a.camera,
      time: a.time,
      alpha: a.alpha,
      width: GAME_W,
      height: GAME_H,
    }

    this.drawParallax(ctx, a.background, cam.x, cam.y, a.time)

    ctx.save()
    ctx.translate(-cam.x, -cam.y)
    this.drawTiles(ctx, a, cam.x, cam.y, false)
    a.particles.draw(rc, true)

    const sorted = [...a.entities].filter((e) => e.active && !e.dead).sort((x, y) => x.depth - y.depth)
    for (const e of sorted) {
      const sx = e.body.px + (e.body.x - e.body.px) * a.alpha
      const sy = e.body.py + (e.body.y - e.body.py) * a.alpha
      e.draw(rc, sx, sy)
      if (this.debug) {
        const r = e.rect()
        ctx.strokeStyle = e.kind === 'player' ? '#4FD37A' : '#E23B3B'
        ctx.lineWidth = 0.4
        ctx.strokeRect(r.x, r.y, r.w, r.h)
      }
    }

    a.particles.draw(rc, false)
    this.drawTiles(ctx, a, cam.x, cam.y, true)
    ctx.restore()

    if (a.foreground?.length) this.drawParallax(ctx, a.foreground, cam.x, cam.y, a.time)
    if (a.weather && a.weather !== 'clear') this.drawWeather(ctx, a.weather, cam.x, a.time)
    this.drawLighting(ctx, a)

    this.postfx.apply(ctx, this.buffer, this.settings)
    this.present()
  }

  private present(): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.buffer, 0, 0)
  }

  private drawParallax(
    ctx: CanvasRenderingContext2D,
    layers: ParallaxLayer[],
    camX: number,
    camY: number,
    time: number,
  ): void {
    // Layer art is rasterised at ART_SCALE, which equals RENDER_SCALE, so a
    // layer drawn at a whole device pixel maps one source texel to one device
    // pixel and stays crisp. Parallax offsets are continuous, so without this
    // every layer is resampled every frame — and at a repeat boundary the two
    // copies each get a half-covered edge column, which is a visible seam. Snap
    // both edges of every blit to the device grid and take the width from the
    // difference, so consecutive copies share an exact device-pixel border.
    const snap = (v: number) => Math.round(v * RENDER_SCALE) / RENDER_SCALE
    for (const l of layers) {
      const drift = (l.autoScroll ?? 0) * time
      const ox = -(camX * l.factor + drift)
      const oy = -(camY * (l.factorY ?? l.factor * 0.35)) + l.yOffset
      const bob = l.bob ? Math.sin(time * (l.bobSpeed ?? 0.6)) * l.bob : 0
      const dy = snap(oy + bob)
      const dh = snap(oy + bob + l.height) - dy
      ctx.save()
      if (l.alpha !== undefined) ctx.globalAlpha = l.alpha
      if (l.blend) ctx.globalCompositeOperation = l.blend
      if (l.repeat) {
        let start = ox % l.width
        if (start > 0) start -= l.width
        for (let x = start; x < GAME_W; x += l.width) {
          const dx = snap(x)
          ctx.drawImage(l.image, dx, dy, snap(x + l.width) - dx, dh)
        }
      } else {
        const dx = snap(ox)
        ctx.drawImage(l.image, dx, dy, snap(ox + l.width) - dx, dh)
      }
      ctx.restore()
    }
  }

  /**
   * Draw the tiles overlapping the view.
   *
   * There is no whole-level or per-chunk cache. A viewport holds about 350
   * tiles plus two dozen grass crowns, which is under 400 blits of a single
   * texture — well inside the budget, and cheap enough that a chunk cache would
   * only buy invalidation bugs when a brick breaks.
   */
  private drawTiles(
    ctx: CanvasRenderingContext2D,
    a: DrawArgs,
    camX: number,
    camY: number,
    front: boolean,
  ): void {
    const map = a.map
    const ts = a.tileset
    const x0 = Math.max(0, Math.floor(camX / TILE) - 1)
    const x1 = Math.min(map.w - 1, Math.ceil((camX + GAME_W) / TILE) + 1)
    const y0 = Math.max(0, Math.floor(camY / TILE) - 1)
    const y1 = Math.min(map.h - 1, Math.ceil((camY + GAME_H) / TILE) + 1)

    // Water animates and refracts what is behind it, so it is drawn after the
    // entities in its own pass.
    if (front) {
      this.drawWater(ctx, a, camX, camY, x0, x1, y0, y1)
      return
    }

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const id = map.get(tx, ty)
        if (id === Tile.Empty || id === Tile.Water) continue
        const mask = neighbourMask(map, tx, ty)
        const h = hash2(tx, ty)
        // A fake wall borrows the solid tile's art outright — not a lookalike,
        // the same cell of the same atlas, same variant, same mirroring. There
        // is nothing to spot because there is nothing different to spot.
        const src = ts.src(family(id), mask, h % ts.variants)
        // Mirroring doubles the effective variant count for the price of one
        // transform, but only where the tile is left-right symmetric: flipping
        // a cliff edge would put its lit face on the wrong side.
        const symmetric = ((mask >> 1) & 1) === ((mask >> 3) & 1)
        const ghosted = id === Tile.FakeSeen
        if (ghosted) {
          ctx.save()
          ctx.globalAlpha = 0.34
        }
        this.blitTile(ctx, ts, src.sx, src.sy, tx * TILE, ty * TILE, ((h >>> 9) & 1) === 1 && symmetric)
        if (ghosted) ctx.restore()
      }
    }

    // Grass, crust and wisps that overhang the surface. These live in the cell
    // above the ground so their silhouette can break the tile grid without
    // moving the surface the player actually stands on.
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        // Grass grows on a fake wall too, right up until somebody walks
        // through it — losing the tuft is half of how a revealed wall reads as
        // never having been one.
        const here = map.get(tx, ty)
        if (here !== Tile.Solid && here !== Tile.Fake) continue
        const above = map.get(tx, ty - 1)
        if (above !== Tile.Empty && above !== Tile.Decor) continue
        const mask = neighbourMask(map, tx, ty)
        const h = hash2(tx ^ 0x5bd1, ty)
        const src = ts.src(Overlay.Crown, mask, h % ts.variants)
        const half = ts.cellPx / 2
        const flip = ((h >>> 11) & 1) === 1
        ctx.save()
        if (flip) {
          ctx.translate(tx * TILE + TILE, ty * TILE - TILE / 2)
          ctx.scale(-1, 1)
          ctx.drawImage(ts.image, src.sx, src.sy + half, ts.cellPx, half, 0, 0, TILE, TILE / 2)
        } else {
          ctx.drawImage(
            ts.image, src.sx, src.sy + half, ts.cellPx, half,
            tx * TILE, ty * TILE - TILE / 2, TILE, TILE / 2,
          )
        }
        ctx.restore()
      }
    }

    this.drawTerrainAmbient(ctx, a, x0, x1, y0, y1)
  }

  private blitTile(
    ctx: CanvasRenderingContext2D,
    ts: Tileset,
    sx: number,
    sy: number,
    dx: number,
    dy: number,
    flip: boolean,
  ): void {
    if (!flip) {
      ctx.drawImage(ts.image, sx, sy, ts.cellPx, ts.cellPx, dx, dy, TILE, TILE)
      return
    }
    ctx.save()
    ctx.translate(dx + TILE, dy)
    ctx.scale(-1, 1)
    ctx.drawImage(ts.image, sx, sy, ts.cellPx, ts.cellPx, 0, 0, TILE, TILE)
    ctx.restore()
  }

  /** Gradients cached for the frame — the same row asks for the same ramp. */
  private grad(
    ctx: CanvasRenderingContext2D,
    key: number,
    x0: number, y0: number, x1: number, y1: number,
    c0: string, c1: string,
  ): CanvasGradient {
    let g = this.gcache.get(key)
    if (!g) {
      g = ctx.createLinearGradient(x0, y0, x1, y1)
      g.addColorStop(0, c0)
      g.addColorStop(1, c1)
      this.gcache.set(key, g)
    }
    return g
  }

  /**
   * As `grad`, but radial and with a mid stop.
   *
   * Inner corners need a pool that is dense at the crease and gone by the time
   * it is a tile away; a two-stop linear ramp fades far too evenly and reads as
   * a smudge rather than as contact.
   */
  private rgrad(
    ctx: CanvasRenderingContext2D,
    key: number,
    cx: number, cy: number, r: number,
    color: string, a0: number, a1: number,
  ): CanvasGradient {
    let g = this.gcache.get(key)
    if (!g) {
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      g.addColorStop(0, rgba(color, a0))
      g.addColorStop(0.45, rgba(color, a1))
      g.addColorStop(1, rgba(color, 0))
      this.gcache.set(key, g)
    }
    return g
  }

  /**
   * The pass that turns a grid of tiles into terrain.
   *
   * Everything here depends on what is *next to* a tile rather than on the tile,
   * so none of it can be baked into the atlas. The passes run in the order a
   * painter would work: depth first, then the light on the vertical faces, then
   * the bounce off everything facing the sky, then the shadows and the creases.
   *
   * The rule the whole pass obeys is that shading is applied to the real
   * terrain edge — the boundary between a solid cell and an open one — and
   * never to a rectangle that merely contains it. That is what makes a
   * one-tile pillar, a step and an inner corner all read correctly from the
   * same code.
   */
  private drawTerrainAmbient(
    ctx: CanvasRenderingContext2D,
    a: DrawArgs,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
  ): void {
    const map = a.map
    const p = biomePalette(a.biome)
    // Slopes are excluded: they fill only half their cell, so a band drawn
    // across the whole tile would paint light and occlusion into open sky.
    const solid = (tx: number, ty: number) => {
      const f = map.flags(tx, ty)
      return f.solid && f.slope === 0
    }
    // Which way the key light comes from: -1 when it rakes in from the left.
    const ls = p.lightDirX < 0 ? -1 : 1
    const bounce = mix(p.sunTint, p.ambient, 0.35)
    this.gcache.clear()
    ctx.save()

    // 1. Depth. A continuous ramp built from per-tile gradients that meet at
    //    the borders, rather than a per-tile ramp that restarts at every row —
    //    which is what put a bright line across the old ground every 16 units.
    for (let ty = y0; ty <= y1; ty++) {
      const y = ty * TILE
      for (let tx = x0; tx <= x1; tx++) {
        // Through `family`, so a fake wall takes the same depth ramp as the
        // stone around it. Left out, it would be the one flat patch on a shaded
        // cliff — which is exactly the tell this tile exists to avoid.
        const id = family(map.get(tx, ty))
        if (id !== Tile.Solid && id !== Tile.Ice && id !== Tile.Decor) continue
        let d = 0
        while (d < 5 && family(map.get(tx, ty - 1 - d)) === id) d++
        // The surface row is shaded too, from nothing at its top to whatever
        // the row below starts at. Skipping it as an optimisation left a step
        // of the first ramp's whole depth exactly one tile under every skyline
        // — a hard horizontal line across the frame, which is the artefact the
        // continuous ramp exists to remove.
        const top = DEPTH_SHADE[Math.min(d, 5)]
        const bot = DEPTH_SHADE[Math.min(d + 1, 5)]
        ctx.fillStyle = this.grad(
          ctx, 1e7 + ty * 8 + d, 0, y, 0, y + TILE,
          rgba(PAL.ink, top), rgba(PAL.ink, bot),
        )
        ctx.fillRect(tx * TILE, y, TILE, TILE)
      }
    }

    // 2. The vertical faces, lit and shadowed on the terrain itself.
    //
    //    A cliff has a side turned into the light and a side turned away from
    //    it, and until that is drawn a mass of ground is a flat brown wall with
    //    a green lid. This runs on the *solid* cell next to open air, so a
    //    single-tile pillar gets both of its faces and a face two tiles tall
    //    joins into one continuous band, with no seam at the row border.
    for (let ty = y0; ty <= y1; ty++) {
      const y = ty * TILE
      for (let tx = x0; tx <= x1; tx++) {
        if (!solid(tx, ty)) continue
        const x = tx * TILE
        for (const s of [-1, 1] as const) {
          if (solid(tx + s, ty)) continue
          const edge = s < 0 ? x : x + TILE
          const lit = s === ls
          const w = lit ? 5 : 6.5
          const rx = s < 0 ? x : x + TILE - w
          if (lit) {
            // The lit face: a wash of warm light, brightest at the arris.
            ctx.globalCompositeOperation = 'lighter'
            ctx.fillStyle = this.grad(
              ctx, 7e7 + (tx + 4096) * 2 + (s < 0 ? 0 : 1),
              edge, 0, edge - s * w, 0,
              rgba(bounce, 0.2), rgba(bounce, 0),
            )
            ctx.fillRect(rx, y, w, TILE)
            ctx.globalCompositeOperation = 'source-over'
          } else {
            ctx.fillStyle = this.grad(
              ctx, 8e7 + (tx + 4096) * 2 + (s < 0 ? 0 : 1),
              edge, 0, edge - s * w, 0,
              rgba(PAL.ink, 0.3), rgba(PAL.ink, 0),
            )
            ctx.fillRect(rx, y, w, TILE)
          }
        }
      }
    }

    // 3. Bounce. Ground facing the sky picks up warm light off everything
    //    around it; without this the top of a cliff is the same value as its
    //    side and the whole mass reads as a cut-out. Two bands: a wide soft
    //    one for the bounce itself and a tight bright one at the lip, which is
    //    the line that separates ground from sky at a glance.
    ctx.globalCompositeOperation = 'lighter'
    for (let ty = y0; ty <= y1; ty++) {
      const y = ty * TILE
      for (let tx = x0; tx <= x1; tx++) {
        if (!solid(tx, ty) || solid(tx, ty - 1)) continue
        const x = tx * TILE
        ctx.fillStyle = this.grad(
          ctx, 2e7 + ty, 0, y, 0, y + 9,
          rgba(bounce, 0.17), rgba(bounce, 0),
        )
        ctx.fillRect(x, y, TILE, 9)
        ctx.fillStyle = this.grad(
          ctx, 2.5e7 + ty, 0, y, 0, y + 1.8,
          rgba(p.sunTint, 0.1), rgba(p.sunTint, 0),
        )
        ctx.fillRect(x, y, TILE, 1.8)
      }
    }
    ctx.globalCompositeOperation = 'source-over'

    // 4. The shadow a wall casts along its own foot. Cheap, and it is the cue
    //    that tells the eye which of two adjacent surfaces is higher.
    for (let ty = y0; ty <= y1; ty++) {
      const y = ty * TILE
      for (let tx = x0; tx <= x1; tx++) {
        if (!solid(tx, ty) || solid(tx, ty - 1)) continue
        if (!solid(tx + ls, ty - 1)) continue
        const x = tx * TILE
        const from = ls < 0 ? x : x + TILE
        ctx.fillStyle = this.grad(
          ctx, 3e7 + (tx + 4096) * 4 + (ls < 0 ? 0 : 1),
          from, 0, from + ls * -11, 0,
          rgba(PAL.ink, 0.4), rgba(PAL.ink, 0),
        )
        ctx.fillRect(ls < 0 ? x : x + TILE - 11, y, 11, 7)
      }
    }

    // 5. Occlusion thrown into the open. Every open cell is darkened by the
    //    solids around it.
    for (let ty = y0; ty <= y1; ty++) {
      const y = ty * TILE
      for (let tx = x0; tx <= x1; tx++) {
        if (solid(tx, ty)) continue
        const x = tx * TILE

        if (solid(tx, ty - 1)) {
          // Under an overhang. Ceilings are the darkest thing in a 2D scene.
          ctx.fillStyle = this.grad(
            ctx, 4e7 + ty, 0, y, 0, y + 11,
            rgba(PAL.ink, 0.4), rgba(PAL.ink, 0),
          )
          ctx.fillRect(x, y, TILE, 11)
        }
        if (solid(tx, ty + 1)) {
          // Near-field contact with the ground, kept short so it grounds an
          // entity standing there without fogging the whole band.
          ctx.fillStyle = this.grad(
            ctx, 5e7 + ty, 0, y + TILE, 0, y + TILE - 4,
            rgba(PAL.ink, 0.2), rgba(PAL.ink, 0),
          )
          ctx.fillRect(x, y + TILE - 4, TILE, 4)
        }
        for (const s of [-1, 1] as const) {
          if (!solid(tx + s, ty)) continue
          // The face turned away from the light throws a long shadow; the lit
          // face only has contact occlusion.
          const away = s === ls
          const w = away ? 9 : 4
          const from = s < 0 ? x : x + TILE
          ctx.fillStyle = this.grad(
            ctx, 6e7 + (tx + 4096) * 8 + (s < 0 ? 0 : 1) * 2 + (away ? 1 : 0),
            from, 0, from - s * w, 0,
            rgba(PAL.ink, away ? 0.3 : 0.18), rgba(PAL.ink, 0),
          )
          ctx.fillRect(s < 0 ? x : x + TILE - w, y, w, TILE)
        }

        // 6. Inner corners. Where two of those faces meet, the crease pools.
        //    Summing two linear bands only ever gives a soft cross; a radial
        //    pool anchored on the corner point is what actually reads as one
        //    surface running into another, and it is the difference between a
        //    step in the ground and two rectangles that happen to touch.
        for (const sy of [-1, 1] as const) {
          if (!solid(tx, ty + sy)) continue
          for (const sx of [-1, 1] as const) {
            if (!solid(tx + sx, ty)) continue
            const cx = sx < 0 ? x : x + TILE
            const cy = sy < 0 ? y : y + TILE
            // A radial gradient is anchored to a point, so its key has to
            // carry the full tile coordinate: folding the row into eight
            // buckets made two corners eight rows apart share one gradient,
            // and the second of them got a pool centred on the first.
            ctx.fillStyle = this.rgrad(
              ctx,
              2e8 + ((tx + 4096) * 64 + (ty + 4096)) * 4 + (sx < 0 ? 0 : 1) * 2 + (sy < 0 ? 0 : 1),
              cx, cy, 13, PAL.ink, 0.34, 0.16,
            )
            ctx.fillRect(sx < 0 ? x : x + TILE - 13, sy < 0 ? y : y + TILE - 13, 13, 13)
          }
        }
      }
    }

    ctx.restore()
  }

  /** Pre-mixed depth ramp for the current biome's water. */
  private ramp(biome: Biome): string[] {
    if (this.waterRampBiome === biome && this.waterRamp.length) return this.waterRamp
    // Water is water in every biome: the ramp is built from the sea colours and
    // only tinted by the biome accent. Driving it from `accent` alone made
    // Alabasta's water orange and Wano's pink.
    const p = biomePalette(biome)
    const shallow = mix(PAL.sea, p.accent, 0.3)
    const out: string[] = []
    for (let i = 0; i < 8; i++) {
      const k = i / 7
      out.push(rgba(mix(shallow, PAL.seaDeep, k * 0.85), 0.42 + k * 0.2))
    }
    this.waterRamp = out
    this.waterRampBiome = biome
    return out
  }

  /**
   * Water.
   *
   * Drawn after the entities so it can bend them: the buffer already holds the
   * scene, so refraction is a matter of re-blitting horizontal slices of it
   * displaced by a travelling sine. The displacement depends only on world y
   * and time, never on the tile, so the whole body shears as one sheet instead
   * of stepping at every border.
   */
  private drawWater(
    ctx: CanvasRenderingContext2D,
    a: DrawArgs,
    camX: number,
    camY: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
  ): void {
    const map = a.map
    const cells = this.waterTiles
    cells.length = 0
    const region = new Path2D()
    let left = Infinity
    let right = -Infinity
    let top = Infinity
    let bottom = -Infinity

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (map.get(tx, ty) !== Tile.Water) continue
        let d = 0
        while (d < 12 && map.get(tx, ty - 1 - d) === Tile.Water) d++
        cells.push(tx, ty, d)
        // The surface line wobbles above its own tile, so its cell reaches up.
        const lift = d === 0 ? 3 : 0
        region.rect(tx * TILE, ty * TILE - lift, TILE, TILE + lift)
        if (tx < left) left = tx
        if (tx > right) right = tx
        if (ty < top) top = ty
        if (ty > bottom) bottom = ty
      }
    }
    if (!cells.length) return

    const ramp = this.ramp(a.biome)
    const wl = Math.max(left * TILE, camX)
    const wr = Math.min((right + 1) * TILE, camX + GAME_W)
    const wt = Math.max(top * TILE, camY)
    const wb = Math.min((bottom + 1) * TILE, camY + GAME_H)
    if (wr <= wl || wb <= wt) return

    ctx.save()
    ctx.clip(region)

    // 1. Refraction. Slices are clamped to the viewport so the source rect is
    //    always inside the buffer we are reading from.
    const S = RENDER_SCALE
    const slice = 4
    const span = Math.max(1, wb - wt)
    for (let wy = Math.floor(wt); wy < wb; wy += slice) {
      const h = Math.min(slice, wb - wy)
      // The shear is strongest just under the surface and dies away with
      // depth: it is the wave that bends the light, so the bend belongs where
      // the wave is. A constant offset sheared the whole body by the same
      // amount, which reads as the picture sliding rather than as refraction.
      const near = 1 - (wy - wt) / span
      const amp = 0.55 + near * near * 1.9
      const off = Math.sin(a.time * 1.5 + wy * 0.36) * amp
      ctx.drawImage(
        this.buffer,
        (wl - camX) * S, (wy - camY) * S, (wr - wl) * S, h * S,
        wl + off, wy, wr - wl, h,
      )
    }

    // 2. Body, darkening with depth. The ramp is pre-mixed, so this costs a
    //    gradient per (row, depth) rather than a colour computation per tile per
    //    frame — and it has to be a gradient: a flat fill per tile stepped the
    //    value at every row border and a deep pool came out as a stack of
    //    stripes. Consecutive tiles hand off at the same ramp entry, so a
    //    column of water darkens as one continuous body.
    for (let i = 0; i < cells.length; i += 3) {
      const ty = cells[i + 1]
      const y = ty * TILE
      const d = Math.min(7, cells[i + 2])
      ctx.fillStyle = this.grad(
        ctx, 1.2e8 + ty * 16 + d, 0, y, 0, y + TILE,
        ramp[d], ramp[Math.min(7, d + 1)],
      )
      ctx.fillRect(cells[i] * TILE, y, TILE, TILE)
    }

    // 3. Caustics. Two families, and neither is tied to the surface wave: the
    //    shafts hanging from the surface, and a net crawling over the bed. They
    //    travel at different speeds and in opposite directions, which is what
    //    keeps the shimmer from locking to the swell and reading as a texture
    //    scrolling past.
    ctx.globalCompositeOperation = 'lighter'
    for (const [period, speed, slant, width, alpha] of [
      [17, 6.5, -9, 3.2, 0.028],
      [17, 6.5, -9, 1.1, 0.03],
      [9, -4.5, -4, 0.7, 0.022],
    ] as const) {
      const drift = ((a.time * speed) % period + period) % period
      ctx.strokeStyle = rgba(PAL.foam, alpha)
      ctx.lineWidth = width
      ctx.beginPath()
      // Shafts are cut short of the bed so the light reads as fading out with
      // depth rather than as a set of ruled lines drawn over the whole body.
      for (let x = wl - period - Math.abs(slant); x < wr + period; x += period) {
        const fade = wt + (wb - wt) * (0.55 + ((x * 0.37) % 1) * 0.4)
        ctx.moveTo(x + drift, wt)
        ctx.lineTo(x + drift + slant * ((fade - wt) / Math.max(1, wb - wt)), fade)
      }
      ctx.stroke()
    }
    // The net on the bed: bright wavering lines lying on whatever the water is
    // standing on, sliding the other way and at a third of the speed. This is
    // the read that says the pool has a floor rather than a bottom edge.
    ctx.lineWidth = 0.55
    for (let i = 0; i < cells.length; i += 3) {
      const tx = cells[i]
      const ty = cells[i + 1]
      if (!map.flags(tx, ty + 1).solid) continue
      const x = tx * TILE
      const y = ty * TILE + TILE
      ctx.strokeStyle = rgba(PAL.foam, 0.075)
      ctx.beginPath()
      for (let k = 0; k < 3; k++) {
        const px = x + ((k * 5.4 + a.time * 2.2 + tx * 6.3) % TILE)
        const w = 2.4 + Math.sin(a.time * 1.7 + tx + k) * 1.4
        ctx.moveTo(px - w, y - 1.4 - Math.sin(a.time * 2.4 + px * 0.3) * 0.9)
        ctx.lineTo(px + w, y - 1.4 + Math.sin(a.time * 2.1 + px * 0.28) * 0.9)
      }
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'

    // 4. Foam where the water is held by something solid. Water piles against a
    //    wall and slides down it, so the contact is an uneven band with lumps
    //    riding it, never the ruled strip it used to be.
    for (let i = 0; i < cells.length; i += 3) {
      const tx = cells[i]
      const ty = cells[i + 1]
      const x = tx * TILE
      const y = ty * TILE
      if (map.flags(tx, ty + 1).solid) {
        ctx.fillStyle = this.grad(
          ctx, 1.3e8 + ty, 0, y + TILE, 0, y + TILE - 3.4,
          rgba(PAL.foam, 0.16), rgba(PAL.foam, 0),
        )
        ctx.fillRect(x, y + TILE - 3.4, TILE, 3.4)
      }
      for (const s of [-1, 1] as const) {
        if (!map.flags(tx + s, ty).solid) continue
        const bx = s < 0 ? x : x + TILE
        ctx.fillStyle = this.grad(
          ctx, 1.4e8 + (tx + 4096) * 2 + (s < 0 ? 0 : 1),
          bx, 0, bx - s * 3.6, 0,
          rgba(PAL.foam, 0.24), rgba(PAL.foam, 0),
        )
        ctx.fillRect(s < 0 ? x : x + TILE - 3.6, y, 3.6, TILE)
        // Lumps of foam riding up and down the wall, so the contact line is not
        // a ruled strip.
        ctx.beginPath()
        for (let k = 0; k < 3; k++) {
          const fy = y + ((k * 5.4 + a.time * 4 + tx * 3.1 + ty * 7) % TILE)
          ctx.ellipse(bx, fy, 1.9, 1.5, 0, 0, TAU)
        }
        ctx.fillStyle = rgba(PAL.foam, 0.2)
        ctx.fill()
      }
    }

    // 5. The surface line, drawn per horizontal run so the wave is continuous
    //    across a whole lake instead of restarting inside every tile.
    for (let ty = y0; ty <= y1; ty++) {
      let run = -1
      for (let tx = x0; tx <= x1 + 1; tx++) {
        const isSurface =
          tx <= x1 && map.get(tx, ty) === Tile.Water && map.get(tx, ty - 1) !== Tile.Water
        if (isSurface && run < 0) run = tx
        if (!isSurface && run >= 0) {
          this.drawWaterSurface(ctx, a, map, run, tx - 1, ty)
          run = -1
        }
      }
    }

    ctx.restore()
  }

  private drawWaterSurface(
    ctx: CanvasRenderingContext2D,
    a: DrawArgs,
    map: TileMap,
    xa: number,
    xb: number,
    ty: number,
  ): void {
    const y = ty * TILE
    const wave = (x: number) =>
      Math.sin(a.time * 2.2 + x * 0.16) * 0.85 + Math.sin(a.time * 1.05 - x * 0.062) * 0.55
    const path = new Path2D()
    for (let x = xa * TILE; x <= (xb + 1) * TILE; x += 2) {
      const py = y + wave(x)
      if (x === xa * TILE) path.moveTo(x, py)
      else path.lineTo(x, py)
    }

    ctx.save()
    // A dark lip just under the crest is what makes the line read as a surface
    // seen edge-on rather than as a drawn stroke.
    ctx.translate(0, 1.5)
    ctx.strokeStyle = rgba(PAL.seaDeep, 0.4)
    ctx.lineWidth = 1.8
    ctx.stroke(path)
    ctx.restore()

    // The refracted line: a second, brighter crest travelling at its own speed
    // and lagging the wave, so the two cross. A surface seen edge-on shows the
    // bright sky bent along the near face of every swell, and that bent
    // highlight is what makes a waterline read as water rather than as a
    // drawn stroke — one stroke on its own is a border.
    const bent = new Path2D()
    for (let x = xa * TILE; x <= (xb + 1) * TILE; x += 2) {
      const py = y + wave(x) * 0.55 + Math.sin(a.time * 1.7 - x * 0.11) * 0.7 + 0.9
      if (x === xa * TILE) bent.moveTo(x, py)
      else bent.lineTo(x, py)
    }
    ctx.strokeStyle = rgba(PAL.seaLight, 0.5)
    ctx.lineWidth = 1.3
    ctx.stroke(bent)

    ctx.strokeStyle = rgba(PAL.foam, 0.85)
    ctx.lineWidth = 0.9
    ctx.stroke(path)
    ctx.save()
    ctx.translate(0, 2.6)
    ctx.strokeStyle = rgba(PAL.foam, 0.28)
    ctx.lineWidth = 0.5
    ctx.stroke(path)
    ctx.restore()

    // Where the waterline meets a wall it piles up and breaks.
    for (const [tx, s] of [[xa, -1], [xb, 1]] as const) {
      if (!map.flags(tx + s, ty).solid) continue
      const fx = s < 0 ? tx * TILE : (tx + 1) * TILE
      const swell = 1.1 + Math.sin(a.time * 3.4 + tx) * 0.5
      ctx.fillStyle = rgba(PAL.foam, 0.5)
      ctx.beginPath()
      ctx.ellipse(fx, y + wave(fx), 3.4, swell, 0, 0, TAU)
      ctx.fill()
    }
  }

  private drawWeather(
    ctx: CanvasRenderingContext2D,
    weather: NonNullable<DrawArgs['weather']>,
    camX: number,
    time: number,
  ): void {
    ctx.save()
    switch (weather) {
      case 'rain': {
        ctx.strokeStyle = 'rgba(198,232,246,0.5)'
        ctx.lineWidth = 0.5
        ctx.beginPath()
        for (let i = 0; i < 110; i++) {
          const seed = i * 97.3
          const x = ((seed * 13 + time * 300) % (GAME_W + 60)) - 30 - camX * 0.15
          const y = ((seed * 29 + time * 700) % (GAME_H + 40)) - 20
          ctx.moveTo(x, y)
          ctx.lineTo(x - 2.5, y + 9)
        }
        ctx.stroke()
        break
      }
      case 'snow': {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        for (let i = 0; i < 80; i++) {
          const seed = i * 61.7
          const x = ((seed * 17 + time * 18 + Math.sin(time * 0.8 + i) * 10) % (GAME_W + 40)) - 20 - camX * 0.12
          const y = ((seed * 37 + time * 38) % (GAME_H + 30)) - 15
          ctx.beginPath()
          ctx.arc(x, y, 0.8 + (i % 3) * 0.35, 0, Math.PI * 2)
          ctx.fill()
        }
        break
      }
      case 'sand': {
        ctx.globalAlpha = 0.2
        ctx.strokeStyle = '#E7CE9B'
        ctx.lineWidth = 0.7
        ctx.beginPath()
        for (let i = 0; i < 50; i++) {
          const seed = i * 53.1
          const x = ((seed * 23 + time * 380) % (GAME_W + 140)) - 70
          const y = (seed * 41) % GAME_H
          ctx.moveTo(x, y)
          ctx.lineTo(x + 14, y + 1.5)
        }
        ctx.stroke()
        break
      }
      case 'ash': {
        ctx.fillStyle = 'rgba(255,150,110,0.7)'
        for (let i = 0; i < 55; i++) {
          const seed = i * 71.3
          const x = ((seed * 19 + Math.sin(time * 0.5 + i) * 16) % (GAME_W + 30)) - 15 - camX * 0.08
          const y = GAME_H - ((seed * 31 + time * 26) % (GAME_H + 40))
          ctx.beginPath()
          ctx.arc(x, y, 0.7, 0, Math.PI * 2)
          ctx.fill()
        }
        break
      }
    }
    ctx.restore()
  }

  /** Ambient darkening at night, punched through around the play space. */
  private drawLighting(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
    const night = a.timeOfDay ?? 0
    if (night <= 0.01) return
    const l = this.lctx
    l.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0)
    l.globalCompositeOperation = 'source-over'
    l.fillStyle = `rgba(8,14,38,${0.6 * night})`
    l.fillRect(0, 0, GAME_W, GAME_H)
    l.globalCompositeOperation = 'destination-out'
    const g = l.createRadialGradient(GAME_W / 2, GAME_H / 2, 6, GAME_W / 2, GAME_H / 2, 118)
    g.addColorStop(0, 'rgba(0,0,0,0.92)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    l.fillStyle = g
    l.fillRect(0, 0, GAME_W, GAME_H)
    l.globalCompositeOperation = 'source-over'

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(this.lightBuffer, 0, 0)
    ctx.restore()
    l.setTransform(1, 0, 0, 1, 0, 0)
    l.clearRect(0, 0, BUFFER_W, BUFFER_H)
  }
}

/**
 * What a tile counts as when its neighbours are asked.
 *
 * A fake wall has to autotile as though it were the wall it is pretending to
 * be — and so do the real tiles beside it. Treated as its own kind, the seam
 * would tile itself an edge, and a wall with a suspicious vertical line down
 * it is not a secret, it is a sign saying "here".
 */
function family(id: number): number {
  return id === Tile.Fake || id === Tile.FakeSeen ? Tile.Solid : id
}

/** 8-bit neighbour mask: N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128. */
export function neighbourMask(map: TileMap, tx: number, ty: number): number {
  const id = family(map.get(tx, ty))
  const same = (dx: number, dy: number) => family(map.get(tx + dx, ty + dy)) === id
  return (
    (same(0, -1) ? 1 : 0) |
    (same(1, 0) ? 2 : 0) |
    (same(0, 1) ? 4 : 0) |
    (same(-1, 0) ? 8 : 0) |
    (same(1, -1) ? 16 : 0) |
    (same(1, 1) ? 32 : 0) |
    (same(-1, 1) ? 64 : 0) |
    (same(-1, -1) ? 128 : 0)
  )
}
