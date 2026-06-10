import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { DeviceAuthInfo, ProviderId, Settings } from '../shared/types'
import { appState } from './app-state'
import { bus } from './bus'
import { checkForUpdates } from './updater'
import { loadSettings, saveSettings } from './config'
import { getProvider } from './music'
import { spotifyLogin, twitchLogin, yandexLogin } from './oauth'
import { overlayUrl, pushOverlayConfig } from './overlay-server'
import { queue } from './queue'
import { getStatus, setStatus } from './status'
import { listRewards, logout, pollDeviceToken, startDeviceAuth } from './twitch/auth'
import { twitchEventSub } from './twitch/eventsub'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function registerIpc(): void {
  // Forward bus events to the renderer.
  bus.on('status', (s) => broadcast('evt:status', s))
  bus.on('log', (e) => broadcast('evt:log', e))
  bus.on('queue:update', (items) => broadcast('evt:queue', items))

  ipcMain.handle('settings:get', () => loadSettings())

  ipcMain.handle('settings:save', (_e, next: Settings) => {
    const saved = saveSettings(next)
    pushOverlayConfig()
    setStatus({ vinylEnabled: saved.overlay.vinylEnabled, activeProvider: saved.activeProvider })
    return saved
  })

  ipcMain.handle('status:get', () => getStatus())
  ipcMain.handle('overlay:url', () => overlayUrl())

  ipcMain.handle('overlay:toggle-vinyl', (_e, enabled: boolean) => {
    const s = loadSettings()
    saveSettings({ ...s, overlay: { ...s.overlay, vinylEnabled: enabled } })
    pushOverlayConfig()
    setStatus({ vinylEnabled: enabled })
    bus.info(`Винил-анимация ${enabled ? 'включена' : 'выключена'}`)
    return enabled
  })

  // ---- Twitch -------------------------------------------------------------
  ipcMain.handle('twitch:auth-start', async (): Promise<DeviceAuthInfo> => {
    const start = await startDeviceAuth()
    // Poll + auto-connect in the background; report the result via an event.
    void pollDeviceToken(start)
      .then(() => twitchEventSub.connect())
      .then(() => broadcast('evt:twitch-auth', { ok: true }))
      .catch((err: Error) => {
        setStatus({ twitch: 'error' })
        broadcast('evt:twitch-auth', { ok: false, error: err.message })
      })
    return {
      userCode: start.userCode,
      verificationUri: start.verificationUri,
      expiresIn: start.expiresIn
    }
  })

  ipcMain.handle('twitch:login', async () => {
    setStatus({ twitch: 'connecting' })
    try {
      await twitchLogin()
      await twitchEventSub.connect() // validates token, fetches self, subscribes
      return { ok: true }
    } catch (err) {
      setStatus({ twitch: 'error' })
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('twitch:connect', async () => {
    await twitchEventSub.connect()
  })
  ipcMain.handle('twitch:disconnect', () => twitchEventSub.disconnect())
  ipcMain.handle('twitch:logout', () => {
    twitchEventSub.disconnect()
    logout()
  })
  ipcMain.handle('twitch:rewards', () => listRewards())

  // ---- Music providers ----------------------------------------------------
  ipcMain.handle('yandex:login', async () => {
    setStatus({ yandex: 'connecting' })
    try {
      await yandexLogin()
      await getProvider('yandex').verify()
      setStatus({ yandex: 'connected' })
      return { ok: true }
    } catch (err) {
      setStatus({ yandex: 'error' })
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('spotify:login', async () => {
    setStatus({ spotify: 'connecting' })
    try {
      await spotifyLogin()
      await getProvider('spotify').verify()
      setStatus({ spotify: 'connected' })
      return { ok: true }
    } catch (err) {
      setStatus({ spotify: 'error' })
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('provider:logout', (_e, id: ProviderId) => {
    const s = loadSettings()
    if (id === 'spotify') {
      saveSettings({ ...s, spotify: { ...s.spotify, accessToken: null, refreshToken: null } })
      setStatus({ spotify: 'disconnected' })
    } else {
      saveSettings({ ...s, yandex: { ...s.yandex, token: '' } })
      setStatus({ yandex: 'disconnected' })
    }
  })

  ipcMain.handle('provider:verify', async (_e, id: ProviderId) => {
    setStatus({ [id]: 'connecting' } as never)
    try {
      await getProvider(id).verify()
      setStatus({ [id]: 'connected' } as never)
      bus.info(`${id}: учётные данные валидны`)
      return { ok: true }
    } catch (err) {
      setStatus({ [id]: 'error' } as never)
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- Queue --------------------------------------------------------------
  ipcMain.handle('queue:list', () => queue.list())
  ipcMain.handle('queue:skip', () => queue.skip())
  ipcMain.handle('queue:clear', () => queue.clear())
  ipcMain.handle('queue:remove', (_e, id: string) => queue.remove(id))
  ipcMain.handle('queue:move', (_e, id: string, dir: -1 | 1) => queue.move(id, dir))
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('app:quit', () => {
    appState.quitting = true
    app.quit()
  })
  ipcMain.handle('app:check-updates', () => checkForUpdates(true))
  ipcMain.handle('queue:request', (_e, query: string) =>
    queue.addRequest(query, 'тест')
  )
}
