import { Track } from '../../shared/types'
import { MusicProvider } from './provider'

/**
 * Placeholder Spotify provider. Implements the MusicProvider interface so the
 * rest of the app already supports it — fill these in when adding Spotify.
 *
 * Notes for the future implementation:
 *  - Auth: Authorization Code + PKCE (no client secret needed for a desktop app).
 *  - search(): GET https://api.spotify.com/v1/search?type=track
 *  - Playback: the Web API can only *control* an already-running Spotify client
 *    on a Premium account (PUT /v1/me/player/play). There is no direct stream
 *    URL, so resolveStreamUrl() can't return an <audio>-playable link — the
 *    overlay strategy will differ (control the desktop client + show the vinyl).
 */
export class SpotifyProvider implements MusicProvider {
  readonly id = 'spotify' as const

  isConfigured(): boolean {
    return false
  }

  async verify(): Promise<void> {
    throw new Error('Spotify ещё не подключён (запланировано)')
  }

  async search(_query: string): Promise<Track | null> {
    throw new Error('Spotify ещё не подключён (запланировано)')
  }

  async resolveStreamUrl(_track: Track): Promise<string> {
    throw new Error('Spotify ещё не подключён (запланировано)')
  }
}
