// Shared types used across main, preload, renderer and overlay.

export type ProviderId = 'yandex' | 'spotify'

export interface Track {
  provider: ProviderId
  id: string
  title: string
  artists: string[]
  coverUrl?: string
  durationMs: number
  /** Direct audio URL the overlay <audio> element can play. */
  streamUrl?: string
}

export interface QueueItem {
  /** Unique id for this queue entry (not the track id). */
  id: string
  track: Track
  requestedBy: string
  requestQuery: string
  addedAt: number
}

export interface Settings {
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
  | { type: 'play'; item: QueueItem; volume: number; vinylEnabled: boolean; showNowPlaying: boolean }
  | { type: 'stop' }
  | { type: 'config'; volume: number; vinylEnabled: boolean; showNowPlaying: boolean }

export type OverlayToServer =
  | { type: 'ready' }
  | { type: 'ended'; queueItemId: string }
  | { type: 'error'; message: string }

// ---- Defaults --------------------------------------------------------------

export const DEFAULT_SETTINGS: Settings = {
  twitch: {
    clientId: '',
    channelLogin: '',
    userId: null,
    accessToken: null,
    refreshToken: null,
    rewardId: null,
    rewardTitle: 'Заказать трек'
  },
  yandex: { token: '' },
  overlay: { vinylEnabled: true, port: 7895, showNowPlaying: true, volume: 0.8 }
}
