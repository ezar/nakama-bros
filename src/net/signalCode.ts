/**
 * The handshake, as something a person can send to another person.
 *
 * Two browsers cannot find each other on their own. WebRTC needs each side to
 * see the other's session description first, and the usual answer is a
 * signalling server — which this game does not have and is not going to get.
 * So the descriptions travel the same way a challenge does: as a code, by
 * whatever the two of them already use to send each other things.
 *
 * It costs two messages instead of one — an offer out and an answer back —
 * because that is what the protocol requires, not because of how this is
 * built. There is no arrangement of one message that works.
 *
 * ## Why the codes are small
 *
 * A session description for audio and video runs to kilobytes, most of it
 * codec negotiation. This one carries a single data channel and nothing else,
 * which measures around 590 characters — smaller than a challenge code. That
 * is worth knowing, because it means the handshake stays inside what a chat
 * app will carry in one piece.
 */

import { b64Bytes, bytesFromB64, checksum16 } from '../engine/bytes'

const OFFER = 'NBH'
const ANSWER = 'NBJ'

/** What a peer needs from the other side to finish connecting. */
export type SignalKind = 'offer' | 'answer'

const PREFIX: Record<SignalKind, string> = { offer: OFFER, answer: ANSWER }

/**
 * Wrap a session description in a code.
 *
 * The kind is in the prefix rather than in the payload so that pasting an
 * offer where an answer belongs can be refused by looking at it, before any
 * of it is fed to `RTCPeerConnection` — which reports the mistake, if at all,
 * as a connection that never opens.
 */
export function encodeSignal(kind: SignalKind, sdp: string): string {
  const body = [...new TextEncoder().encode(sdp)]
  const sum = checksum16(body)
  return PREFIX[kind] + b64Bytes([...body, (sum >> 8) & 0xff, sum & 0xff])
}

/**
 * Read a code back, or null.
 *
 * Same tolerance as a challenge code: what gets pasted is a whole message, or
 * a code a mail client wrapped over two lines. Everything that is not a code
 * character is dropped, and the checksum decides whether what is left is
 * intact — a truncated description does not fail loudly on its own, it just
 * produces a connection that never comes up, with nothing on screen to say why.
 */
export function decodeSignal(kind: SignalKind, code: string): string | null {
  const start = code.indexOf(PREFIX[kind])
  if (start < 0) return null
  const raw = code.slice(start + PREFIX[kind].length).replace(/[^A-Za-z0-9\-_]/g, '')
  const bytes = bytesFromB64(raw)
  if (!bytes || bytes.length < 4) return null
  const sum = ((bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1]) & 0xffff
  const body = bytes.slice(0, -2)
  if (checksum16(body) !== sum) return null
  const sdp = new TextDecoder().decode(Uint8Array.from(body))
  // Cheapest possible sanity check on the far side of the checksum: every
  // session description starts with a version line. A code that passes the
  // checksum but is not an SDP came from a future version of this game.
  return sdp.startsWith('v=') ? sdp : null
}

/** Which kind of code this is, if it is one. For telling a paste apart. */
export function signalKind(code: string): SignalKind | null {
  if (code.includes(OFFER)) return 'offer'
  if (code.includes(ANSWER)) return 'answer'
  return null
}
