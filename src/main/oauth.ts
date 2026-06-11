import { BrowserWindow } from 'electron'
import { createHash, randomBytes } from 'crypto'
import { loadSettings, patchSettings } from './config'
import { bus } from './bus'

// Public client id of the Yandex Music app — lets anyone log in to get a
// music token with no app registration. (Public, not a secret.)
export const YANDEX_CLIENT_ID = '23cabbbdc6cd418abb4b39c32c41195d'

// Spotify needs your own app's Client ID (free, from developer.spotify.com).
// Bake a default here to make login zero-setup for end users, or leave empty
// and let the user paste it in the UI.
export const DEFAULT_SPOTIFY_CLIENT_ID = ''
export const SPOTIFY_REDIRECT = 'http://127.0.0.1:8765/callback'

// Twitch needs your own app's Client ID (free, from dev.twitch.tv). Bake a
// default here for zero-setup, or leave empty and paste it in the UI.
export const DEFAULT_TWITCH_CLIENT_ID = ''
export const TWITCH_REDIRECT = 'http://localhost'

/**
 * Open a login window, let the user sign in, and resolve with the redirect URL
 * once it matches `isDone`. Works for both implicit (token in #fragment) and
 * authorization-code (?code=) flows — we just sniff the navigation URLs.
 */
function openLoginWindow(
  authUrl: string,
  isDone: (url: string) => boolean,
  opts: { show?: boolean; timeoutMs?: number } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520,
      height: 720,
      title: 'Вход',
      show: opts.show !== false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:oauth' }
    })
    let settled = false
    let timer: NodeJS.Timeout | null = null
    const finish = (url: string): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(url)
      win.destroy()
    }
    const fail = (msg: string): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      reject(new Error(msg))
      if (!win.isDestroyed()) win.destroy()
    }
    const check = (url: string): void => {
      if (!settled && isDone(url)) finish(url)
    }
    const wc = win.webContents
    wc.on('will-redirect', (_e, url) => check(url))
    wc.on('will-navigate', (_e, url) => check(url))
    wc.on('did-navigate', (_e, url) => check(url))
    wc.on('did-navigate-in-page', (_e, url) => check(url))
    win.on('closed', () => {
      if (!settled) reject(new Error('Окно входа закрыто'))
    })
    if (opts.timeoutMs) timer = setTimeout(() => fail('Тайм-аут входа'), opts.timeoutMs)
    win.loadURL(authUrl)
  })
}

function fragmentParam(url: string, key: string): string | null {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : ''
  return new URLSearchParams(hash).get(key)
}
function queryParam(url: string, key: string): string | null {
  try {
    return new URL(url).searchParams.get(key)
  } catch {
    return null
  }
}

// ---- Yandex (implicit, zero-config) ---------------------------------------

export async function yandexLogin(): Promise<void> {
  const authUrl =
    `https://oauth.yandex.ru/authorize?response_type=token` +
    `&client_id=${YANDEX_CLIENT_ID}&force_confirm=yes`
  const url = await openLoginWindow(authUrl, (u) => u.includes('access_token='))
  const token = fragmentParam(url, 'access_token')
  if (!token) throw new Error('Не удалось получить токен Яндекса')
  patchSettings({ yandex: { ...loadSettings().yandex, token } })
  bus.info('Вход в Яндекс выполнен')
}

// ---- Twitch (implicit, popup login) ---------------------------------------

export function twitchClientId(): string {
  return (loadSettings().twitch.clientId || DEFAULT_TWITCH_CLIENT_ID).trim()
}

function twitchAuthUrl(forceVerify: boolean): string {
  const clientId = twitchClientId()
  const scope = 'channel:read:redemptions channel:manage:redemptions'
  return (
    `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT)}` +
    `&response_type=token&scope=${encodeURIComponent(scope)}` +
    (forceVerify ? '&force_verify=true' : '')
  )
}

export async function twitchLogin(): Promise<void> {
  const clientId = twitchClientId()
  if (!clientId) throw new Error('Укажите Twitch Client ID (dev.twitch.tv)')
  // Persist clientId so the rest of the app (EventSub) uses the same one.
  patchSettings({ twitch: { ...loadSettings().twitch, clientId } })

  const url = await openLoginWindow(
    twitchAuthUrl(true),
    (u) => u.startsWith(TWITCH_REDIRECT) && (u.includes('access_token=') || u.includes('error='))
  )
  if (url.includes('error=')) throw new Error('Twitch отказал в доступе')
  const token = fragmentParam(url, 'access_token')
  if (!token) throw new Error('Не удалось получить токен Twitch')
  patchSettings({ twitch: { ...loadSettings().twitch, accessToken: token } })
  bus.info('Вход в Twitch выполнен')
}

/**
 * Silent token refresh: re-run the implicit flow in a hidden window. If the
 * Twitch session cookie is still valid and the app is already authorized,
 * Twitch redirects straight back with a fresh token — no user interaction.
 * Throws on timeout (session expired -> caller should ask for a real login).
 */
export async function twitchSilentLogin(): Promise<boolean> {
  if (!twitchClientId()) return false
  try {
    const url = await openLoginWindow(
      twitchAuthUrl(false),
      (u) => u.startsWith(TWITCH_REDIRECT) && (u.includes('access_token=') || u.includes('error=')),
      { show: false, timeoutMs: 12000 }
    )
    const token = fragmentParam(url, 'access_token')
    if (!token) return false
    patchSettings({ twitch: { ...loadSettings().twitch, accessToken: token } })
    bus.info('Токен Twitch обновлён автоматически')
    return true
  } catch {
    return false
  }
}

// ---- Spotify (Authorization Code + PKCE, no secret) -----------------------

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function spotifyClientId(): string {
  return (loadSettings().spotify.clientId || DEFAULT_SPOTIFY_CLIENT_ID).trim()
}

export async function spotifyLogin(): Promise<void> {
  const clientId = spotifyClientId()
  if (!clientId) throw new Error('Укажите Spotify Client ID (developer.spotify.com)')

  const verifier = base64url(randomBytes(48))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const scope = 'user-read-playback-state user-modify-playback-state'
  const authUrl =
    `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT)}` +
    `&code_challenge_method=S256&code_challenge=${challenge}` +
    `&scope=${encodeURIComponent(scope)}`

  const url = await openLoginWindow(
    authUrl,
    (u) => u.startsWith(SPOTIFY_REDIRECT) && (u.includes('code=') || u.includes('error='))
  )
  const err = queryParam(url, 'error')
  if (err) throw new Error(`Spotify отказал: ${err}`)
  const code = queryParam(url, 'code')
  if (!code) throw new Error('Не удалось получить код авторизации Spotify')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT,
      client_id: clientId,
      code_verifier: verifier
    })
  })
  if (!res.ok) throw new Error(`Обмен кода Spotify: ошибка ${res.status}`)
  const data = (await res.json()) as any
  patchSettings({
    spotify: {
      ...loadSettings().spotify,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null
    }
  })
  bus.info('Вход в Spotify выполнен')
}

export async function spotifyRefresh(): Promise<string | null> {
  const s = loadSettings().spotify
  if (!s.refreshToken) return null
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: s.refreshToken,
      client_id: spotifyClientId()
    })
  })
  if (!res.ok) return null
  const data = (await res.json()) as any
  patchSettings({
    spotify: {
      ...loadSettings().spotify,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? s.refreshToken
    }
  })
  return data.access_token as string
}
