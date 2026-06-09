import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { appState } from './app-state'
import { iconPath } from './assets'

let tray: Tray | null = null

export function createTray(getWin: () => BrowserWindow | null): void {
  if (tray) return
  const img = nativeImage.createFromPath(iconPath())
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }))
  tray.setToolTip('LS Music')

  const open = (): void => {
    const w = getWin()
    if (w) {
      w.show()
      w.focus()
    }
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Открыть LS Music', click: open },
      { type: 'separator' },
      {
        label: 'Выход',
        click: () => {
          appState.quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', open)
}
