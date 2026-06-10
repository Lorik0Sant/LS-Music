import { ProviderId } from '../../shared/types'
import { loadSettings } from '../config'
import { MusicProvider } from './provider'
import { SpotifyProvider } from './spotify'
import { YandexProvider } from './yandex'
import { YoutubeProvider } from './youtube'

const providers: Record<ProviderId, MusicProvider> = {
  yandex: new YandexProvider(),
  spotify: new SpotifyProvider(),
  youtube: new YoutubeProvider()
}

export function getProvider(id: ProviderId): MusicProvider {
  return providers[id]
}

export function listProviders(): MusicProvider[] {
  return Object.values(providers)
}

/** The provider currently used to fulfil track requests. */
export function activeProvider(): MusicProvider {
  return providers[loadSettings().activeProvider] ?? providers.yandex
}

export type { MusicProvider }
