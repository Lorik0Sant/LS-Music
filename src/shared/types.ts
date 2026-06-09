// Shared types used across main, preload, renderer and overlay.

export type ProviderId = 'yandex' | 'spotify'

export interface Track {
  provider: ProviderId
  id: string
  title: string
  artists: string[]
  coverUrl?: string
  durationMs: number
  /** 30-sec preview audio URL (Spotify), if available. */
  previewUrl?: string
  /** Deep link to play the full track in the native app (spotify:track:..). */
  externalUri?: string
}

/**
 * How a track is actually played:
 *  - `audio`: the overlay <audio> element plays `url` directly (full stream for
 *    Yandex Plus, or a 30s preview). We know it's done when audio ends.
 *  - `external`: hand the track to the installed native app via `uri`
 *    (works without Premium — free accounts just hear ads). The overlay only
 *    shows the vinyl; the main process advances the queue by a duration timer.
 */
export type Playback =
  | { kind: 'audio'; url: string }
  | { kind: 'external'; uri: string }

export interface QueueItem {
  /** Unique id for this queue entry (not the track id). */
  id: string
  track: Track
  playback: Playback
  requestedBy: string
  requestQuery: string
  addedAt: number
}

export type YandexMode = 'stream' | 'app'
export type SpotifyMode = 'app' | 'preview'

export interface Settings {
  /** Which service fulfils track requests. */
  activeProvider: ProviderId
  twitch: {
    /** Client-ID of your app registered at dev.twitch.tv (public, not secret). */
    clientId: string
    channelLogin: string
    userId: string | null
    accessToken: string | null
    refreshToken: string | null
    /** Channel Points reward id we listen to (null = react to any redemption). */
    rewardId: string | null
    rewardTitle: string
  }
  yandex: {
    token: string
    /** `stream` = full track in overlay (needs Plus); `app` = open Yandex Music app. */
    mode: YandexMode
  }
  spotify: {
    clientId: string
    clientSecret: string
    /** `app` = full track via Spotify app (free=ads); `preview` = 30s in overlay. */
    mode: SpotifyMode
  }
  overlay: {
    vinylEnabled: boolean
    port: number
    showNowPlaying: boolean
    /** 0..1 */
    volume: number
  }
}

export interface DeviceAuthInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
}

export interface TwitchReward {
  id: string
  title: string
  cost: number
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface AppStatus {
  twitch: ConnectionState
  twitchUser: string | null
  yandex: ConnectionState
  spotify: ConnectionState
  activeProvider: ProviderId
  overlayClients: number
  nowPlaying: QueueItem | null
  vinylEnabled: boolean
}

export interface LogEntry {
  ts: number
  level: 'info' | 'warn' | 'error'
  message: string
}

// ---- Overlay WebSocket protocol -------------------------------------------

export type ServerToOverlay =
  | {
      type: 'play'
      item: QueueItem
      volume: number
      vinylEnabled: boolean
      showNowPlaying: boolean
    }
  | { type: 'stop' }
  | { type: 'config'; volume: number; vinylEnabled: boolean; showNowPlaying: boolean }

export type OverlayToServer =
  | { type: 'ready' }
  | { type: 'ended'; queueItemId: string }
  | { type: 'error'; message: string }

// ---- Defaults --------------------------------------------------------------

export const DEFAULT_SETTINGS: Settings = {
  activeProvider: 'yandex',
  twitch: {
    clientId: '',
    channelLogin: '',
    userId: null,
    accessToken: null,
    refreshToken: null,
    rewardId: null,
    rewardTitle: 'Заказать трек'
  },
  yandex: { token: '', mode: 'stream' },
  spotify: { clientId: '', clientSecret: '', mode: 'app' },
  overlay: { vinylEnabled: true, port: 7895, showNowPlaying: true, volume: 0.8 }
}
