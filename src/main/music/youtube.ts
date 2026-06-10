import { Playback, Track } from '../../shared/types'
import { MusicProvider } from './provider'

/**
 * YouTube provider — free for everyone, no API key, no subscription.
 * Search scrapes the public results page; playback happens in the overlay via
 * the YouTube IFrame player (so the track plays right in OBS with the vinyl).
 */
export class YoutubeProvider implements MusicProvider {
  readonly id = 'youtube' as const

  isConfigured(): boolean {
    return true
  }

  async verify(): Promise<void> {
    const t = await this.search('test')
    if (!t) throw new Error('YouTube: поиск не вернул результатов')
  }

  async search(query: string): Promise<Track | null> {
    // sp=EgIQAQ%3D%3D restricts results to videos only.
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        // Skip the EU consent interstitial that otherwise hides results.
        Cookie: 'CONSENT=YES+1; SOCS=CAI'
      }
    })
    if (!res.ok) throw new Error(`YouTube: ошибка поиска ${res.status}`)
    const html = await res.text()

    const idMatch = html.match(/"videoId":"([\w-]{11})"/)
    if (!idMatch) return null
    const videoId = idMatch[1]

    // Title: first videoRenderer title run after the matched id (best effort).
    let title = query
    const idx = html.indexOf(`"videoId":"${videoId}"`)
    const after = html.slice(idx, idx + 1200)
    const titleMatch = after.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/)
    if (titleMatch) {
      try {
        title = JSON.parse(`"${titleMatch[1]}"`)
      } catch {
        title = titleMatch[1]
      }
    }

    return {
      provider: 'youtube',
      id: videoId,
      title,
      artists: ['YouTube'],
      coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationMs: 0,
      externalUri: `https://youtu.be/${videoId}`
    }
  }

  async resolvePlayback(track: Track): Promise<Playback> {
    return { kind: 'youtube', videoId: track.id }
  }
}
