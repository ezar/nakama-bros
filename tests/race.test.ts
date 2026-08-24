import { describe, expect, it, vi } from 'vitest'
import { RaceSession, type PeerLike } from '../src/net/session'
import type { PeerHandlers } from '../src/net/peer'
import { PROTOCOL_VERSION, type Control, type NetPose } from '../src/net/protocol'

/**
 * The rules of a race, without a network under them.
 *
 * Every one of these is quiet when it breaks. A version mismatch does not
 * throw, it starts the two stages at different moments. A pose arriving out of
 * order does not throw, it walks the other player backwards. A countdown that
 * only one side begins looks, to that side, exactly like a game that hung.
 * None of it is visible without going and asking.
 */

/** Stands in for the connection, and records what the session said down it. */
function fakePeer() {
  let handlers: PeerHandlers = {}
  const sent: Control[] = []
  const poses: NetPose[] = []
  const peer: PeerLike = {
    status: 'open',
    send: (m) => sent.push(m),
    sendPose: (p) => poses.push(p),
    close: () => undefined,
  }
  return {
    sent,
    poses,
    make: (h: PeerHandlers) => {
      handlers = h
      return peer
    },
    open: () => handlers.onState?.('open'),
    drop: () => handlers.onState?.('closed'),
    say: (m: Control) => handlers.onControl?.(m),
    move: (p: NetPose) => handlers.onPose?.(p),
  }
}

const hello = (name = 'Leyre'): Control =>
  ({ t: 'hello', v: PROTOCOL_VERSION, name, crew: 'zoro' })

const paired = (isHost = true) => {
  const wire = fakePeer()
  const session = new RaceSession(isHost, { name: 'Luca', crew: 'luffy' }, wire.make)
  wire.open()
  wire.say(hello())
  return { session, wire }
}

describe('getting to the start line', () => {
  it('greets the other side the moment the link opens', () => {
    const wire = fakePeer()
    const session = new RaceSession(true, { name: 'Luca', crew: 'luffy' }, wire.make)
    expect(session.snapshot().phase).toBe('signalling')
    wire.open()
    expect(wire.sent.map((m) => m.t)).toEqual(['hello', 'ping'])
  })

  it('reaches the lobby once the other side has said who it is', () => {
    const { session } = paired()
    expect(session.snapshot().phase).toBe('lobby')
    expect(session.snapshot().opponent).toMatchObject({ name: 'Leyre', crew: 'zoro' })
  })

  it('ends the race rather than half-understanding an older build', () => {
    // The failure this prevents is not a crash. Two builds that disagree about
    // the messages still connect, still show a lobby, and then start at
    // different moments — which nobody would read as a version problem.
    const wire = fakePeer()
    const session = new RaceSession(true, { name: 'Luca', crew: 'luffy' }, wire.make)
    wire.open()
    wire.say({ t: 'hello', v: PROTOCOL_VERSION + 1, name: 'Leyre', crew: 'zoro' })
    expect(session.snapshot().phase).toBe('lost')
  })

  it('answers a ping so the other side can time the link', () => {
    const { wire } = paired()
    wire.say({ t: 'ping', at: 1234 })
    expect(wire.sent).toContainEqual({ t: 'pong', at: 1234 })
  })

  it('only the host names the stage', () => {
    const host = paired(true)
    host.session.setLevel('wano-2')
    expect(host.wire.sent).toContainEqual({ t: 'stage', level: 'wano-2' })
    expect(host.session.snapshot().levelId).toBe('wano-2')

    const guest = paired(false)
    guest.session.setLevel('wano-3')
    expect(guest.wire.sent.some((m) => m.t === 'stage')).toBe(false)
    // ...and takes whichever the host chose.
    guest.wire.say({ t: 'stage', level: 'skypiea-1' })
    expect(guest.session.snapshot().levelId).toBe('skypiea-1')
  })

  it('only the host starts, and only from the lobby', () => {
    const guest = paired(false)
    guest.session.start()
    expect(guest.wire.sent.some((m) => m.t === 'go')).toBe(false)

    const host = paired(true)
    host.session.start() // no stage chosen yet
    expect(host.wire.sent.some((m) => m.t === 'go')).toBe(false)
    host.session.setLevel('east-blue-1')
    host.session.start()
    expect(host.wire.sent).toContainEqual({ t: 'go', inMs: expect.any(Number) })
    expect(host.session.snapshot().phase).toBe('countdown')
  })

  it('a guest counts down when told to', () => {
    const { session, wire } = paired(false)
    wire.say({ t: 'go', inMs: 3200 })
    expect(session.snapshot().phase).toBe('countdown')
    expect(session.snapshot().startsInMs).toBeGreaterThan(3000)
    expect(session.started).toBe(false)
  })

  it('lets go once the countdown has run out', () => {
    vi.useFakeTimers()
    try {
      const { session, wire } = paired(false)
      wire.say({ t: 'go', inMs: 200 })
      expect(session.started).toBe(false)
      vi.advanceTimersByTime(400)
      expect(session.started).toBe(true)
      expect(session.snapshot().phase).toBe('racing')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('while racing', () => {
  const racing = () => {
    vi.useFakeTimers()
    const { session, wire } = paired(false)
    wire.say({ t: 'go', inMs: 0 })
    expect(session.started).toBe(true)
    wire.sent.length = 0
    return { session, wire }
  }

  it('sends poses at the wire rate, not at the frame rate', () => {
    try {
      const { session, wire } = racing()
      const body = { x: 100, y: 180, facing: 1 as const, anim: 'run' }
      // A second of sixty-hertz steps.
      for (let i = 0; i < 60; i++) session.publish(1 / 60, body, i * 16.6)
      expect(wire.poses.length).toBe(15)
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops a pose that arrived after a newer one', () => {
    // Normal on an unreliable channel, and the reason each pose carries the
    // sender's own clock: applying the older one walks the body backwards.
    try {
      const { session, wire } = racing()
      wire.move({ x: 300, y: 180, facing: 1, anim: 'run', at: 2000 })
      wire.move({ x: 120, y: 180, facing: 1, anim: 'run', at: 900 })
      expect(session.opponentPose()?.x).toBe(300)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops drawing an opponent that has gone quiet', () => {
    try {
      const { session, wire } = racing()
      wire.move({ x: 300, y: 180, facing: 1, anim: 'run', at: 2000 })
      expect(session.opponentPose()).not.toBeNull()
      vi.advanceTimersByTime(2500)
      // A body frozen mid-stride reads as a broken game; an absent one reads
      // as somebody whose phone locked, which is what has happened.
      expect(session.opponentPose()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('tells the other side the time it finished on', () => {
    try {
      const { session, wire } = racing()
      session.finish(41.25)
      expect(wire.sent).toContainEqual({ t: 'done', seconds: 41.25 })
      expect(session.snapshot().mySeconds).toBe(41.25)
      expect(session.snapshot().phase).toBe('finished')
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes their time whether it lands before or after yours', () => {
    try {
      const { session, wire } = racing()
      wire.say({ t: 'done', seconds: 38.9 })
      expect(session.snapshot().opponent?.seconds).toBe(38.9)
      session.finish(41.25)
      expect(session.snapshot().opponent?.seconds).toBe(38.9)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not end the race when the link drops mid-stage', () => {
    // Finishing alone beats being thrown out of a stage that is still running.
    // The other body simply stops, which says what happened without a dialog.
    try {
      const { session, wire } = racing()
      wire.drop()
      expect(session.snapshot().phase).toBe('racing')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does end it when the link drops before anyone has started', () => {
    const { session, wire } = paired()
    wire.drop()
    expect(session.snapshot().phase).toBe('lost')
  })

  it('marks somebody who walked away rather than leaving a time pending', () => {
    try {
      const { session, wire } = racing()
      wire.say({ t: 'gaveUp' })
      expect(session.snapshot().opponent?.gaveUp).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
