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
  twitchConnect(): Promise<void>
  twitchDisconnect(): Promise<void>
  twitchLogout(): Promise<void>
  twitchRewards(): Promise<TwitchReward[]>

  verifyProvider(id: ProviderId): Promise<{ ok: boolean; error?: string }>

  queueList(): Promise<QueueItem[]>
  queueSkip(): Promise<void>
  queueClear(): Promise<void>
  queueRequest(query: string): Promise<void>

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
