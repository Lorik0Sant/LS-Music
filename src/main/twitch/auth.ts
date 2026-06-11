import { DeviceAuthInfo, TwitchReward } from '../../shared/types'
import { bus } from '../bus'
import { loadSettings, patchSettings } from '../config'

const ID_BASE = 'https://id.twitch.tv/oauth2'
const HELIX = 'https://api.twitch.tv/helix'
const SCOPES = ['channel:read:redemptions', 'channel:manage:redemptions']

export interface DeviceCodeStart extends DeviceAuthInfo {
  deviceCode: string
  interval: number
}

/** Step 1 of the Device Code Flow — get a user code to show the streamer. */
export async function startDeviceAuth(): Promise<DeviceCodeStart> {
  const clientId = loadSettings().twitch.clientId.trim()
  if (!clientId) throw new Error('Укажите Twitch Client-ID в настройках')

  const res = await fetch(`${ID_BASE}/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scopes: SCOPES.join(' ') })
  })
  if (!res.ok) throw new Error(`Twitch /device: ошибка ${res.status}`)
  const d = (await res.json()) as any
  return {
    deviceCode: d.device_code,
    userCode: d.user_code,
    verificationUri: d.verification_uri,
    expiresIn: d.expires_in,
    interval: d.interval ?? 5
  }
}

/** Step 2 — poll until the streamer authorizes, then persist the tokens. */
export async function pollDeviceToken(start: DeviceCodeStart): Promise<void> {
  const clientId = loadSettings().twitch.clientId.trim()
  const deadline = Date.now() + start.expiresIn * 1000
  const intervalMs = Math.max(start.interval, 1) * 1000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs))
    const res = await fetch(`${ID_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: start.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })
    const data = (await res.json()) as any
    if (res.ok && data.access_token) {
      patchSettings({
        twitch: {
          ...loadSettings().twitch,
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? null
        }
      })
      await fetchSelf()
      bus.info('Twitch авторизация успешна')
      return
    }
    // authorization_pending / slow_down -> keep polling; anything else is fatal.
    if (data.message && data.message !== 'authorization_pending') {
      if (String(data.message).includes('slow_down')) continue
      throw new Error(`Twitch авторизация: ${data.message}`)
    }
  }
  throw new Error('Срок действия кода истёк, попробуйте снова')
}

function authHeaders(): Record<string, string> {
  const s = loadSettings().twitch
  return {
    'Client-Id': s.clientId,
    Authorization: `Bearer ${s.accessToken}`
  }
}

/** Resolve and store the authorized user's id + login. */
export async function fetchSelf(): Promise<{ id: string; login: string }> {
  const res = await fetch(`${HELIX}/users`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Helix /users: ошибка ${res.status}`)
  const data = (await res.json()) as any
  const me = data?.data?.[0]
  if (!me) throw new Error('Не удалось получить аккаунт Twitch')
  patchSettings({
    twitch: { ...loadSettings().twitch, userId: me.id, channelLogin: me.login }
  })
  return { id: me.id, login: me.login }
}

export async function validateToken(): Promise<boolean> {
  const token = loadSettings().twitch.accessToken
  if (!token) return false
  const res = await fetch(`${ID_BASE}/validate`, {
    headers: { Authorization: `OAuth ${token}` }
  })
  return res.ok
}

export async function listRewards(): Promise<TwitchReward[]> {
  const s = loadSettings().twitch
  if (!s.userId) throw new Error('Сначала авторизуйтесь в Twitch')
  const res = await fetch(
    `${HELIX}/channel_points/custom_rewards?broadcaster_id=${s.userId}`,
    { headers: authHeaders() }
  )
  if (res.status === 403)
    throw new Error('Награды Channel Points доступны только аффилиатам/партнёрам')
  if (!res.ok) throw new Error(`Helix custom_rewards: ошибка ${res.status}`)
  const data = (await res.json()) as any
  return (data?.data ?? []).map((r: any) => ({ id: r.id, title: r.title, cost: r.cost }))
}

/** Create a Channel Points reward owned by this app (so we can refund it). */
export async function createReward(title: string, cost: number): Promise<TwitchReward> {
  const s = loadSettings().twitch
  if (!s.userId) throw new Error('Сначала авторизуйтесь в Twitch')
  const res = await fetch(`${HELIX}/channel_points/custom_rewards?broadcaster_id=${s.userId}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      cost,
      is_user_input_required: true,
      prompt: 'Напиши название трека (исполнитель — название)',
      should_redemptions_skip_request_queue: false
    })
  })
  if (res.status === 403)
    throw new Error('Награды доступны только аффилиатам/партнёрам Twitch')
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Создание награды: ошибка ${res.status} ${t}`)
  }
  const r = (await res.json()) as any
  const reward = r.data[0]
  return { id: reward.id, title: reward.title, cost: reward.cost }
}

/**
 * Mark a redemption FULFILLED (success) or CANCELED (refunds the points).
 * Works only for rewards created by THIS app's Client-ID.
 */
export async function updateRedemption(
  rewardId: string,
  redemptionId: string,
  status: 'FULFILLED' | 'CANCELED'
): Promise<void> {
  const s = loadSettings().twitch
  const url =
    `${HELIX}/channel_points/custom_rewards/redemptions` +
    `?id=${redemptionId}&broadcaster_id=${s.userId}&reward_id=${rewardId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`update redemption ${status}: ${res.status} ${t}`)
  }
}

export function logout(): void {
  patchSettings({
    twitch: {
      ...loadSettings().twitch,
      userId: null,
      accessToken: null,
      refreshToken: null
    }
  })
}
