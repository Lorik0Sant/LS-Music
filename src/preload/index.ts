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
  twitchConnect: (): Promise<void> => ipcRenderer.invoke('twitch:connect'),
  twitchDisconnect: (): Promise<void> => ipcRenderer.invoke('twitch:disconnect'),
  twitchLogout: (): Promise<void> => ipcRenderer.invoke('twitch:logout'),
  twitchRewards: (): Promise<TwitchReward[]> => ipcRenderer.invoke('twitch:rewards'),

  verifyProvider: (id: ProviderId): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('provider:verify', id),

  queueList: (): Promise<QueueItem[]> => ipcRenderer.invoke('queue:list'),
  queueSkip: (): Promise<void> => ipcRenderer.invoke('queue:skip'),
  queueClear: (): Promise<void> => ipcRenderer.invoke('queue:clear'),
  queueRequest: (query: string): Promise<void> => ipcRenderer.invoke('queue:request', query),

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
