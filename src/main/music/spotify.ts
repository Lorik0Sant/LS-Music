import { Playback, Track } from '../../shared/types'
import { loadSettings } from '../config'
import { MusicProvider } from './provider'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'

/**
 * Spotify provider.
 *
 * Search uses the **Client Credentials** flow (app token, no user login,
 * works for everyone). Playback does NOT stream audio — the Web API never
 * exposes a stream URL. Instead:
 *   - `app` mode: hand `spotify:track:<id>` to the installed Spotify desktop
 *     app. Free accounts hear ads, Premium accounts don't. Works without login.
 *   - `preview` mode: play the 30-second `preview_url` in the overlay itself
 *     (no app, no ads), falling back to `app` mode when no preview exists.
 */
export class SpotifyProvider implements MusicProvider {
  readonly id = 'spotify' as const
  private token: { value: string; expiresAt: number } | null = null

  private creds(): { clientId: string; clientSecret: string } {
    const s = loadSettings().spotify
    return { clientId: s.clientId.trim(), clientSecret: s.clientSecret.trim() }
  }

  isConfigured(): boolean {
    const { clientId, clientSecret } = this.creds()
    return clientId.length > 0 && clientSecret.length > 0
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 5000) return this.token.value
    const { clientId, clientSecret } = this.creds()
    if (!clientId || !clientSecret) throw new Error('Укажите Spotify Client ID и Client Secret')

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' })
    })
    if (res.status === 400 || res.status === 401)
      throw new Error('Неверные Spotify Client ID / Secret')
    if (!res.ok) throw new Error(`Spotify token: ошибка ${res.status}`)
    const data = (await res.json()) as any
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000
    }
    return this.token.value
  }

  async verify(): Promise<void> {
    await this.getToken()
  }

  async search(query: string): Promise<Track | null> {
    const token = await this.getToken()
    const url = `${API}/search?type=track&limit=1&q=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
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
    if (mode === 'preview' && track.previewUrl) {
      return { kind: 'audio', url: track.previewUrl }
    }
    // app mode (default) or no preview available -> play in the Spotify app.
    return { kind: 'external', uri }
  }
}
