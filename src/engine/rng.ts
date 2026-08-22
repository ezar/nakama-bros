/**
 * Deterministic RNG (mulberry32). Every visual system that wants "random"
 * detail seeds one of these so a given level always draws identically.
 */
export class Rng {
  private s: number

  constructor(seed = 0x1a2b3c4d) {
    this.s = seed >>> 0
  }

  /** 0..1 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo)
  }

  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1))
  }

  bool(p = 0.5): boolean {
    return this.next() < p
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }

  /** Random unit vector. */
  dir(): { x: number; y: number } {
    const a = this.next() * Math.PI * 2
    return { x: Math.cos(a), y: Math.sin(a) }
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
}

/** Hash a string into a 32-bit seed, so `seedFrom('wano-1')` is stable. */
export function seedFrom(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
