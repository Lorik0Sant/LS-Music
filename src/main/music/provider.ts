import { Playback, ProviderId, Track } from '../../shared/types'

/**
 * A music source. Add a new service by implementing this interface and
 * registering it in ./index.ts — nothing else in the app needs to change.
 */
export interface MusicProvider {
  readonly id: ProviderId
  /** Whether the provider has the credentials it needs to work. */
  isConfigured(): boolean
  /** Verify credentials; throws with a human-readable message on failure. */
  verify(): Promise<void>
  /** Find the best matching track for a free-text query. */
  search(query: string): Promise<Track | null>
  /** Decide how to play a track (direct audio vs hand-off to the native app). */
  resolvePlayback(track: Track): Promise<Playback>
}
