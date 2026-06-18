import { bus } from './bus'
import { loadSettings } from './config'
import { togglePaused } from './overlay-server'
import { queue } from './queue'

/**
 * Global hotkeys via uiohook-napi (a passive, low-level keyboard listener).
 *
 * Unlike Electron's `globalShortcut`, uIOhook does NOT consume the key — it only
 * observes it. So a bound media key (e.g. Play/Pause) still reaches Spotify and
 * other apps while LS Music is running, instead of being swallowed.
 *
 * uiohook-napi is an N-API native module: its prebuilt binary works across
 * Electron versions without a rebuild (see electron-builder.yml asarUnpack).
 */

type Uiohook = typeof import('uiohook-napi')
type KeyboardEvent = import('uiohook-napi').UiohookKeyboardEvent

// Lazy-loaded so a native-load failure degrades gracefully instead of crashing.
// (Requiring the module loads the native binary immediately, so we defer it.)
let mod: Uiohook | null = null
let loadFailed = false

function loadMod(): Uiohook | null {
  if (mod || loadFailed) return mod
  try {
    mod = require('uiohook-napi') as Uiohook
  } catch (err) {
    loadFailed = true
    bus.warn(`Глобальные горячие клавиши недоступны: ${(err as Error).message}`)
  }
  return mod
}

/**
 * Maps the accelerator tokens the renderer produces to uiohook-napi keycodes.
 * Most map 1:1 onto UiohookKey; media keys aren't in that table, so we list both
 * plausible scancode encodings (uiohook's table mixes 0x0Exx and 0xE0xx forms)
 * to be robust regardless of which the native layer emits.
 */
function buildTokenMap(K: Uiohook['UiohookKey']): Record<string, number[]> {
  const map: Record<string, number[]> = {}
  const one = (token: string, code: number): void => {
    map[token] = [code]
  }
  // Letters & digits (renderer upper-cases single chars).
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') one(c, K[c as keyof typeof K] as number)
  // Function keys.
  for (let i = 1; i <= 24; i++) one(`F${i}`, K[`F${i}` as keyof typeof K] as number)
  // Named keys (renderer token -> UiohookKey field).
  const named: Record<string, keyof typeof K> = {
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Esc: 'Escape',
    Escape: 'Escape',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    CapsLock: 'CapsLock',
    NumLock: 'NumLock',
    ScrollLock: 'ScrollLock',
    PrintScreen: 'PrintScreen',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
    // Punctuation (single chars, unchanged by upper-casing).
    ';': 'Semicolon',
    '=': 'Equal',
    ',': 'Comma',
    '-': 'Minus',
    '.': 'Period',
    '/': 'Slash',
    '`': 'Backquote',
    '[': 'BracketLeft',
    '\\': 'Backslash',
    ']': 'BracketRight',
    "'": 'Quote'
  }
  for (const [token, field] of Object.entries(named)) one(token, K[field] as number)
  // Media keys — not in UiohookKey; accept both encodings (0x0Exx | 0xE0xx).
  map.MediaPlayPause = [0x0e22, 0xe022]
  map.MediaNextTrack = [0x0e19, 0xe019]
  map.MediaPreviousTrack = [0x0e10, 0xe010]
  map.MediaStop = [0x0e24, 0xe024]
  return map
}

let tokenMap: Record<string, number[]> | null = null

interface Binding {
  keycodes: number[]
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  action: () => void
  name: string
}

let bindings: Binding[] = []
let listening = false
const lastFire: Record<string, number> = {}

/** Parse an Electron accelerator string (e.g. "Ctrl+Shift+P") into a Binding. */
function parse(accel: string, action: () => void, name: string): Binding | null {
  if (!tokenMap) return null
  const parts = accel.split('+')
  let ctrl = false
  let alt = false
  let shift = false
  let meta = false
  let keycodes: number[] | undefined
  for (const raw of parts) {
    const part = raw.trim()
    switch (part) {
      case 'Ctrl':
      case 'Control':
      case 'CmdOrCtrl':
        ctrl = true
        break
      case 'Alt':
      case 'Option':
        alt = true
        break
      case 'Shift':
        shift = true
        break
      case 'Super':
      case 'Meta':
      case 'Cmd':
      case 'Command':
        meta = true
        break
      default:
        keycodes = tokenMap[part]
    }
  }
  if (!keycodes) {
    bus.warn(`Не удалось разобрать горячую клавишу «${accel}» (${name})`)
    return null
  }
  return { keycodes, ctrl, alt, shift, meta, action, name }
}

function onKeydown(e: KeyboardEvent): void {
  for (const b of bindings) {
    if (
      b.keycodes.includes(e.keycode) &&
      b.ctrl === e.ctrlKey &&
      b.alt === e.altKey &&
      b.shift === e.shiftKey &&
      b.meta === e.metaKey
    ) {
      // Debounce so auto-repeat (held key) doesn't fire the action repeatedly.
      const now = Date.now()
      if (now - (lastFire[b.name] ?? 0) < 250) return
      lastFire[b.name] = now
      try {
        b.action()
      } catch (err) {
        bus.error(`Ошибка горячей клавиши (${b.name}): ${(err as Error).message}`)
      }
      return
    }
  }
}

/** (Re)build hotkey bindings from settings. Call on startup and after save. */
export function registerHotkeys(): void {
  const m = loadMod()
  if (!m) return
  if (!tokenMap) tokenMap = buildTokenMap(m.UiohookKey)

  const { playPause, skip } = loadSettings().hotkeys
  const next: Binding[] = []
  if (playPause) {
    const b = parse(playPause, () => togglePaused(), 'пауза/плей')
    if (b) next.push(b)
  }
  if (skip) {
    const b = parse(skip, () => queue.skip(), 'следующий')
    if (b) next.push(b)
  }
  bindings = next

  if (bindings.length && !listening) {
    m.uIOhook.on('keydown', onKeydown)
    try {
      m.uIOhook.start()
      listening = true
    } catch (err) {
      bus.warn(`Не удалось запустить слежение за клавишами: ${(err as Error).message}`)
    }
  } else if (!bindings.length && listening) {
    unregisterHotkeys()
  }
}

export function unregisterHotkeys(): void {
  if (!listening || !mod) return
  try {
    mod.uIOhook.stop()
  } catch {
    // ignore — shutting down
  }
  mod.uIOhook.removeListener('keydown', onKeydown)
  listening = false
}
