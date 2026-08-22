/** Minimal typed pub/sub. Systems talk through this rather than importing each other. */
export type Listener<T> = (payload: T) => void

export class EventBus<Events extends object> {
  private map = new Map<keyof Events, Set<Listener<never>>>()

  on<K extends keyof Events>(key: K, fn: Listener<Events[K]>): () => void {
    let set = this.map.get(key)
    if (!set) {
      set = new Set()
      this.map.set(key, set)
    }
    set.add(fn as Listener<never>)
    return () => {
      set!.delete(fn as Listener<never>)
    }
  }

  emit<K extends keyof Events>(key: K, payload: Events[K]): void {
    const set = this.map.get(key)
    if (!set) return
    for (const fn of set) (fn as Listener<Events[K]>)(payload)
  }

  clear(): void {
    this.map.clear()
  }
}

/** Events the game emits. UI, audio and VFX subscribe; nothing else may. */
export interface GameEvents {
  'player:jump': { x: number; y: number; double: boolean }
  'player:land': { x: number; y: number; speed: number }
  'player:hurt': { x: number; y: number }
  'player:die': { x: number; y: number }
  'player:power': { tier: string; x: number; y: number }
  'player:attack': { x: number; y: number; facing: number }
  'enemy:defeat': { x: number; y: number; type: string; points: number }
  'coin:collect': { x: number; y: number; value: number }
  'tile:break': { tx: number; ty: number }
  'tile:bump': { tx: number; ty: number }
  'boss:hit': { x: number; y: number; healthLeft: number }
  'boss:phase': { phase: number }
  'boss:defeat': { x: number; y: number }
  'level:checkpoint': { x: number; y: number }
  'level:clear': { timeLeft: number }
  'camera:shake': { amount: number }
  'hitstop': { frames: number }
}
