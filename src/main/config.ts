import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { DEFAULT_SETTINGS, Settings } from '../shared/types'

const CONFIG_PATH = join(app.getPath('userData'), 'settings.json')

function deepMerge<T>(base: T, override: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base }
  for (const key of Object.keys(override ?? {})) {
    const ov = (override as any)[key]
    const bv = (base as any)[key]
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object') {
      out[key] = deepMerge(bv, ov)
    } else if (ov !== undefined) {
      out[key] = ov
    }
  }
  return out
}

let cache: Settings | null = null

export function loadSettings(): Settings {
  if (cache) return cache
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
      cache = deepMerge(DEFAULT_SETTINGS, raw)
    } else {
      cache = structuredClone(DEFAULT_SETTINGS)
    }
  } catch {
    cache = structuredClone(DEFAULT_SETTINGS)
  }
  return cache
}

export function saveSettings(next: Settings): Settings {
  cache = deepMerge(DEFAULT_SETTINGS, next)
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(cache, null, 2), 'utf-8')
  return cache
}

export function patchSettings(partial: Partial<Settings>): Settings {
  return saveSettings(deepMerge(loadSettings(), partial))
}
