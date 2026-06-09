import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

/** Resolve the app icon (png) in dev and packaged builds. */
export function iconPath(): string {
  const candidates = [
    join(process.resourcesPath ?? '', 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(process.cwd(), 'resources', 'icon.png'),
    join(process.cwd(), 'build', 'icon.png')
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}
