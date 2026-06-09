import { app } from 'electron'
import express from 'express'
import { existsSync } from 'fs'
import { createServer, Server } from 'http'
import { join } from 'path'
import { AddressInfo } from 'net'
import { WebSocket, WebSocketServer } from 'ws'
import { OverlayToServer, QueueItem, ServerToOverlay } from '../shared/types'
import { bus } from './bus'
import { loadSettings } from './config'
import { queue } from './queue'
import { setStatus } from './status'

let server: Server | null = null
let wss: WebSocketServer | null = null
let lastPlay: ServerToOverlay | null = null

function overlayDir(): string {
  const candidates = [
    join(process.resourcesPath ?? '', 'overlay'),
    join(app.getAppPath(), 'overlay'),
    join(process.cwd(), 'overlay')
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1]
}

function overlayConfig(): {
  volume: number
  vinylEnabled: boolean
  showNowPlaying: boolean
  displaySeconds: number
} {
  const s = loadSettings().overlay
  return {
    volume: s.volume,
    vinylEnabled: s.vinylEnabled,
    showNowPlaying: s.showNowPlaying,
    displaySeconds: s.displaySeconds
  }
}

function broadcast(msg: ServerToOverlay): void {
  const data = JSON.stringify(msg)
  wss?.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(data)
  })
}

function buildPlay(item: QueueItem): ServerToOverlay {
  return { type: 'play', item, ...overlayConfig() }
}

function refreshClientCount(): void {
  setStatus({ overlayClients: wss?.clients.size ?? 0 })
}

export async function startOverlayServer(): Promise<number> {
  if (server) return (server.address() as AddressInfo).port

  const port = loadSettings().overlay.port
  const appExpress = express()
  // Disable caching so OBS Browser Source always fetches the latest overlay
  // (otherwise it serves a stale cached page after the app is updated).
  appExpress.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    next()
  })
  appExpress.use(express.static(overlayDir(), { etag: false, lastModified: false }))
  appExpress.get('/health', (_req, res) => res.json({ ok: true }))

  server = createServer(appExpress)
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (socket) => {
    refreshClientCount()
    bus.info('OBS overlay подключился')
    // Re-send the current track so a freshly added Browser Source catches up.
    if (lastPlay) socket.send(JSON.stringify(lastPlay))
    else socket.send(JSON.stringify({ type: 'config', ...overlayConfig() } satisfies ServerToOverlay))

    socket.on('message', (raw) => {
      let msg: OverlayToServer
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (msg.type === 'ended') queue.onEnded(msg.queueItemId)
      else if (msg.type === 'error') bus.error(`Overlay: ${msg.message}`)
    })

    socket.on('close', () => {
      refreshClientCount()
      bus.info('OBS overlay отключился')
    })
  })

  bus.on('overlay:play', (item: QueueItem) => {
    lastPlay = buildPlay(item)
    broadcast(lastPlay)
  })
  bus.on('overlay:stop', () => {
    lastPlay = null
    broadcast({ type: 'stop' })
  })

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(port, '127.0.0.1', () => resolve())
  })

  const actual = (server.address() as AddressInfo).port
  bus.info(`Overlay-сервер запущен: http://127.0.0.1:${actual}/`)
  return actual
}

/** Push live config (vinyl toggle, volume) to all connected overlays. */
export function pushOverlayConfig(): void {
  broadcast({ type: 'config', ...overlayConfig() })
}

export function overlayUrl(): string {
  const port = server ? (server.address() as AddressInfo).port : loadSettings().overlay.port
  return `http://127.0.0.1:${port}/`
}
