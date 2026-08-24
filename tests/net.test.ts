import { describe, expect, it } from 'vitest'
import { b64Bytes, bytesFromB64, checksum16 } from '../src/engine/bytes'
import { decodeSignal, encodeSignal, signalKind } from '../src/net/signalCode'
import { packPose, readControl, unpackPose, type NetPose } from '../src/net/protocol'

/**
 * The parts of the live race that are just data.
 *
 * Everything here is read from another device. Not a hostile one — it is a
 * sibling's phone across the room — but "not hostile" is a different property
 * from "correct", and the failures that matter are the quiet ones: a pose
 * whose bits shifted puts a body somewhere impossible, and a stage id that is
 * not a stage is handed to the level loader in the middle of starting one.
 */

const SDP = [
  'v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
  'a=group:BUNDLE 0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'a=ice-ufrag:4ZcD', 'a=ice-pwd:2/1muCWoOi3uLifh0NuRHlsw',
  'a=fingerprint:sha-256 4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B',
  'a=setup:actpass', 'a=sctp-port:5000',
].join('\r\n')

describe('handshake codes', () => {
  it('round-trips a session description', () => {
    const code = encodeSignal('offer', SDP)
    expect(code.startsWith('NBH')).toBe(true)
    expect(decodeSignal('offer', code)).toBe(SDP)
  })

  it('will not read an answer as an offer', () => {
    // The mistake a person actually makes: pasting the code they were sent
    // into the box they used last time. Caught by looking at it, before it
    // reaches the connection — which reports this, if at all, as a link that
    // simply never comes up.
    const answer = encodeSignal('answer', SDP)
    expect(decodeSignal('offer', answer)).toBeNull()
    expect(signalKind(answer)).toBe('answer')
    expect(signalKind(encodeSignal('offer', SDP))).toBe('offer')
    expect(signalKind('hola')).toBeNull()
  })

  it('refuses a code that arrived cut short', () => {
    const code = encodeSignal('offer', SDP)
    for (const cut of [1, 3, 20, Math.floor(code.length / 2)]) {
      expect(decodeSignal('offer', code.slice(0, code.length - cut))).toBeNull()
    }
  })

  it('refuses a code with a character changed', () => {
    const code = encodeSignal('offer', SDP)
    const at = Math.floor(code.length / 2)
    expect(decodeSignal('offer', code.slice(0, at) + (code[at] === 'A' ? 'B' : 'A') + code.slice(at + 1)))
      .toBeNull()
  })

  it('finds the code inside the message it was pasted with', () => {
    const code = encodeSignal('offer', SDP)
    const mid = Math.floor(code.length / 2)
    expect(decodeSignal('offer', `¡corre! ${code}`)).toBe(SDP)
    expect(decodeSignal('offer', code.slice(0, mid) + '\n' + code.slice(mid))).toBe(SDP)
  })

  it('refuses something that checksums but is not a description', () => {
    // A code from a future version of this game, or from a different one.
    const junk = [...new TextEncoder().encode('hello there')]
    const sum = checksum16(junk)
    const fake = 'NBH' + b64Bytes([...junk, (sum >> 8) & 0xff, sum & 0xff])
    expect(decodeSignal('offer', fake)).toBeNull()
  })

  it('refuses anything that is not a code at all', () => {
    for (const junk of ['', 'NBH', 'NBH!!!', 'hola', '   ']) {
      expect(decodeSignal('offer', junk)).toBeNull()
    }
  })
})

describe('a pose on the wire', () => {
  const pose: NetPose = { x: 1234, y: 200, facing: -1, anim: 'jump', at: 45_678 }

  it('round-trips exactly', () => {
    expect(unpackPose(packPose(pose))).toEqual(pose)
  })

  it('carries a body above the top of the map', () => {
    // The bias exists for this: a launch off a spring puts the body at a
    // negative y, and without it the position wraps to the bottom of the stage.
    expect(unpackPose(packPose({ ...pose, y: -120 }))?.y).toBe(-120)
  })

  it('refuses a datagram that is not exactly one pose', () => {
    // The reason a pose is a fixed-width record. Over an unreliable channel a
    // short read must be a drop, never a body placed somewhere impossible.
    for (const n of [0, 4, 7, 9, 16]) expect(unpackPose(new ArrayBuffer(n))).toBeNull()
  })

  it('keeps an animation it does not know as a standing pose', () => {
    // A signature move added in a later version. Slightly wrong for a moment
    // beats a lookup that lands on undefined mid-frame.
    expect(unpackPose(packPose({ ...pose, anim: 'gear-five' }))?.anim).toBe('idle')
  })
})

describe('a control message', () => {
  it('reads the ones it should', () => {
    expect(readControl(JSON.stringify({ t: 'go', inMs: 3000 }))).toEqual({ t: 'go', inMs: 3000 })
    expect(readControl(JSON.stringify({ t: 'gaveUp' }))).toEqual({ t: 'gaveUp' })
    expect(readControl(JSON.stringify({ t: 'done', seconds: 41.2 }))).toEqual({ t: 'done', seconds: 41.2 })
  })

  it('drops anything malformed instead of throwing', () => {
    // This runs on whatever arrives on the channel. An exception here happens
    // inside an event handler during a race, where nothing is going to catch it.
    for (const junk of [
      'not json', '', '[]', 'null', '42',
      JSON.stringify({ t: 'nope' }),
      JSON.stringify({ t: 'go' }),
      JSON.stringify({ t: 'go', inMs: 'soon' }),
      JSON.stringify({ t: 'done', seconds: NaN }),
      JSON.stringify({ t: 'hello', v: 1, name: 'x' }),
    ]) {
      expect(readControl(junk), junk).toBeNull()
    }
    expect(readControl(new ArrayBuffer(8))).toBeNull()
  })

  it('will not let the far side name a stage that could not be one', () => {
    expect(readControl(JSON.stringify({ t: 'stage', level: '' }))).toBeNull()
    expect(readControl(JSON.stringify({ t: 'stage', level: 'x'.repeat(200) }))).toBeNull()
    expect(readControl(JSON.stringify({ t: 'stage', level: 'wano-2' }))).toEqual({ t: 'stage', level: 'wano-2' })
  })

  it('will not let a countdown run away', () => {
    // Clamped rather than refused: a nonsense delay is still a request to
    // start, and the sane response is to start soon rather than not at all.
    expect(readControl(JSON.stringify({ t: 'go', inMs: 9e9 }))).toEqual({ t: 'go', inMs: 10_000 })
    expect(readControl(JSON.stringify({ t: 'go', inMs: -5 }))).toEqual({ t: 'go', inMs: 0 })
  })
})

describe('bytes', () => {
  it('round-trips every byte value', () => {
    const all = Array.from({ length: 256 }, (_, i) => i)
    expect(bytesFromB64(b64Bytes(all))).toEqual(all)
  })

  it('round-trips lengths either side of a base64 group', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const bytes = Array.from({ length: n }, (_, i) => (i * 37) & 0xff)
      expect(bytesFromB64(b64Bytes(bytes)), `${n} bytes`).toEqual(bytes)
    }
  })

  it('rejects text outside the alphabet', () => {
    expect(bytesFromB64('abc!')).toBeNull()
    expect(bytesFromB64('a b')).toBeNull()
  })
})
