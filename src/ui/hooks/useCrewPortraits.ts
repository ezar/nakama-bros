import { useEffect, useRef, useState } from 'react'
import type { CrewId } from '../../types'
import { CREW_IDS } from '../../game/config'

/**
 * The crew's bust shots, built once and lazily: they cost a canvas each.
 *
 * Shared by the crew-select wall and the credits roster so both are looking at
 * the same art the game itself bakes — a hand-laid likeness in the credits
 * would be free to drift away from the character you actually play.
 */
export function useCrewPortraits(): Partial<Record<CrewId, string>> {
  const [urls, setUrls] = useState<Partial<Record<CrewId, string>>>({})
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    let cancelled = false
    void (async () => {
      try {
        const mod = (await import('../../art/characters')) as {
          buildCrewPortraits?: () => Record<CrewId, HTMLCanvasElement>
        }
        if (!mod.buildCrewPortraits || cancelled) return
        const built = mod.buildCrewPortraits()
        const out: Partial<Record<CrewId, string>> = {}
        for (const id of CREW_IDS) out[id] = built[id]?.toDataURL()
        if (!cancelled) setUrls(out)
      } catch {
        // No portraits in the art layer: callers keep their empty window and
        // the crew mark, which is a design the wall can live with.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return urls
}
