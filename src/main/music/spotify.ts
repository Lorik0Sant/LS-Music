import { Playback, Track } from '../../shared/types'
import { loadSettings } from '../config'
import { spotifyRefresh } from '../oauth'
import { MusicProvider } from './provider'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'

/**
 * Spotify provider.
 *
 * Preferred: the user logs in (Authorization Code + PKCE) and we use their
 * token. Fallback: Client-Credentials (needs Client ID + Secret) for search
 * only. Playback never streams audio — see resolvePlayback().
 */
export class SpotifyProvider implements MusicProvider {
  readonly id = 'spotify' as const
  private ccToken: { value: string; expiresAt: number } | null = null

  isConfigured(): boolean {
    const s = loadSettings().spotify
    return !!s.accessToken || (!!s.clientId.trim() && !!s.clientSecret.trim())
  }

  /** A bearer token: the logged-in user's token if present, else app token. */
  private async getToken(): Promise<{ token: string; user: boolean }> {
    const s = loadSettings().spotify
    if (s.accessToken) return { token: s.accessToken, user: true }
    return { token: await this.clientCredentials(), user: false }
  }

  private async clientCredentials(): Promise<string> {
    if (this.ccToken && Date.now() < this.ccToken.expiresAt - 5000) return this.ccToken.value
    const { clientId, clientSecret } = loadSettings().spotify
    if (!clientId.trim() || !clientSecret.trim())
      throw new Error('Войдите в Spotify или укажите Client ID + Secret')
    const basic = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString('base64')
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials' })
    })
    if (res.status === 400 || res.status === 401) throw new Error('Неверные Spotify Client ID / Secret')
    if (!res.ok) throw new Error(`Spotify token: ошибка ${res.status}`)
    const data = (await res.json()) as any
    this.ccToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
    return this.ccToken.value
  }

  /** GET with one automatic refresh-and-retry when a user token expires. */
  private async apiGet(path: string): Promise<Response> {
    const { token, user } = await this.getToken()
    let res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401 && user) {
      const fresh = await spotifyRefresh()
      if (fresh) res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${fresh}` } })
    }
    return res
  }

  async verify(): Promise<void> {
    const { user } = await this.getToken()
    if (user) {
      const res = await this.apiGet('/me')
      if (!res.ok) throw new Error(`Spotify /me: ошибка ${res.status}`)
    }
    // client-credentials token already validated by getToken()
  }

  async search(query: string): Promise<Track | null> {
    const res = await this.apiGet(`/search?type=track&limit=1&q=${encodeURIComponent(query)}`)
    if (!res.ok) throw new Error(`Spotify search: ошибка ${res.status}`)
    const data = (await res.json()) as any
    const t = data?.tracks?.items?.[0]
    if (!t) return null
    return {
      provider: 'spotify',
      id: t.id,
      title: t.name,
      artists: (t.artists ?? []).map((a: any) => a.name),
      coverUrl: t.album?.images?.[0]?.url,
      durationMs: t.duration_ms ?? 0,
      previewUrl: t.preview_url ?? undefined,
      externalUri: t.uri ?? `spotify:track:${t.id}`
    }
  }

  async resolvePlayback(track: Track): Promise<Playback> {
    const mode = loadSettings().spotify.mode
    const uri = track.externalUri ?? `spotify:track:${track.id}`
    if (mode === 'preview' && track.previewUrl) return { kind: 'audio', url: track.previewUrl }
    return { kind: 'external', uri }
  }
}
