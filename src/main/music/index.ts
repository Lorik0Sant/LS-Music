import { ProviderId } from '../../shared/types'
import { MusicProvider } from './provider'
import { SpotifyProvider } from './spotify'
import { YandexProvider } from './yandex'

const providers: Record<ProviderId, MusicProvider> = {
  yandex: new YandexProvider(),
  spotify: new SpotifyProvider()
}

export function getProvider(id: ProviderId): MusicProvider {
  return providers[id]
}

export function listProviders(): MusicProvider[] {
  return Object.values(providers)
}

/** The provider currently used to fulfil track requests. */
export function activeProvider(): MusicProvider {
  // Yandex only for now; Spotify selection comes later.
  return providers.yandex
}

export type { MusicProvider }
