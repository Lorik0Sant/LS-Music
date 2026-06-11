import { randomUUID } from 'crypto'
import { shell } from 'electron'
import { QueueItem } from '../shared/types'
import { bus } from './bus'
import { activeProvider } from './music'
import { setStatus } from './status'
import { updateRedemption } from './twitch/auth'

/** Channel Points redemption context, so we can fulfil/refund the points. */
export interface Redemption {
  rewardId: string
  redemptionId: string
}

class PlaybackQueue {
  private pending: QueueItem[] = []
  private current: QueueItem | null = null
  private externalTimer: NodeJS.Timeout | null = null

  init(): void {
    bus.on('request:track', ({ query, requestedBy, redemption }) => {
      void this.addRequest(query, requestedBy, redemption)
    })
  }

  /** Refund the viewer's points (CANCELED) or mark done (FULFILLED). */
  private async resolveRedemption(
    redemption: Redemption | undefined,
    status: 'FULFILLED' | 'CANCELED'
  ): Promise<void> {
    if (!redemption) return
    try {
      await updateRedemption(redemption.rewardId, redemption.redemptionId, status)
      if (status === 'CANCELED') bus.info('Баллы возвращены зрителю (трек не найден)')
    } catch (err) {
      bus.warn(
        `Не удалось ${status === 'CANCELED' ? 'вернуть баллы' : 'отметить награду'}: ` +
          `${(err as Error).message}. Возврат работает только для награды, созданной этим приложением.`
      )
    }
  }

  list(): QueueItem[] {
    return [...this.pending]
  }

  nowPlaying(): QueueItem | null {
    return this.current
  }

  private emitQueue(): void {
    bus.emit('queue:update', this.list())
  }

  async addRequest(query: string, requestedBy: string, redemption?: Redemption): Promise<void> {
    const provider = activeProvider()
    if (!provider.isConfigured()) {
      bus.warn(`Запрос «${query}» проигнорирован: провайдер музыки не настроен`)
      await this.resolveRedemption(redemption, 'CANCELED')
      return
    }
    try {
      bus.info(`Поиск «${query}» в ${provider.id} (заказал ${requestedBy})`)
      const track = await provider.search(query)
      if (!track) {
        bus.warn(`Ничего не найдено по запросу «${query}»`)
        await this.resolveRedemption(redemption, 'CANCELED')
        return
      }
      const playback = await provider.resolvePlayback(track)
      const item: QueueItem = {
        id: randomUUID(),
        track,
        playback,
        requestedBy,
        requestQuery: query,
        addedAt: Date.now()
      }
      this.pending.push(item)
      bus.info(`В очередь: ${track.artists.join(', ')} — ${track.title}`)
      this.emitQueue()
      await this.resolveRedemption(redemption, 'FULFILLED')
      if (!this.current) this.playNext()
    } catch (err) {
      bus.error(`Не удалось обработать «${query}»: ${(err as Error).message}`)
      await this.resolveRedemption(redemption, 'CANCELED')
    }
  }

  private clearTimer(): void {
    if (this.externalTimer) {
      clearTimeout(this.externalTimer)
      this.externalTimer = null
    }
  }

  playNext(): void {
    this.clearTimer()
    const next = this.pending.shift() ?? null
    this.current = next
    this.emitQueue()
    setStatus({ nowPlaying: next })

    if (!next) {
      bus.emit('overlay:stop')
      return
    }

    bus.emit('overlay:play', next)
    bus.info(`Сейчас играет: ${next.track.artists.join(', ')} — ${next.track.title}`)

    if (next.playback.kind === 'external') {
      // Hand off to the native app and advance ourselves when it should finish.
      shell.openExternal(next.playback.uri).catch((e) => bus.error(`openExternal: ${e.message}`))
      const ms = (next.track.durationMs || 180000) + 1500
      this.externalTimer = setTimeout(() => this.playNext(), ms)
    }
    // For 'audio' playback the overlay reports back via onEnded().
  }

  onEnded(queueItemId: string): void {
    if (this.current && this.current.id === queueItemId) {
      this.playNext()
    }
  }

  skip(): void {
    if (this.current || this.pending.length) {
      bus.info('Трек пропущен')
      this.playNext()
    }
  }

  /** Remove a queued track (or skip it if it's the one playing). */
  remove(id: string): void {
    if (this.current && this.current.id === id) {
      this.skip()
      return
    }
    const before = this.pending.length
    this.pending = this.pending.filter((i) => i.id !== id)
    if (this.pending.length !== before) {
      this.emitQueue()
      bus.info('Трек удалён из очереди')
    }
  }

  /** Move a queued track up (-1) or down (+1). */
  move(id: string, dir: -1 | 1): void {
    const idx = this.pending.findIndex((i) => i.id === id)
    if (idx === -1) return
    const target = idx + dir
    if (target < 0 || target >= this.pending.length) return
    const [item] = this.pending.splice(idx, 1)
    this.pending.splice(target, 0, item)
    this.emitQueue()
  }

  clear(): void {
    this.clearTimer()
    this.pending = []
    this.current = null
    this.emitQueue()
    setStatus({ nowPlaying: null })
    bus.emit('overlay:stop')
    bus.info('Очередь очищена')
  }
}

export const queue = new PlaybackQueue()
