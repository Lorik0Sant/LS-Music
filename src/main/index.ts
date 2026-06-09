import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { bus } from './bus'
import { loadSettings } from './config'
import { registerIpc } from './ipc'
import { startOverlayServer } from './overlay-server'
import { queue } from './queue'
import { setStatus } from './status'
import { twitchEventSub } from './twitch/eventsub'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0e0e14',
    title: 'LS Music',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Open external links (e.g. twitch.tv/activate) in the system browser.
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
  mainWindow.webContents.on('preload-error', (_e, path, err) =>
    bus.error(`[preload] ${path}: ${err.message}`)
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
  restoreSessions()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
