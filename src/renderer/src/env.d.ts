/// <reference types="vite/client" />
import type {
  AppStatus,
  DeviceAuthInfo,
  LogEntry,
  ProviderId,
  QueueItem,
  Settings,
  TwitchReward
} from '../../shared/types'

export interface LsApi {
  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<Settings>
  getStatus(): Promise<AppStatus>
  getOverlayUrl(): Promise<string>
  toggleVinyl(enabled: boolean): Promise<boolean>

  twitchAuthStart(): Promise<DeviceAuthInfo>
  twitchLogin(): Promise<{ ok: boolean; error?: string }>
  twitchConnect(): Promise<void>
  twitchDisconnect(): Promise<void>
  twitchLogout(): Promise<void>
  twitchRewards(): Promise<TwitchReward[]>
  twitchCreateReward(cost: number): Promise<TwitchReward>

  verifyProvider(id: ProviderId): Promise<{ ok: boolean; error?: string }>
  yandexLogin(): Promise<{ ok: boolean; error?: string }>
  spotifyLogin(): Promise<{ ok: boolean; error?: string }>
  providerLogout(id: ProviderId): Promise<void>

  queueList(): Promise<QueueItem[]>
  queueSkip(): Promise<void>
  playbackToggle(): Promise<void>
  queueClear(): Promise<void>
  queueRemove(id: string): Promise<void>
  queueMove(id: string, dir: -1 | 1): Promise<void>
  queueRequest(query: string): Promise<void>
  getVersion(): Promise<string>
  openExternal(url: string): Promise<void>
  quit(): Promise<void>
  checkUpdates(): Promise<void>

  onStatus(cb: (s: AppStatus) => void): () => void
  onLog(cb: (e: LogEntry) => void): () => void
  onQueue(cb: (items: QueueItem[]) => void): () => void
  onTwitchAuth(cb: (r: { ok: boolean; error?: string }) => void): () => void
}

declare global {
  interface Window {
    api: LsApi
  }
}
