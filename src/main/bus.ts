import { EventEmitter } from 'events'
import { AppStatus, LogEntry, QueueItem } from '../shared/types'

/**
 * Central event bus. Modules emit/listen here so they stay decoupled:
 * the Twitch client doesn't know about the queue, the queue doesn't know
 * about the overlay server, etc.
 */
class Bus extends EventEmitter {
  log(level: LogEntry['level'], message: string): void {
    const entry: LogEntry = { ts: Date.now(), level, message }
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : 'log'](`[${level}] ${message}`)
    this.emit('log', entry)
  }

  info(msg: string): void {
    this.log('info', msg)
  }
  warn(msg: string): void {
    this.log('warn', msg)
  }
  error(msg: string): void {
    this.log('error', msg)
  }
}

export interface BusEvents {
  log: (e: LogEntry) => void
  status: (s: AppStatus) => void
  'queue:update': (items: QueueItem[]) => void
  /** A viewer requested a track via Twitch Channel Points. */
  'request:track': (req: { query: string; requestedBy: string }) => void
}

export const bus = new Bus()
export type { Bus }
