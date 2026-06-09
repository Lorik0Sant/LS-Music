import { AppStatus } from '../shared/types'
import { bus } from './bus'
import { loadSettings } from './config'

const state: AppStatus = {
  twitch: 'disconnected',
  twitchUser: null,
  yandex: 'disconnected',
  spotify: 'disconnected',
  activeProvider: loadSettings().activeProvider,
  overlayClients: 0,
  nowPlaying: null,
  vinylEnabled: loadSettings().overlay.vinylEnabled
}

export function getStatus(): AppStatus {
  return { ...state }
}

export function setStatus(partial: Partial<AppStatus>): void {
  Object.assign(state, partial)
  bus.emit('status', getStatus())
}
