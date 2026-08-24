import { describe, expect, it } from 'vitest'
import { GHOST_HZ, GHOST_MIN_POSES, GhostRecorder, decodeGhost } from '../src/game/ghost'
import { NAME_MAX, decodeChallenge, encodeChallenge } from '../src/game/ghostCode'
import { challengeUrl, codeFromUrl } from '../src/game/challengeLink'
import type { CrewId } from '../src/types'

/**
 * The challenge code.
 *
 * Everything here is about the same failure: a code is a long opaque string
 * that a person moves between two phones by hand, and every way it can arrive
 * wrong produces something that still *looks* decodable. A truncated code is a
 * shorter run. A code from an older build is a run in the wrong pose. Neither
 * throws, so neither is visible without a test that goes looking.
 */

/** A run of `n` poses that moves the way a player actually moves. */
const run = (n: number, crew: CrewId = 'luffy') => {
  const r = new GhostRecorder()
  let x = 40
  let y = 180
  for (let i = 0; i < n; i++) {
    x += 14
    y = 180 - Math.round(20 * Math.sin(i / 6))
    r.sample(1 / GHOST_HZ, { x, y, facing: 1, anim: i % 12 < 6 ? 'run' : 'jump' })
  }
  return r.finish(crew)!
}

const challenge = (n = 60, name = 'Luca') => ({
  levelId: 'east-blue-2',
  name,
  track: run(n),
})

describe('challenge code', () => {
  it('round-trips a run pose for pose', () => {
    const sent = challenge()
    const code = encodeChallenge(sent)!
    expect(code).toMatch(/^NB1[A-Za-z0-9\-_]+$/)
    const got = decodeChallenge(code)!
    expect(got.levelId).toBe('east-blue-2')
    expect(got.name).toBe('Luca')
    expect(got.track.crew).toBe('luffy')
    expect(got.track.time).toBeCloseTo(sent.track.time, 2)
    expect(decodeGhost(got.track)).toEqual(decodeGhost(sent.track))
  })

  it('survives a respawn, which no delta could carry', () => {
    // The pose after a death is a jump of the whole distance back to the
    // checkpoint. The encoder has to notice and fall back to an absolute.
    const r = new GhostRecorder()
    for (const [x, y] of [[3900, 190], [3914, 188], [180, 300], [194, 298]] as const) {
      r.sample(1 / GHOST_HZ, { x, y, facing: 1, anim: 'run' })
    }
    for (let i = 0; i < GHOST_MIN_POSES; i++) r.sample(1 / GHOST_HZ, { x: 200 + i, y: 298, facing: 1, anim: 'run' })
    const track = r.finish('nami')!
    const got = decodeChallenge(encodeChallenge({ levelId: 'wano-1', name: 'x', track })!)!
    expect(decodeGhost(got.track).map((p) => p.x).slice(0, 4)).toEqual([3900, 3914, 180, 194])
  })

  it('keeps a name with accents in it', () => {
    const got = decodeChallenge(encodeChallenge(challenge(40, 'César'))!)!
    expect(got.name).toBe('César')
  })

  it('caps a name that would not fit the header', () => {
    const long = 'A'.repeat(200)
    const got = decodeChallenge(encodeChallenge(challenge(40, long))!)!
    expect(got.name.length).toBeLessThanOrEqual(NAME_MAX)
  })

  it('refuses a code that arrived truncated', () => {
    // The failure a chat app actually causes, and the reason for the checksum:
    // without it this decodes into a rival who stops half way and a time that
    // does not match what the sender saw.
    const code = encodeChallenge(challenge(120))!
    for (const cut of [1, 4, 30, Math.floor(code.length / 2)]) {
      expect(decodeChallenge(code.slice(0, code.length - cut))).toBeNull()
    }
  })

  it('refuses a code with a character changed', () => {
    const code = encodeChallenge(challenge(80))!
    const at = Math.floor(code.length / 2)
    const swapped = code.slice(0, at) + (code[at] === 'A' ? 'B' : 'A') + code.slice(at + 1)
    expect(decodeChallenge(swapped)).toBeNull()
  })

  it('refuses anything that is not a code at all', () => {
    for (const junk of ['', 'hola', 'NB1', 'NB1!!!!', 'NB2AAAAAAAAAAAA', '   ']) {
      expect(decodeChallenge(junk)).toBeNull()
    }
  })

  it('finds the code inside whatever it was pasted with', () => {
    // What actually gets pasted is a whole chat message, or a link with the
    // code in its hash, or something a mail client wrapped over two lines.
    const code = encodeChallenge(challenge())!
    const mid = Math.floor(code.length / 2)
    for (const wrapper of [
      `¡Te reto! https://ezar.github.io/nakama-bros/#r=${code}`,
      `mira esto:\n${code}\n\nvenga`,
      code.slice(0, mid) + '\n' + code.slice(mid),
    ]) {
      expect(decodeChallenge(wrapper)?.levelId).toBe('east-blue-2')
    }
  })

  it('refuses a run too short to be a race', () => {
    expect(encodeChallenge(challenge(GHOST_MIN_POSES - 1))).toBeNull()
  })

  it('refuses a crew the build does not have', () => {
    const track = { ...run(40), crew: 'shanks' as CrewId }
    expect(encodeChallenge({ levelId: 'wano-1', name: 'x', track })).toBeNull()
  })

  it('spends almost nothing on running along flat ground', () => {
    /*
      Where the format's saving actually comes from, and the reason it is
      worth asserting on its own: a pose at the same height as the last one
      carries no vertical field at all. Two runs of identical length, one
      flat and one over rolling ground, and the flat one has to come out
      distinctly smaller — if it ever stops doing so the cheap class has been
      broken by a change somewhere and nothing else here would notice.
    */
    const build = (heightAt: (i: number) => number) => {
      const r = new GhostRecorder()
      for (let i = 0; i < 600; i++) {
        r.sample(1 / GHOST_HZ, { x: 40 + i * 14, y: heightAt(i), facing: 1, anim: 'run' })
      }
      return encodeChallenge({ levelId: 'east-blue-1', name: 'x', track: r.finish('luffy')! })!
    }
    const flat = build(() => 180)
    const rolling = build((i) => 180 - Math.round(20 * Math.sin(i / 4)))
    expect(flat.length).toBeLessThan(rolling.length * 0.75)
  })

  it('packs a long run down to something sendable', () => {
    // The whole reason for a second format. A ninety-second run stored as-is
    // is five and a half thousand characters; packed it is about three
    // thousand, which is a link that browsers and chat apps carry without
    // complaint. Both numbers are asserted, because the one that matters to
    // the player is the absolute size and the one that catches a regression
    // in the packing is the ratio.
    const track = run(90 * GHOST_HZ)
    const code = encodeChallenge({ levelId: 'thriller-bark-3', name: 'Leyre', track })!
    expect(code.length).toBeLessThan(4000)
    expect(code.length).toBeLessThan(track.data.length * 0.65)
  })
})

describe('challenge links', () => {
  it('builds a link with exactly one hash on it', () => {
    const url = challengeUrl('NB1abc', 'https://ezar.github.io', '/nakama-bros/')
    expect(url).toBe('https://ezar.github.io/nakama-bros/#r=NB1abc')
    expect(url.split('#')).toHaveLength(2)
  })

  it('does not care whether the base path had a trailing slash', () => {
    expect(challengeUrl('X', 'https://e.dev', '/g')).toBe('https://e.dev/g/#r=X')
    expect(challengeUrl('X', 'https://e.dev', '/g/')).toBe('https://e.dev/g/#r=X')
  })

  it('reads the code back out of a link', () => {
    const code = encodeChallenge(challenge())!
    const url = challengeUrl(code, 'https://ezar.github.io', '/nakama-bros/')
    expect(decodeChallenge(codeFromUrl(url)!)?.name).toBe('Luca')
  })

  it('finds the code among whatever else the hash is carrying', () => {
    expect(codeFromUrl('https://e.dev/#a=1&r=NB1xyz')).toBe('NB1xyz')
    expect(codeFromUrl('https://e.dev/#/r=NB1xyz')).toBe('NB1xyz')
  })

  it('is null when there is no challenge in the link', () => {
    for (const url of ['https://e.dev/', 'https://e.dev/#', 'https://e.dev/#other=1', 'https://e.dev/#r']) {
      expect(codeFromUrl(url)).toBeNull()
    }
  })
})

describe('a challenge arriving at a game that is already open', () => {
  it('is still found once the address bar has changed under it', () => {
    // The case that was silently dropped: a link opened while the game runs
    // does not reload it. Nothing here reads `location` — that is the browser
    // half — but the parsing this depends on has to hold for a bare hash too.
    const code = encodeChallenge(challenge())!
    expect(codeFromUrl(`https://ezar.github.io/nakama-bros/#r=${code}`)).toBe(code)
    expect(decodeChallenge(codeFromUrl(`#r=${code}`)!)?.name).toBe('Luca')
  })

  it('rebuilds the same code from a rival that was already saved', () => {
    /*
      What the "copy the code" button on the invite screen does.

      By the time it is pressed the address bar has been cleared — that is what
      stops a reload re-offering the same challenge — so the code has to be
      made again from the stored rival. It must come out identical, or the
      challenge that gets carried to the installed app is a different one.
    */
    const sent = challenge(80, 'Leyre')
    const code = encodeChallenge(sent)!
    const got = decodeChallenge(code)!
    const again = encodeChallenge({ levelId: got.levelId, name: got.name, track: got.track })
    expect(again).toBe(code)
  })
})
