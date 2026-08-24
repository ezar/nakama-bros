/**
 * Bytes to text and back, and a check that says whether they survived.
 *
 * Shared by the challenge codes and the connection handshake because both do
 * the same thing for the same reason: move a blob through an application that
 * was built to carry sentences, and be able to tell afterwards whether all of
 * it arrived.
 */

/** base64url. Same alphabet the ghost tracks use, so codes look of a piece. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const INDEX = new Map([...B64].map((c, i) => [c, i]))

export function b64Bytes(bytes: number[]): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2]
    out += B64[a >> 2]
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)]
    if (b === undefined) break
    out += B64[((b & 15) << 2) | ((c ?? 0) >> 6)]
    if (c === undefined) break
    out += B64[c & 63]
  }
  return out
}

/** Null when the text holds a character that is not in the alphabet. */
export function bytesFromB64(s: string): number[] | null {
  const bytes: number[] = []
  let acc = 0
  let bits = 0
  for (const ch of s) {
    const v = INDEX.get(ch)
    if (v === undefined) return null
    acc = ((acc << 6) | v) & 0xffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((acc >> bits) & 0xff)
    }
  }
  return bytes
}

/**
 * FNV-1a, folded to sixteen bits.
 *
 * Not a security measure — nobody is attacking a code passed between two
 * phones on a sofa. It is here to catch a code that arrived damaged, which is
 * the failure that actually happens, and which otherwise shows up much later
 * as something that simply does not work.
 */
export function checksum16(bytes: number[]): number {
  let h = 0x811c9dc5
  for (const b of bytes) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return ((h >>> 16) ^ h) & 0xffff
}
