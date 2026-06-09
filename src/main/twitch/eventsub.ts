import { WebSocket } from 'ws'
import { bus } from '../bus'
import { loadSettings } from '../config'
import { setStatus } from '../status'
import { fetchSelf, validateToken } from './auth'

const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws'
const HELIX = 'https://api.twitch.tv/helix'
const REDEMPTION_TYPE = 'channel.channel_points_custom_reward_redemption.add'

class TwitchEventSub {
  private ws: WebSocket | null = null
  private sessionId: string | null = null
  private manualClose = false

  async connect(): Promise<void> {
    const s = loadSettings().twitch
    if (!s.clientId) throw new Error('Не указан Twitch Client-ID')
    if (!s.accessToken) throw new Error('Нет токена Twitch — авторизуйтесь')

    setStatus({ twitch: 'connecting' })
    if (!(await validateToken())) {
      setStatus({ twitch: 'error' })
      throw new Error('Токен Twitch недействителен — авторизуйтесь заново')
    }
    if (!s.userId) await fetchSelf()

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
        bus.warn('EventSub соединение закрыто')
      }
    })
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
      bus.warn('EventSub: подписка отозвана Twitch')
    }
  }

  private onNotification(msg: any): void {
    if (msg?.metadata?.subscription_type !== REDEMPTION_TYPE) return
    const event = msg.payload.event
    const wantReward = loadSettings().twitch.rewardId
    if (wantReward && event.reward?.id !== wantReward) return

    const query = String(event.user_input ?? '').trim()
    const requestedBy = event.user_name || event.user_login || 'зритель'
    if (!query) {
      bus.warn(`${requestedBy} активировал награду, но не указал трек`)
      return
    }
    bus.emit('request:track', { query, requestedBy })
  }

  private async subscribe(): Promise<void> {
    const s = loadSettings().twitch
    const res = await fetch(`${HELIX}/eventsub/subscriptions`, {
      method: 'POST',
      headers: {
        'Client-Id': s.clientId,
        Authorization: `Bearer ${s.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: REDEMPTION_TYPE,
        version: '1',
        condition: { broadcaster_user_id: s.userId },
        transport: { method: 'websocket', session_id: this.sessionId }
      })
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Не удалось создать подписку EventSub (${res.status}): ${text}`)
    }
  }

  disconnect(): void {
    this.manualClose = true
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
