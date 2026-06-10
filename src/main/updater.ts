import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { appState } from './app-state'
import { bus } from './bus'

let getWin: () => BrowserWindow | null = () => null
let manual = false

/** Turn electron-updater's releaseNotes (string | array | null) into plain text. */
function formatNotes(notes: unknown): string {
  if (!notes) return ''
  const raw = Array.isArray(notes)
    ? notes.map((n: any) => n?.note ?? '').join('\n')
    : String(notes)
  return raw
    .replace(/<[^>]+>/g, '') // strip any HTML
    .replace(/&nbsp;/g, ' ')
    .trim()
    .slice(0, 800)
}

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  getWin = getWindow
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', async (info) => {
    const win = getWin()
    if (!win) return
    const notes = formatNotes(info.releaseNotes)
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Обновить сейчас', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      title: 'Доступно обновление',
      message: `Доступна новая версия LS Music ${info.version}`,
      detail: (notes ? `Что нового:\n${notes}\n\n` : '') + 'Скачать и установить сейчас?'
    })
    if (response === 0) {
      bus.info('Скачиваю обновление…')
      autoUpdater.downloadUpdate()
    }
  })

  autoUpdater.on('update-not-available', () => {
    if (manual && getWin()) {
      dialog.showMessageBox(getWin()!, { type: 'info', message: 'У вас последняя версия LS Music.' })
    }
    manual = false
  })

  autoUpdater.on('error', (err) => {
    if (manual && getWin()) {
      dialog.showMessageBox(getWin()!, {
        type: 'error',
        message: 'Не удалось проверить обновления',
        detail: err.message
      })
    }
    manual = false
    bus.warn(`Updater: ${err.message}`)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const win = getWin()
    if (!win) return
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Перезапустить и установить', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      title: 'Обновление готово',
      message: `LS Music ${info.version} загружено`,
      detail: 'Перезапустить приложение, чтобы установить?'
    })
    if (response === 0) {
      appState.quitting = true
      setImmediate(() => autoUpdater.quitAndInstall())
    }
  })
}

export async function checkForUpdates(isManual = false): Promise<void> {
  manual = isManual
  if (!app.isPackaged) {
    if (isManual && getWin()) {
      dialog.showMessageBox(getWin()!, {
        type: 'info',
        message: 'Проверка обновлений доступна только в установленной версии.'
      })
    }
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    bus.warn(`checkForUpdates: ${(err as Error).message}`)
  }
}
