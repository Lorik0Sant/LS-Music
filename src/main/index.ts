import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { appState } from './app-state'
import { iconPath } from './assets'
import { bus } from './bus'
import { loadSettings } from './config'
import { registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import { startOverlayServer } from './overlay-server'
import { queue } from './queue'
import { setStatus } from './status'
import { createTray } from './tray'
import { twitchEventSub } from './twitch/eventsub'
import { checkForUpdates, initUpdater } from './updater'

let mainWindow: BrowserWindow | null = null
const getWin = (): BrowserWindow | null => mainWindow

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    icon: iconPath(),
    backgroundColor: '#0e0e14',
    title: 'LS Music',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Closing the window hides to tray; only the Exit menu fully quits.
  mainWindow.on('close', (e) => {
    if (!appState.quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Surface renderer console + crashes in the app log for diagnostics.
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) bus.error(`[renderer] ${message}`)
  })
  mainWindow.webContents.on('render-process-gone', (_e, d) =>
    bus.error(`[renderer] процесс упал: ${d.reason}`)
  )

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  registerIpc()
  queue.init()
  try {
    await startOverlayServer()
  } catch (err) {
    bus.error(`Не удалось запустить overlay-сервер: ${(err as Error).message}`)
  }
  createWindow()
  buildAppMenu(getWin)
  createTray(getWin)
  initUpdater(getWin)
  restoreSessions()
  // Quiet update check shortly after launch.
  setTimeout(() => checkForUpdates(false), 4000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

/** Reconnect/reflect saved logins on startup so redemptions work right away. */
function restoreSessions(): void {
  const s = loadSettings()
  if (s.yandex.token) setStatus({ yandex: 'connected' })
  if (s.spotify.accessToken) setStatus({ spotify: 'connected' })
  if (s.twitch.accessToken) {
    bus.info('Восстанавливаю подключение Twitch…')
    twitchEventSub.connect().catch((err) => {
      bus.warn(`Twitch авто-подключение не удалось: ${(err as Error).message}. Войдите заново.`)
    })
  }
}

app.on('before-quit', () => {
  appState.quitting = true
})

// Stay alive in the tray when the window is closed.
app.on('window-all-closed', () => {
  // Intentionally do nothing — quit only via the Exit menu / tray.
})
