import { ProviderId, Track } from '../../shared/types'

/**
 * A music source. Add Spotify later by implementing this same interface and
 * registering it — nothing else in the app needs to change.
 */
export interface MusicProvider {
  readonly id: ProviderId
  /** Whether the provider has the credentials it needs to work. */
  isConfigured(): boolean
  /** Verify credentials; throws with a human-readable message on failure. */
  verify(): Promise<void>
  /** Find the best matching track for a free-text query. */
  search(query: string): Promise<Track | null>
  /** Resolve a directly-playable audio URL for a track. */
  resolveStreamUrl(track: Track): Promise<string>
}
