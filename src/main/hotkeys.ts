import { globalShortcut } from 'electron'
import { bus } from './bus'
import { loadSettings } from './config'
import { togglePaused } from './overlay-server'
import { queue } from './queue'

/** (Re)register global hotkeys from settings. Call on startup and after save. */
export function registerHotkeys(): void {
  globalShortcut.unregisterAll()
  const { playPause, skip } = loadSettings().hotkeys

  const tryReg = (accel: string, action: () => void, name: string): void => {
    if (!accel) return
    try {
      const ok = globalShortcut.register(accel, action)
      if (!ok) bus.warn(`Горячая клавиша «${accel}» (${name}) занята другим приложением`)
    } catch (err) {
      bus.warn(`Не удалось назначить «${accel}» (${name}): ${(err as Error).message}`)
    }
  }

  tryReg(playPause, () => togglePaused(), 'пауза/плей')
  tryReg(skip, () => queue.skip(), 'следующий')
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
