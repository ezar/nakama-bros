import { decodeSignal, encodeSignal } from './signalCode'
import { packPose, readControl, unpackPose, type Control, type NetPose } from './protocol'

/**
 * One connection to the other player.
 *
 * A thin wrapper over `RTCPeerConnection` that hides everything the rest of
 * the game should not have to know: that there are two channels, that one of
 * them drops messages on purpose, and that the whole thing starts with two
 * codes being carried between two devices by hand.
 *
 * ## Why there is no server and what that costs
 *
 * WebRTC needs each side to see the other's session description before it can
 * connect, and normally a signalling server passes those along. This game has
 * no server and is not getting one, so the descriptions travel as codes the
 * players send each other — which is exactly what a challenge already does,
 * with the same alphabet and the same checksum.
 *
 * The cost is that it takes two messages rather than one: an offer out and an
 * answer back. That is the protocol, not the design; there is no arrangement
 * of one message that connects two peers.
 *
 * ## What can stop this working
 *
 * Both devices have to be able to send packets to each other. On a home
 * network they usually can. On a guest network, or one with client isolation
 * switched on, they cannot — the router is built to keep them apart, and
 * nothing on this side can talk it round. That failure looks exactly like a
 * connection that never opens, so `onState` reports `failed` rather than
 * leaving a screen waiting forever.
 */

export type PeerState = 'new' | 'signalling' | 'connecting' | 'open' | 'closed' | 'failed'

export interface PeerHandlers {
  onState?: (state: PeerState) => void
  onControl?: (msg: Control) => void
  onPose?: (pose: NetPose) => void
}

/**
 * How long to keep collecting addresses after the first one turns up.
 *
 * The obvious wait here is for gathering to report itself `complete`, and it
 * is the wrong one: measured, a browser produces the local address it needs
 * after about eight milliseconds and then carries on gathering — looking for
 * a relay that was never configured — without ever finishing. Waiting for
 * `complete` therefore spends the whole timeout, every time, staring at a
 * screen with no code on it.
 *
 * A local network needs only the host addresses, and they all arrive within a
 * few milliseconds of each other. So the wait ends shortly after the first
 * one, which turns three seconds of dead time into under half of one.
 */
const SETTLE_MS = 400

/**
 * The hard ceiling, for when no address turns up at all.
 *
 * A code that never appears looks, to the person holding the phone, exactly
 * like a game that hung. Better to publish whatever was gathered and let the
 * connection fail with a reason than to wait indefinitely for a better one.
 */
const GATHER_MS = 3000

/** Connections that never come up, given a deadline so they can say so. */
const CONNECT_MS = 20_000

export class Peer {
  private pc: RTCPeerConnection
  private control: RTCDataChannel | null = null
  private poses: RTCDataChannel | null = null
  private state: PeerState = 'new'
  private connectTimer: number | null = null

  constructor(private readonly handlers: PeerHandlers = {}) {
    /*
      No ICE servers, deliberately.

      A STUN server would discover this device's public address, which only
      matters for connecting across the internet — and a TURN relay, which is
      what actually carries traffic when a direct path cannot be found, has to
      be paid for by somebody. On one network neither is needed: the addresses
      each side already knows about are enough, and asking anyone on the
      internet for help would be both useless and a thing this game does not do.
    */
    this.pc = new RTCPeerConnection({ iceServers: [] })
    this.pc.addEventListener('connectionstatechange', () => {
      const s = this.pc.connectionState
      if (s === 'failed') this.set('failed')
      else if (s === 'disconnected' || s === 'closed') this.set('closed')
    })
    this.pc.addEventListener('datachannel', (e) => this.adopt(e.channel))
  }

  /** Where the connection is. Screens draw from this and nothing else. */
  get status(): PeerState {
    return this.state
  }

  get connected(): boolean {
    return this.state === 'open'
  }

  /**
   * Start a race and return the code to send to the other player.
   *
   * The host creates both channels, because a channel opened before the
   * connection exists is negotiated as part of it — which is one fewer thing
   * to go wrong than opening them afterwards and waiting.
   */
  async host(): Promise<string> {
    this.set('signalling')
    this.adopt(this.pc.createDataChannel('c', { ordered: true }))
    this.adopt(this.pc.createDataChannel('p', { ordered: false, maxRetransmits: 0 }))
    await this.pc.setLocalDescription(await this.pc.createOffer())
    await this.gathered()
    this.armConnectTimeout()
    return encodeSignal('offer', this.pc.localDescription?.sdp ?? '')
  }

  /**
   * Take a host's code and return the one to send back.
   *
   * Returns null when the code is not a valid offer — damaged in transit, or
   * an answer pasted where an offer belongs. Refusing here is the difference
   * between a sentence the player can act on and a connection that silently
   * never opens.
   */
  async join(offerCode: string): Promise<string | null> {
    const sdp = decodeSignal('offer', offerCode)
    if (!sdp) return null
    this.set('signalling')
    try {
      await this.pc.setRemoteDescription({ type: 'offer', sdp })
      await this.pc.setLocalDescription(await this.pc.createAnswer())
    } catch {
      this.set('failed')
      return null
    }
    await this.gathered()
    this.armConnectTimeout()
    return encodeSignal('answer', this.pc.localDescription?.sdp ?? '')
  }

  /** The host's last step: take the answer the other player sent back. */
  async accept(answerCode: string): Promise<boolean> {
    const sdp = decodeSignal('answer', answerCode)
    if (!sdp) return false
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp })
      this.set('connecting')
      return true
    } catch {
      this.set('failed')
      return false
    }
  }

  send(msg: Control): void {
    if (this.control?.readyState === 'open') this.control.send(JSON.stringify(msg))
  }

  /** Dropped silently when the channel is not up. A pose is not worth a throw. */
  sendPose(pose: NetPose): void {
    if (this.poses?.readyState === 'open') this.poses.send(packPose(pose))
  }

  close(): void {
    if (this.connectTimer !== null) window.clearTimeout(this.connectTimer)
    this.connectTimer = null
    this.control?.close()
    this.poses?.close()
    this.pc.close()
    this.set('closed')
  }

  private adopt(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer'
    if (channel.label === 'p') {
      this.poses = channel
      channel.addEventListener('message', (e) => {
        if (!(e.data instanceof ArrayBuffer)) return
        const pose = unpackPose(e.data)
        if (pose) this.handlers.onPose?.(pose)
      })
      return
    }
    this.control = channel
    channel.addEventListener('open', () => {
      if (this.connectTimer !== null) window.clearTimeout(this.connectTimer)
      this.connectTimer = null
      this.set('open')
    })
    channel.addEventListener('close', () => this.set('closed'))
    channel.addEventListener('message', (e) => {
      const msg = readControl(e.data)
      if (msg) this.handlers.onControl?.(msg)
    })
  }

  private armConnectTimeout(): void {
    if (this.connectTimer !== null) window.clearTimeout(this.connectTimer)
    this.connectTimer = window.setTimeout(() => {
      if (this.state !== 'open') this.set('failed')
    }, CONNECT_MS)
  }

  private set(state: PeerState): void {
    // Once a connection has failed or closed it stays that way. Late events
    // arrive after `close()` in normal operation, and a screen that had said
    // so must not flicker back to hopeful.
    if (this.state === state || this.state === 'closed' || this.state === 'failed') return
    this.state = state
    this.handlers.onState?.(state)
  }

  private gathered(): Promise<void> {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === 'complete') return resolve()
      let settle: number | null = null
      const finish = () => {
        this.pc.removeEventListener('icegatheringstatechange', onState)
        this.pc.removeEventListener('icecandidate', onCandidate)
        if (settle !== null) window.clearTimeout(settle)
        window.clearTimeout(cap)
        resolve()
      }
      const onState = () => {
        if (this.pc.iceGatheringState === 'complete') finish()
      }
      const onCandidate = (e: RTCPeerConnectionIceEvent) => {
        // A null candidate is the browser saying it has finished. Otherwise
        // start the short wait, and let any further addresses land inside it
        // rather than restarting it — several interfaces means several
        // candidates in quick succession, not a reason to keep waiting.
        if (!e.candidate) return finish()
        if (settle === null) settle = window.setTimeout(finish, SETTLE_MS)
      }
      const cap = window.setTimeout(finish, GATHER_MS)
      this.pc.addEventListener('icegatheringstatechange', onState)
      this.pc.addEventListener('icecandidate', onCandidate)
    })
  }
}
