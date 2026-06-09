import { randomUUID } from 'crypto'
import { QueueItem } from '../shared/types'
import { bus } from './bus'
import { activeProvider } from './music'
import { setStatus } from './status'

class PlaybackQueue {
  private pending: QueueItem[] = []
  private current: QueueItem | null = null

  init(): void {
    bus.on('request:track', ({ query, requestedBy }) => {
      void this.addRequest(query, requestedBy)
    })
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

  async addRequest(query: string, requestedBy: string): Promise<void> {
    const provider = activeProvider()
    if (!provider.isConfigured()) {
      bus.warn(`Запрос «${query}» проигнорирован: провайдер музыки не настроен`)
      return
    }
    try {
      bus.info(`Поиск «${query}» (заказал ${requestedBy})`)
      const track = await provider.search(query)
      if (!track) {
        bus.warn(`Ничего не найдено по запросу «${query}»`)
        return
      }
      track.streamUrl = await provider.resolveStreamUrl(track)
      const item: QueueItem = {
        id: randomUUID(),
        track,
        requestedBy,
        requestQuery: query,
        addedAt: Date.now()
      }
      this.pending.push(item)
      bus.info(`В очередь: ${track.artists.join(', ')} — ${track.title}`)
      this.emitQueue()
      if (!this.current) this.playNext()
    } catch (err) {
      bus.error(`Не удалось обработать «${query}»: ${(err as Error).message}`)
    }
  }

  playNext(): void {
    const next = this.pending.shift() ?? null
    this.current = next
    this.emitQueue()
    setStatus({ nowPlaying: next })
    if (next) {
      bus.emit('overlay:play', next)
      bus.info(`Сейчас играет: ${next.track.artists.join(', ')} — ${next.track.title}`)
    } else {
      bus.emit('overlay:stop')
    }
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

  clear(): void {
    this.pending = []
    this.current = null
    this.emitQueue()
    setStatus({ nowPlaying: null })
    bus.emit('overlay:stop')
    bus.info('Очередь очищена')
  }
}

export const queue = new PlaybackQueue()
