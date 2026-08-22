import { GAME_H, GAME_W, TILE, Tile } from '../types'
import type { Biome, RenderContext } from '../types'
import { createSurface, type Surface } from '../art/pixel'
import type { ParallaxLayer, Tileset } from '../art'
import type { TileMap } from '../physics/TileMap'
import type { Camera } from '../engine/camera'
import type { Entity } from '../game/entities/Entity'
import type { ParticleSystem } from './particles'
import { PostFx, defaultPostFx, type PostFxSettings } from './postfx'
import { biomePalette } from '../art/palette'

export interface DrawArgs {
  map: TileMap
  tileset: Tileset
  background: ParallaxLayer[]
  entities: Entity[]
  camera: Camera
  particles: ParticleSystem
  biome: Biome
  time: number
  alpha: number
  /** Weather overlay to draw over the world but under post FX. */
  weather?: 'clear' | 'rain' | 'snow' | 'sand' | 'ash'
  /** 0 = noon, 1 = night. Drives the ambient tint. */
  timeOfDay?: number
}

/**
 * The frame compositor.
 *
 * Draws into a fixed 480x270 buffer and blits it to the visible canvas at an
 * integer scale, which is what keeps the pixel grid crisp on every display.
 * Layer order: sky parallax → background tiles → entities (depth sorted) →
 * foreground tiles → particles → weather → lighting → post FX.
 */
export class Renderer {
  readonly buffer: Surface
  private postfx = new PostFx()
  private lightBuffer: Surface
  /** Cached static tile render, rebuilt only when the map changes. */
  private tileCache: Surface | null = null
  private tileCacheVersion = -1
  private tileCacheKey = ''
  settings: PostFxSettings = defaultPostFx()
  /** Debug overlay: hitboxes and tile grid. */
  debug = false

  constructor(private canvas: HTMLCanvasElement) {
    this.buffer = createSurface(GAME_W, GAME_H)
    this.lightBuffer = createSurface(GAME_W, GAME_H)
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.imageSmoothingEnabled = false
    this.resize()
  }

  /** Fit the visible canvas to its container at the largest integer scale. */
  resize(): void {
    const parent = this.canvas.parentElement
    const availW = parent?.clientWidth ?? window.innerWidth
    const availH = parent?.clientHeight ?? window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const scale = Math.max(1, Math.min(availW / GAME_W, availH / GAME_H))
    // Integer scale above 1x keeps pixels square; below that, fit exactly.
    const useScale = scale >= 1 ? Math.floor(scale * 2) / 2 : scale
    const cssW = Math.round(GAME_W * useScale)
    const cssH = Math.round(GAME_H * useScale)
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    this.canvas.width = Math.round(cssW * dpr)
    this.canvas.height = Math.round(cssH * dpr)
    const ctx = this.canvas.getContext('2d')
    if (ctx) ctx.imageSmoothingEnabled = false
  }

  draw(a: DrawArgs): void {
    const ctx = this.buffer.ctx
    const cam = a.camera.renderOrigin()
    const rc: RenderContext = {
      ctx,
      camera: a.camera,
      time: a.time,
      alpha: a.alpha,
      width: GAME_W,
      height: GAME_H,
    }

    ctx.clearRect(0, 0, GAME_W, GAME_H)
    ctx.imageSmoothingEnabled = false

    this.drawParallax(ctx, a.background, cam.x, cam.y, a.time)
    this.drawTiles(ctx, a, cam.x, cam.y)

    ctx.save()
    ctx.translate(-cam.x, -cam.y)
    a.particles.draw(rc, true)

    const sorted = [...a.entities].filter((e) => e.active && !e.dead).sort((x, y) => x.depth - y.depth)
    for (const e of sorted) {
      const sx = Math.round(e.body.px + (e.body.x - e.body.px) * a.alpha)
      const sy = Math.round(e.body.py + (e.body.y - e.body.py) * a.alpha)
      e.draw(rc, sx, sy)
      if (this.debug) {
        const r = e.rect()
        ctx.strokeStyle = e.kind === 'player' ? '#4FD37A' : '#E23B3B'
        ctx.lineWidth = 1
        ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, r.w - 1, r.h - 1)
      }
    }

    a.particles.draw(rc, false)
    ctx.restore()

    if (a.weather && a.weather !== 'clear') this.drawWeather(ctx, a.weather, cam.x, cam.y, a.time)
    this.drawLighting(ctx, a)

    this.postfx.apply(ctx, this.buffer.canvas, this.settings)
    this.present()
  }

  /** Blit the buffer to the visible canvas. */
  private present(): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.buffer.canvas, 0, 0, this.canvas.width, this.canvas.height)
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
        const w = l.width
        let start = Math.floor(ox % w)
        if (start > 0) start -= w
        for (let x = start; x < GAME_W; x += w) {
          ctx.drawImage(l.image, Math.round(x), Math.round(oy + bob))
        }
      } else {
        ctx.drawImage(l.image, Math.round(ox), Math.round(oy + bob))
      }
      ctx.restore()
    }
  }

  /**
   * Tiles are rendered into a cache the size of the whole level and blitted
   * with a single `drawImage`. Levels are at most ~250x40 tiles, so the cache
   * costs a few MB and removes thousands of draw calls per frame.
   */
  private drawTiles(ctx: CanvasRenderingContext2D, a: DrawArgs, camX: number, camY: number): void {
    const key = `${a.biome}:${a.map.w}x${a.map.h}`
    if (!this.tileCache || this.tileCacheVersion !== a.map.version || this.tileCacheKey !== key) {
      this.tileCache = this.renderTileCache(a.map, a.tileset)
      this.tileCacheVersion = a.map.version
      this.tileCacheKey = key
    }
    ctx.drawImage(this.tileCache.canvas, -Math.round(camX), -Math.round(camY))
    // Water is animated, so it is drawn live on top of the static cache.
    this.drawWater(ctx, a, camX, camY)
  }

  private renderTileCache(map: TileMap, tileset: Tileset): Surface {
    const s = createSurface(map.pixelW, map.pixelH)
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const id = map.get(tx, ty)
        if (id === Tile.Empty || id === Tile.Water) continue
        const mask =
          (same(map, tx, ty, 0, -1) ? 1 : 0) |
          (same(map, tx, ty, 1, 0) ? 2 : 0) |
          (same(map, tx, ty, 0, 1) ? 4 : 0) |
          (same(map, tx, ty, -1, 0) ? 8 : 0)
        const variant = (tx * 7 + ty * 13) % tileset.variants
        const { sx, sy } = tileset.src(id, mask, variant)
        s.ctx.drawImage(tileset.image, sx, sy, TILE, TILE, tx * TILE, ty * TILE, TILE, TILE)
      }
    }
    return s
  }

  /** Animated water surface with a scrolling caustic band. */
  private drawWater(ctx: CanvasRenderingContext2D, a: DrawArgs, camX: number, camY: number): void {
    const map = a.map
    const x0 = Math.max(0, Math.floor(camX / TILE) - 1)
    const x1 = Math.min(map.w - 1, Math.ceil((camX + GAME_W) / TILE) + 1)
    const y0 = Math.max(0, Math.floor(camY / TILE) - 1)
    const y1 = Math.min(map.h - 1, Math.ceil((camY + GAME_H) / TILE) + 1)
    const p = biomePalette(a.biome)
    ctx.save()
    ctx.translate(-Math.round(camX), -Math.round(camY))
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (map.get(tx, ty) !== Tile.Water) continue
        const surface = map.get(tx, ty - 1) !== Tile.Water
        ctx.globalAlpha = 0.58
        ctx.fillStyle = p.accent
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE)
        ctx.globalAlpha = 0.3
        ctx.fillStyle = '#0A2A4A'
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE)
        if (surface) {
          const wob = Math.sin(a.time * 2.4 + tx * 0.7) * 1.5
          ctx.globalAlpha = 0.9
          ctx.fillStyle = '#CFF0F7'
          ctx.fillRect(tx * TILE, ty * TILE + wob, TILE, 1)
        }
        // Caustic ripples.
        ctx.globalAlpha = 0.16
        ctx.fillStyle = '#CFF0F7'
        const cx = ((a.time * 14 + tx * 9 + ty * 5) % TILE) - TILE / 2
        ctx.fillRect(tx * TILE + cx + 6, ty * TILE + 6, 4, 1)
      }
    }
    ctx.restore()
  }

  private drawWeather(
    ctx: CanvasRenderingContext2D,
    weather: NonNullable<DrawArgs['weather']>,
    camX: number,
    camY: number,
    time: number,
  ): void {
    ctx.save()
    switch (weather) {
      case 'rain': {
        ctx.strokeStyle = 'rgba(190,230,245,0.55)'
        ctx.lineWidth = 1
        for (let i = 0; i < 90; i++) {
          const seed = i * 97.3
          const x = ((seed * 13 + time * 260) % (GAME_W + 60)) - 30 - camX * 0.2
          const y = ((seed * 29 + time * 620) % (GAME_H + 40)) - 20
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x - 3, y + 10)
          ctx.stroke()
        }
        break
      }
      case 'snow': {
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        for (let i = 0; i < 70; i++) {
          const seed = i * 61.7
          const x = ((seed * 17 + time * 22 + Math.sin(time + i) * 12) % (GAME_W + 40)) - 20 - camX * 0.15
          const y = ((seed * 37 + time * 46) % (GAME_H + 30)) - 15
          ctx.fillRect(Math.round(x), Math.round(y), 2, 2)
        }
        break
      }
      case 'sand': {
        ctx.globalAlpha = 0.22
        ctx.fillStyle = '#E7CE9B'
        for (let i = 0; i < 44; i++) {
          const seed = i * 53.1
          const x = ((seed * 23 + time * 420) % (GAME_W + 120)) - 60
          const y = (seed * 41) % GAME_H
          ctx.fillRect(Math.round(x), Math.round(y), 14, 1)
        }
        break
      }
      case 'ash': {
        ctx.fillStyle = 'rgba(255,150,110,0.7)'
        for (let i = 0; i < 46; i++) {
          const seed = i * 71.3
          const x = ((seed * 19 + Math.sin(time * 0.6 + i) * 20) % (GAME_W + 30)) - 15 - camX * 0.1
          const y = GAME_H - ((seed * 31 + time * 34) % (GAME_H + 40))
          ctx.fillRect(Math.round(x), Math.round(y), 2, 2)
        }
        break
      }
    }
    ctx.restore()
    void camY
  }

  /** Ambient tint + a warm pool of light around the player-ish centre. */
  private drawLighting(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
    const night = a.timeOfDay ?? 0
    if (night <= 0.01) return
    const l = this.lightBuffer
    l.ctx.globalCompositeOperation = 'source-over'
    l.ctx.fillStyle = `rgba(8,14,38,${0.62 * night})`
    l.ctx.fillRect(0, 0, GAME_W, GAME_H)
    l.ctx.globalCompositeOperation = 'destination-out'
    const g = l.ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, 8, GAME_W / 2, GAME_H / 2, 130)
    g.addColorStop(0, 'rgba(0,0,0,0.9)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    l.ctx.fillStyle = g
    l.ctx.fillRect(0, 0, GAME_W, GAME_H)
    l.ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(l.canvas, 0, 0)
    l.ctx.clearRect(0, 0, GAME_W, GAME_H)
  }
}

function same(map: TileMap, tx: number, ty: number, dx: number, dy: number): boolean {
  return map.get(tx + dx, ty + dy) === map.get(tx, ty)
}
