import { contextBridge, ipcRenderer } from 'electron'
import {
  AppStatus,
  DeviceAuthInfo,
  LogEntry,
  ProviderId,
  QueueItem,
  Settings,
  TwitchReward
} from '../shared/types'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: Settings): Promise<Settings> => ipcRenderer.invoke('settings:save', s),
  getStatus: (): Promise<AppStatus> => ipcRenderer.invoke('status:get'),
  getOverlayUrl: (): Promise<string> => ipcRenderer.invoke('overlay:url'),
  toggleVinyl: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('overlay:toggle-vinyl', enabled),

  twitchAuthStart: (): Promise<DeviceAuthInfo> => ipcRenderer.invoke('twitch:auth-start'),
  twitchLogin: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('twitch:login'),
  twitchConnect: (): Promise<void> => ipcRenderer.invoke('twitch:connect'),
  twitchDisconnect: (): Promise<void> => ipcRenderer.invoke('twitch:disconnect'),
  twitchLogout: (): Promise<void> => ipcRenderer.invoke('twitch:logout'),
  twitchRewards: (): Promise<TwitchReward[]> => ipcRenderer.invoke('twitch:rewards'),

  verifyProvider: (id: ProviderId): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('provider:verify', id),
  yandexLogin: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('yandex:login'),
  spotifyLogin: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('spotify:login'),
  providerLogout: (id: ProviderId): Promise<void> => ipcRenderer.invoke('provider:logout', id),

  queueList: (): Promise<QueueItem[]> => ipcRenderer.invoke('queue:list'),
  queueSkip: (): Promise<void> => ipcRenderer.invoke('queue:skip'),
  queueClear: (): Promise<void> => ipcRenderer.invoke('queue:clear'),
  queueRemove: (id: string): Promise<void> => ipcRenderer.invoke('queue:remove', id),
  queueMove: (id: string, dir: -1 | 1): Promise<void> => ipcRenderer.invoke('queue:move', id, dir),
  queueRequest: (query: string): Promise<void> => ipcRenderer.invoke('queue:request', query),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  checkUpdates: (): Promise<void> => ipcRenderer.invoke('app:check-updates'),

  onStatus: (cb: (s: AppStatus) => void) => sub('evt:status', cb),
  onLog: (cb: (e: LogEntry) => void) => sub('evt:log', cb),
  onQueue: (cb: (items: QueueItem[]) => void) => sub('evt:queue', cb),
  onTwitchAuth: (cb: (r: { ok: boolean; error?: string }) => void) => sub('evt:twitch-auth', cb)
}

function sub<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
