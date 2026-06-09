import { createHash } from 'crypto'
import { Track } from '../../shared/types'
import { loadSettings } from '../config'
import { MusicProvider } from './provider'

const API = 'https://api.music.yandex.net'
// Salt used by the unofficial download-info signing algorithm.
const SIGN_SALT = 'XGRlBW9FXlekgbPrRHuSiA'

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `OAuth ${token}`,
    'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621',
    'User-Agent': 'Yandex-Music-API',
    'Accept-Language': 'ru'
  }
}

function pickCover(coverUri: string | undefined, size = '400x400'): string | undefined {
  if (!coverUri) return undefined
  return 'https://' + coverUri.replace('%%', size)
}

export class YandexProvider implements MusicProvider {
  readonly id = 'yandex' as const

  private token(): string {
    return loadSettings().yandex.token.trim()
  }

  isConfigured(): boolean {
    return this.token().length > 0
  }

  async verify(): Promise<void> {
    const token = this.token()
    if (!token) throw new Error('Не указан токен Яндекс.Музыки')
    const res = await fetch(`${API}/account/status`, { headers: authHeaders(token) })
    if (res.status === 401) throw new Error('Токен Яндекс.Музыки недействителен (401)')
    if (!res.ok) throw new Error(`Яндекс.Музыка ответила ${res.status}`)
    const data = (await res.json()) as any
    const login = data?.result?.account?.login
    if (!login) throw new Error('Не удалось прочитать аккаунт Яндекс.Музыки')
  }

  async search(query: string): Promise<Track | null> {
    const token = this.token()
    if (!token) throw new Error('Не указан токен Яндекс.Музыки')
    const url = `${API}/search?text=${encodeURIComponent(query)}&type=track&page=0&nocorrect=false`
    const res = await fetch(url, { headers: authHeaders(token) })
    if (!res.ok) throw new Error(`Поиск Яндекс.Музыки: ошибка ${res.status}`)
    const data = (await res.json()) as any
    const best = data?.result?.tracks?.results?.[0]
    if (!best) return null
    const albums = best.albums ?? []
    return {
      provider: 'yandex',
      id: String(best.id),
      title: best.title,
      artists: (best.artists ?? []).map((a: any) => a.name),
      coverUrl: pickCover(best.coverUri ?? albums[0]?.coverUri),
      durationMs: best.durationMs ?? 0
    }
  }

  async resolveStreamUrl(track: Track): Promise<string> {
    const token = this.token()
    if (!token) throw new Error('Не указан токен Яндекс.Музыки')

    const infoRes = await fetch(`${API}/tracks/${track.id}/download-info`, {
      headers: authHeaders(token)
    })
    if (!infoRes.ok) throw new Error(`download-info: ошибка ${infoRes.status}`)
    const infoData = (await infoRes.json()) as any
    const variants: any[] = infoData?.result ?? []
    const mp3 = variants
      .filter((v) => v.codec === 'mp3')
      .sort((a, b) => (b.bitrateInKbps ?? 0) - (a.bitrateInKbps ?? 0))[0]
    if (!mp3?.downloadInfoUrl) throw new Error('Нет доступного mp3-потока для трека')

    const dlRes = await fetch(`${mp3.downloadInfoUrl}&format=json`, {
      headers: authHeaders(token)
    })
    if (!dlRes.ok) throw new Error(`Получение ссылки: ошибка ${dlRes.status}`)
    const dl = (await dlRes.json()) as any
    const { host, path, ts, s } = dl
    if (!host || !path || !ts || !s) throw new Error('Некорректный ответ download-info')

    const sign = createHash('md5')
      .update(SIGN_SALT + path.substring(1) + s)
      .digest('hex')
    return `https://${host}/get-mp3/${sign}/${ts}${path}`
  }
}
