import { Peer, type PeerHandlers, type PeerState } from './peer'
import { NET_POSE_HZ, PEER_TIMEOUT, PROTOCOL_VERSION, type Control, type NetPose } from './protocol'
import type { CrewId } from '../types'

/**
 * One race between two devices, from the handshake to the finish line.
 *
 * Sits between the connection and the game: the screens ask it what to draw,
 * the game hands it the player's body and asks where the opponent's is, and
 * nothing above it knows that any of this involves a network.
 *
 * ## Where the race actually happens
 *
 * On both devices, separately. Each runs its own stage with its own enemies
 * and its own clock, and the only thing crossing is where each body is. That
 * is not a shortcut around some better design — it is the *reason* this works
 * between an iPhone and a laptop. Two engines cannot be relied on to produce
 * the same last bit from `Math.sin`, and the step is full of it, so anything
 * built on both sides agreeing would come apart quietly and at the worst
 * moment. Nothing here agrees on anything, so nothing here can come apart.
 *
 * What is shared is therefore small and specific: when to start, where each
 * body is while running, and what each clock said at the line.
 */

export type RacePhase =
  /** Waiting for the codes to be carried across. */
  | 'signalling'
  /** Connected, both present, nobody has pressed start. */
  | 'lobby'
  /** Counting down. Both sides are already in the stage. */
  | 'countdown'
  | 'racing'
  | 'finished'
  | 'lost'

export interface Opponent {
  name: string
  crew: CrewId
  /** Their finishing time in seconds, once they are over the line. */
  seconds: number | null
  gaveUp: boolean
}

export interface RaceSnapshot {
  phase: RacePhase
  connection: PeerState
  opponent: Opponent | null
  /** The stage both are racing, chosen by the host. */
  levelId: string | null
  /** Milliseconds until the start, while counting down. */
  startsInMs: number
  /** Round-trip time, in milliseconds. Shown so a bad link is visible. */
  rttMs: number
  /** Seconds this side took, once over the line. */
  mySeconds: number | null
}

/** How long the countdown runs. Long enough to put a thumb on the screen. */
const COUNTDOWN_MS = 3200

/**
 * The part of a connection this session uses.
 *
 * Named as an interface so a test can stand in for it. `RTCPeerConnection`
 * does not exist outside a browser, and the rules below — a version mismatch
 * ending the race, a pose arriving out of order being dropped, a countdown
 * that both sides start on — are exactly the ones that are expensive to check
 * by hand and quiet when they break.
 */
export interface PeerLike {
  readonly status: PeerState
  send(msg: Control): void
  sendPose(pose: NetPose): void
  close(): void
}

export class RaceSession {
  private peer: PeerLike
  private phase: RacePhase = 'signalling'
  private opponent: Opponent | null = null
  private level: string | null = null
  private startAt = 0
  private rtt = 0
  private mySeconds: number | null = null
  private lastPose: NetPose | null = null
  private lastPoseAt = 0
  private sinceSent = 0
  private listeners = new Set<(s: RaceSnapshot) => void>()

  constructor(
    readonly isHost: boolean,
    private readonly me: { name: string; crew: CrewId },
    makePeer: (handlers: PeerHandlers) => PeerLike = (handlers) => new Peer(handlers),
  ) {
    this.peer = makePeer({
      onState: (state) => {
        if (state === 'open') this.greet()
        // A link that drops mid-race does not end it. The stage carries on and
        // the opponent stops moving — losing the race is a worse outcome than
        // finishing it alone, and the player can see for themselves what
        // happened when the other body freezes.
        if (state === 'failed' || state === 'closed') {
          if (this.phase === 'signalling' || this.phase === 'lobby') this.to('lost')
          else this.emit()
        }
      },
      onControl: (msg) => this.handle(msg),
      onPose: (pose) => {
        // Out-of-order arrival is normal on an unreliable channel, and an old
        // pose is worse than none: it walks the opponent backwards. Each one
        // carries the sender's own clock, so a stale one is simply dropped.
        if (this.lastPose && pose.at < this.lastPose.at) return
        this.lastPose = pose
        this.lastPoseAt = performance.now()
      },
    })
  }

  // ── Setting up ─────────────────────────────────────────────────────────────

  /*
    The three signalling calls reach past `PeerLike` to the real connection.

    They are the only place that does. Handing codes back and forth is a
    property of WebRTC rather than of a race, and a stand-in peer in a test has
    no handshake to perform — so they are narrowed here instead of widening the
    interface with three methods nothing else would ever implement.
  */
  private get rtc(): Peer {
    return this.peer as Peer
  }

  /** Host: the code to send to the other player. */
  offer(): Promise<string> {
    return this.rtc.host()
  }

  /** Guest: take the host's code, return the one to send back. Null if bad. */
  join(offerCode: string): Promise<string | null> {
    return this.rtc.join(offerCode)
  }

  /** Host: take the answer. False if the code is not one. */
  accept(answerCode: string): Promise<boolean> {
    return this.rtc.accept(answerCode)
  }

  /** Host only: choose the stage. Sent so the lobby agrees on it. */
  setLevel(levelId: string): void {
    if (!this.isHost) return
    this.level = levelId
    this.peer.send({ t: 'stage', level: levelId })
    this.emit()
  }

  /**
   * Host only: start the countdown.
   *
   * The host starts *late* by half the round trip, so that both sides begin
   * within a millisecond or two of each other rather than the guest conceding
   * the whole one-way latency. On a local network that is a couple of
   * milliseconds either way — but this is a race timed to hundredths, and a
   * handicap that always falls on the same player is not one to leave in.
   */
  start(): void {
    if (!this.isHost || this.phase !== 'lobby' || !this.level) return
    this.peer.send({ t: 'go', inMs: COUNTDOWN_MS })
    this.beginCountdown(COUNTDOWN_MS + this.rtt / 2)
  }

  // ── While racing ───────────────────────────────────────────────────────────

  /**
   * Hand over the player's body. Called every step; sends at the wire rate.
   *
   * `elapsedMs` is this side's own race clock rather than a wall clock,
   * because it is what the other end uses to order poses — and the two
   * devices have no shared clock to compare against.
   */
  publish(dt: number, pose: Omit<NetPose, 'at'>, elapsedMs: number): void {
    if (this.phase !== 'racing') return
    this.sinceSent += dt
    const step = 1 / NET_POSE_HZ
    if (this.sinceSent < step) return
    this.sinceSent %= step
    this.peer.sendPose({ ...pose, at: elapsedMs })
  }

  /**
   * Where to draw the opponent, or null.
   *
   * Null once they have gone quiet for longer than `PEER_TIMEOUT`. A body
   * frozen mid-stride is read as a bug; a body that is not there reads as
   * somebody whose phone locked, which is what has happened.
   */
  opponentPose(): NetPose | null {
    if (!this.lastPose) return null
    if ((performance.now() - this.lastPoseAt) / 1000 > PEER_TIMEOUT) return null
    return this.lastPose
  }

  /** Over the line. Their time may already be in, or may arrive after. */
  finish(seconds: number): void {
    if (this.phase !== 'racing') return
    this.mySeconds = seconds
    this.peer.send({ t: 'done', seconds })
    this.to('finished')
  }

  /**
   * Set up for another race down the same connection.
   *
   * A rematch must not need the two codes carried across again. Pairing takes
   * the better part of a minute of passing messages between two devices, and
   * asking for it after every race is the difference between two children
   * playing three of them and playing one.
   */
  rematch(): void {
    if (this.peer.status !== 'open') return this.to('lost')
    this.mySeconds = null
    this.lastPose = null
    this.sinceSent = 0
    if (this.opponent) this.opponent = { ...this.opponent, seconds: null, gaveUp: false }
    this.phase = 'lobby'
    // Re-announced rather than assumed still agreed: the host may pick a
    // different stage, and the guest's lobby has to be showing the right one
    // before anybody presses start.
    if (this.isHost && this.level) this.peer.send({ t: 'stage', level: this.level })
    this.emit()
  }

  /** Quit, so the other side is told rather than left watching a still body. */
  giveUp(): void {
    this.peer.send({ t: 'gaveUp' })
    this.close()
  }

  // ── Watching ───────────────────────────────────────────────────────────────

  subscribe(fn: (s: RaceSnapshot) => void): () => void {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => this.listeners.delete(fn)
  }

  snapshot(): RaceSnapshot {
    return {
      phase: this.phase,
      connection: this.peer.status,
      opponent: this.opponent,
      levelId: this.level,
      startsInMs: Math.max(0, this.startAt - performance.now()),
      rttMs: Math.round(this.rtt),
      mySeconds: this.mySeconds,
    }
  }

  /** True once the countdown has run out. The game asks this to let go. */
  get started(): boolean {
    if (this.phase !== 'countdown') return this.phase === 'racing'
    if (performance.now() < this.startAt) return false
    this.to('racing')
    return true
  }

  close(): void {
    this.peer.close()
    this.to('lost')
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private greet(): void {
    this.peer.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.me.name, crew: this.me.crew })
    this.peer.send({ t: 'ping', at: performance.now() })
    if (this.isHost && this.level) this.peer.send({ t: 'stage', level: this.level })
  }

  private handle(msg: Control): void {
    switch (msg.t) {
      case 'hello':
        // A build that does not speak this version is refused rather than
        // half-understood: the failure of a mismatched protocol is a race that
        // starts at different moments, which nobody would read as a version
        // problem.
        if (msg.v !== PROTOCOL_VERSION) return this.to('lost')
        this.opponent = { name: msg.name, crew: msg.crew, seconds: null, gaveUp: false }
        if (this.phase === 'signalling') this.to('lobby')
        else this.emit()
        return
      case 'stage':
        if (this.isHost) return
        this.level = msg.level
        this.emit()
        return
      case 'ping':
        this.peer.send({ t: 'pong', at: msg.at })
        return
      case 'pong':
        this.rtt = Math.max(0, performance.now() - msg.at)
        this.emit()
        return
      case 'go':
        if (this.isHost) return
        this.beginCountdown(msg.inMs)
        return
      case 'done':
        if (this.opponent) this.opponent = { ...this.opponent, seconds: msg.seconds }
        this.emit()
        return
      case 'gaveUp':
        if (this.opponent) this.opponent = { ...this.opponent, gaveUp: true }
        this.emit()
        return
    }
  }

  private beginCountdown(inMs: number): void {
    this.startAt = performance.now() + inMs
    this.to('countdown')
  }

  private to(phase: RacePhase): void {
    if (this.phase === phase) return
    this.phase = phase
    this.emit()
  }

  private emit(): void {
    const snap = this.snapshot()
    for (const fn of this.listeners) fn(snap)
  }
}
