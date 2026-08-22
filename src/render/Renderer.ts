import { BUFFER_H, BUFFER_W, GAME_H, GAME_W, RENDER_SCALE, TILE, Tile } from '../types'
import type { Biome, RenderContext } from '../types'
import type { ParallaxLayer, Tileset } from '../art'
import type { TileMap } from '../physics/TileMap'
import type { Camera } from '../engine/camera'
import type { Entity } from '../game/entities/Entity'
import type { ParticleSystem } from './particles'
import { PostFx, defaultPostFx, type PostFxSettings } from './postfx'
import { biomePalette } from '../art/palette'
import { rgba } from '../art/color'

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

/**
 * The frame compositor.
 *
 * Draws into a device-resolution buffer whose context is scaled to world units,
 * so every painter and every entity works in the same coordinate space as the
 * physics. Layer order: sky parallax → terrain → entities (depth sorted) →
 * particles → foreground parallax → weather → lighting → post FX.
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
    for (const l of layers) {
      const drift = (l.autoScroll ?? 0) * time
      const ox = -(camX * l.factor + drift)
      const oy = -(camY * (l.factorY ?? l.factor * 0.35)) + l.yOffset
      const bob = l.bob ? Math.sin(time * (l.bobSpeed ?? 0.6)) * l.bob : 0
      ctx.save()
      if (l.alpha !== undefined) ctx.globalAlpha = l.alpha
      if (l.blend) ctx.globalCompositeOperation = l.blend
      if (l.repeat) {
        let start = ox % l.width
        if (start > 0) start -= l.width
        for (let x = start; x < GAME_W; x += l.width) {
          ctx.drawImage(l.image, x, oy + bob, l.width, l.height)
        }
      } else {
        ctx.drawImage(l.image, ox, oy + bob, l.width, l.height)
      }
      ctx.restore()
    }
  }

  /**
   * Draw the tiles overlapping the view.
   *
   * There is no whole-level cache: at this resolution one would cost tens of
   * megabytes, and a viewport only ever holds about 350 tiles, which is a
   * trivial number of blits.
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

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const id = map.get(tx, ty)
        if (id === Tile.Empty) continue
        // Water animates, so it is drawn by its own pass, and only in front.
        if (id === Tile.Water) {
          if (front) this.drawWaterTile(ctx, a, tx, ty)
          continue
        }
        if (front) continue
        const mask = neighbourMask(map, tx, ty)
        const variant = (tx * 7 + ty * 13) % ts.variants
        const src = ts.src(id, mask, variant)
        ctx.drawImage(
          ts.image,
          src.sx, src.sy, ts.cellPx, ts.cellPx,
          tx * TILE, ty * TILE, TILE, TILE,
        )
      }
    }

    if (!front) this.drawTerrainAmbient(ctx, a, x0, x1, y0, y1)
  }

  /**
   * A soft dark band where solid terrain meets open air. One cheap pass, and
   * the single biggest contributor to the world reading as three-dimensional.
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
    ctx.save()
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!map.flags(tx, ty).solid) continue
        // Only the tiles with open air above get the light band and the
        // occlusion below it.
        if (map.flags(tx, ty - 1).solid) continue
        const x = tx * TILE
        const y = ty * TILE
        const g = ctx.createLinearGradient(0, y - 7, 0, y + 1)
        g.addColorStop(0, rgba(p.ambient, 0))
        g.addColorStop(1, rgba('#0A1024', 0.32))
        ctx.fillStyle = g
        ctx.fillRect(x, y - 7, TILE, 8)
      }
    }
    ctx.restore()
  }

  private drawWaterTile(ctx: CanvasRenderingContext2D, a: DrawArgs, tx: number, ty: number): void {
    const p = biomePalette(a.biome)
    const surface = a.map.get(tx, ty - 1) !== Tile.Water
    const x = tx * TILE
    const y = ty * TILE
    ctx.save()
    const g = ctx.createLinearGradient(0, y, 0, y + TILE)
    g.addColorStop(0, rgba(p.accent, 0.5))
    g.addColorStop(1, rgba('#0A2A4A', 0.66))
    ctx.fillStyle = g
    ctx.fillRect(x, y, TILE, TILE)

    // Caustic bands drifting at their own rate.
    ctx.globalAlpha = 0.13
    ctx.fillStyle = '#CFF0F7'
    const cx = ((a.time * 9 + tx * 5 + ty * 3) % (TILE * 2)) - TILE
    ctx.fillRect(x + cx, y + 4, 5, 1.2)
    ctx.fillRect(x + cx * 0.6 + 4, y + 10, 3.5, 1)

    if (surface) {
      ctx.globalAlpha = 1
      const wob = Math.sin(a.time * 2.6 + tx * 0.8) * 1.1
      ctx.fillStyle = '#CFF0F7'
      ctx.fillRect(x, y + wob, TILE, 0.9)
      ctx.globalAlpha = 0.4
      ctx.fillRect(x, y + wob + 1.2, TILE, 0.6)
    }
    ctx.restore()
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

/** 8-bit neighbour mask: N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128. */
export function neighbourMask(map: TileMap, tx: number, ty: number): number {
  const id = map.get(tx, ty)
  const same = (dx: number, dy: number) => map.get(tx + dx, ty + dy) === id
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
