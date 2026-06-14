import { WebSocket } from 'ws'
import { bus } from '../bus'
import { loadSettings } from '../config'
import { twitchSilentLogin } from '../oauth'
import { setStatus } from '../status'
import { fetchSelf, validateToken } from './auth'

const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws'
const HELIX = 'https://api.twitch.tv/helix'
const REDEMPTION_ADD = 'channel.channel_points_custom_reward_redemption.add'
const REDEMPTION_UPDATE = 'channel.channel_points_custom_reward_redemption.update'

class TwitchEventSub {
  private ws: WebSocket | null = null
  private sessionId: string | null = null
  private manualClose = false
  private reconnectTimer: NodeJS.Timeout | null = null

  async connect(): Promise<void> {
    const s = loadSettings().twitch
    if (!s.clientId) throw new Error('Не указан Twitch Client-ID')
    if (!s.accessToken) throw new Error('Нет токена Twitch — авторизуйтесь')

    setStatus({ twitch: 'connecting' })
    if (!(await validateToken())) {
      // Token expired — try a silent refresh before giving up.
      const refreshed = await twitchSilentLogin()
      if (!refreshed || !(await validateToken())) {
        setStatus({ twitch: 'error' })
        throw new Error('Токен Twitch недействителен — войдите заново')
      }
    }
    if (!loadSettings().twitch.userId) await fetchSelf()

    this.manualClose = false
    this.openSocket(EVENTSUB_URL)
  }

  private openSocket(url: string): void {
    this.ws = new WebSocket(url)

    this.ws.on('message', (raw) => this.onMessage(String(raw)))
    this.ws.on('error', (err) => bus.error(`EventSub WS: ${err.message}`))
    this.ws.on('close', () => {
      if (this.manualClose) {
        setStatus({ twitch: 'disconnected', twitchUser: null })
      } else {
        setStatus({ twitch: 'error' })
        bus.warn('EventSub соединение закрыто — переподключаюсь…')
        this.scheduleReconnect()
      }
    })
  }

  private scheduleReconnect(): void {
    if (this.manualClose || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch((err) => bus.warn(`Переподключение Twitch: ${(err as Error).message}`))
    }, 8000)
  }

  private async onMessage(data: string): Promise<void> {
    let msg: any
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    const type = msg?.metadata?.message_type

    if (type === 'session_welcome') {
      this.sessionId = msg.payload.session.id
      try {
        await this.subscribe()
        const login = loadSettings().twitch.channelLogin
        setStatus({ twitch: 'connected', twitchUser: login })
        bus.info(`EventSub подключён как ${login}`)
      } catch (err) {
        setStatus({ twitch: 'error' })
        bus.error((err as Error).message)
      }
    } else if (type === 'session_reconnect') {
      const url = msg.payload.session.reconnect_url
      bus.info('EventSub: переподключение по запросу Twitch')
      this.ws?.removeAllListeners()
      this.openSocket(url)
    } else if (type === 'notification') {
      this.onNotification(msg)
    } else if (type === 'revocation') {
      setStatus({ twitch: 'error' })
      bus.warn('EventSub: подписка отозвана Twitch — переподключаюсь…')
      this.scheduleReconnect()
    }
  }

  private onNotification(msg: any): void {
    const type = msg?.metadata?.subscription_type
    const event = msg?.payload?.event
    if (!event) return
    const wantReward = loadSettings().twitch.rewardId
    if (wantReward && event.reward?.id !== wantReward) return

    const moderation = loadSettings().twitch.moderation
    const query = String(event.user_input ?? '').trim()
    const requestedBy = event.user_name || event.user_login || 'зритель'

    if (type === REDEMPTION_ADD) {
      if (!query) {
        bus.warn(`${requestedBy} активировал награду, но не указал трек`)
        return
      }
      if (moderation) {
        // Wait for the streamer/mods to accept it in Twitch's reward queue.
        bus.info(`Запрос от ${requestedBy} ждёт подтверждения: «${query}»`)
        return
      }
      // Auto mode: queue now, fulfil/refund the points ourselves.
      const redemption = { rewardId: event.reward?.id, redemptionId: event.id }
      bus.emit('request:track', { query, requestedBy, redemption })
    } else if (type === REDEMPTION_UPDATE) {
      // Only meaningful in moderation mode (otherwise we cause these ourselves).
      if (!moderation) return
      if (event.status === 'fulfilled') {
        bus.info(`Запрос подтверждён: «${query}» (${requestedBy})`)
        // No redemption ctx — Twitch already fulfilled it, don't touch points.
        if (query) bus.emit('request:track', { query, requestedBy })
      } else if (event.status === 'canceled') {
        bus.info(`Запрос отклонён, баллы возвращены: «${query}» (${requestedBy})`)
      }
    }
  }

  private async subscribe(): Promise<void> {
    const s = loadSettings().twitch
    // Subscribe to both add (new redemptions) and update (accepted/rejected by mods).
    for (const type of [REDEMPTION_ADD, REDEMPTION_UPDATE]) {
      const res = await fetch(`${HELIX}/eventsub/subscriptions`, {
        method: 'POST',
        headers: {
          'Client-Id': s.clientId,
          Authorization: `Bearer ${s.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type,
          version: '1',
          condition: { broadcaster_user_id: s.userId },
          transport: { method: 'websocket', session_id: this.sessionId }
        })
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Не удалось создать подписку EventSub ${type} (${res.status}): ${text}`)
      }
    }
  }

  disconnect(): void {
    this.manualClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.sessionId = null
    setStatus({ twitch: 'disconnected', twitchUser: null })
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const twitchEventSub = new TwitchEventSub()
