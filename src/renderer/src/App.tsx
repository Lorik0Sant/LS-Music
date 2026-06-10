import { useEffect, useRef, useState } from 'react'
import logo from './logo.png'
import { AUTHOR, LINKS, USDT_TRC20 } from '../../shared/links'
import type {
  AppStatus,
  ConnectionState,
  LogEntry,
  QueueItem,
  Settings,
  TwitchReward
} from '../../shared/types'

const stateLabel: Record<ConnectionState, string> = {
  disconnected: 'не подключено',
  connecting: 'подключение…',
  connected: 'подключено',
  error: 'ошибка'
}

function Pill({ label, state }: { label: string; state: ConnectionState }): JSX.Element {
  return (
    <span className={`pill pill--${state}`}>
      <span className="dot" />
      {label}: {stateLabel[state]}
    </span>
  )
}

function Section({
  title,
  desc,
  children
}: {
  title: string
  desc?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="card">
      <h2>{title}</h2>
      {desc && <p className="muted">{desc}</p>}
      {children}
    </section>
  )
}

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [overlayUrl, setOverlayUrl] = useState('')
  const [rewards, setRewards] = useState<TwitchReward[]>([])
  const [twitchMsg, setTwitchMsg] = useState('')
  const [yandexMsg, setYandexMsg] = useState('')
  const [spotifyMsg, setSpotifyMsg] = useState('')
  const [manual, setManual] = useState('')
  const [version, setVersion] = useState('')
  const [modal, setModal] = useState<null | 'about' | 'donate'>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.getStatus().then(setStatus)
    window.api.queueList().then(setQueue)
    window.api.getOverlayUrl().then(setOverlayUrl)
    window.api.getVersion().then(setVersion)
    const offs = [
      window.api.onStatus(setStatus),
      window.api.onQueue(setQueue),
      window.api.onLog((e) => setLogs((l) => [...l.slice(-200), e]))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [logs])

  if (!settings || !status) return <div className="loading">Загрузка…</div>

  async function persist(next: Settings): Promise<void> {
    const saved = await window.api.saveSettings(next)
    setSettings(saved)
  }
  const patch = (p: Partial<Settings>): Promise<void> => persist({ ...settings!, ...p })

  async function loginTwitch(): Promise<void> {
    if (!settings!.twitch.clientId.trim()) {
      alert(
        'Для входа в Twitch нужен Client ID (один раз).\n\n' +
          '1. Откройте dev.twitch.tv/console/apps → Register Your Application\n' +
          '2. OAuth Redirect URL: http://localhost\n' +
          '3. Скопируйте Client ID в раздел «Расширенно» ниже.'
      )
      return
    }
    await persist(settings!)
    setTwitchMsg('Открываю окно входа…')
    const r = await window.api.twitchLogin()
    setTwitchMsg(r.ok ? '✓ Вход выполнен' : '✗ ' + r.error)
  }

  async function loadRewards(): Promise<void> {
    try {
      setRewards(await window.api.twitchRewards())
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function verifyYandex(): Promise<void> {
    setYandexMsg('Проверяем…')
    const r = await window.api.verifyProvider('yandex')
    setYandexMsg(r.ok ? '✓ Токен работает' : '✗ ' + r.error)
  }

  async function loginYandex(): Promise<void> {
    setYandexMsg('Открываю окно входа…')
    const r = await window.api.yandexLogin()
    setYandexMsg(r.ok ? '✓ Вход выполнен' : '✗ ' + r.error)
    if (r.ok) window.api.getSettings().then(setSettings)
  }

  async function verifySpotify(): Promise<void> {
    setSpotifyMsg('Проверяем…')
    const r = await window.api.verifyProvider('spotify')
    setSpotifyMsg(r.ok ? '✓ Работает' : '✗ ' + r.error)
  }

  async function loginSpotify(): Promise<void> {
    if (!settings!.spotify.clientId.trim()) {
      alert(
        'Для входа в Spotify нужен Client ID (один раз).\n\n' +
          '1. Откройте developer.spotify.com/dashboard → Create app\n' +
          '2. Redirect URI: http://127.0.0.1:8765/callback\n' +
          '3. Скопируйте Client ID в раздел «Расширенно» ниже.'
      )
      return
    }
    await persist(settings!)
    setSpotifyMsg('Открываю окно входа…')
    const r = await window.api.spotifyLogin()
    if (r.ok) {
      setSpotifyMsg('✓ Вход выполнен')
      window.api.getSettings().then(setSettings)
    } else {
      setSpotifyMsg('✗ ' + r.error)
      alert(
        'Не удалось войти в Spotify: ' +
          (r.error || '') +
          '\n\nЧаще всего причина — Redirect URI. В кабинете Spotify (Settings) ' +
          'в поле Redirect URIs должно быть ТОЧНО:\n\n  http://127.0.0.1:8765/callback\n\n' +
          'Без лишнего слэша в конце, именно 127.0.0.1 (не localhost), и нажми Save.'
      )
    }
  }

  const t = settings.twitch
  const np = status.nowPlaying

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo-img" src={logo} alt="LS" /> LS Music
          {version && <span className="ver">v{version}</span>}
        </div>
        <div className="pills">
          <Pill label="Twitch" state={status.twitch} />
          <Pill label="Яндекс" state={status.yandex} />
          <Pill label="Spotify" state={status.spotify} />
          <Pill label="YouTube" state={status.youtube} />
          <span className="pill pill--info">OBS: {status.overlayClients}</span>
        </div>
      </header>

      <nav className="topnav">
        <button onClick={() => setModal('about')}>О сервисе</button>
        <button onClick={() => window.api.openExternal(LINKS.github)}>GitHub</button>
        <button onClick={() => window.api.openExternal(LINKS.vpnBot)}>Купить VPN</button>
        <button onClick={() => setModal('donate')}>Поддержать проект</button>
        <button onClick={() => window.api.checkUpdates()}>Обновить</button>
        <button className="nav-exit" onClick={() => window.api.quit()}>
          Выход
        </button>
      </nav>

      {modal === 'about' && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <img className="modal-logo" src={logo} alt="" />
            <h2>LS Music {version && <span className="ver">v{version}</span>}</h2>
            <p className="muted">
              Музыка по баллам канала Twitch с анимацией винила для OBS. Яндекс.Музыка,
              Spotify и YouTube.
            </p>
            <p>
              Автор: <b>{AUTHOR}</b>
            </p>
            <div className="row">
              <button className="primary" onClick={() => window.api.openExternal(LINKS.twitch)}>
                Twitch автора
              </button>
              <button className="ghost" onClick={() => window.api.openExternal(LINKS.github)}>
                GitHub
              </button>
              <button className="ghost" onClick={() => setModal(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'donate' && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Поддержать проект 💜</h2>
            <p className="muted">Спасибо, что помогаешь развивать LS Music!</p>
            <button className="primary big" onClick={() => window.api.openExternal(LINKS.donate)}>
              DonationAlerts
            </button>
            <label className="field">
              <span>USDT (TRC20)</span>
              <div className="copyrow">
                <code className="url">{USDT_TRC20}</code>
                <button className="icon" onClick={() => navigator.clipboard.writeText(USDT_TRC20)}>
                  📋
                </button>
              </div>
            </label>
            <div className="row">
              <button className="ghost" onClick={() => setModal(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="grid">
        {/* Active provider -------------------------------------------------*/}
        <Section title="Источник музыки" desc="Какой сервис проигрывает заказы зрителей.">
          <div className="seg">
            <button
              className={settings.activeProvider === 'youtube' ? 'seg-on' : ''}
              onClick={() => patch({ activeProvider: 'youtube' })}
            >
              YouTube
            </button>
            <button
              className={settings.activeProvider === 'yandex' ? 'seg-on' : ''}
              onClick={() => patch({ activeProvider: 'yandex' })}
            >
              Яндекс.Музыка
            </button>
            <button
              className={settings.activeProvider === 'spotify' ? 'seg-on' : ''}
              onClick={() => patch({ activeProvider: 'spotify' })}
            >
              Spotify
            </button>
          </div>
          <p className="muted small">
            {settings.activeProvider === 'youtube' && (
              <>
                <b>YouTube</b> — бесплатно для всех, ничего настраивать не нужно. Трек
                играет прямо в оверлее.
              </>
            )}
            {settings.activeProvider === 'yandex' && (
              <>
                <b>Яндекс.Музыка</b> — полноценный трек в оверлее только с подпиской
                Плюс. Без Плюса будет реклама — для бесплатного выбери YouTube.
              </>
            )}
            {settings.activeProvider === 'spotify' && (
              <>
                <b>Spotify</b> — играет в приложении Spotify (без Premium с рекламой).
              </>
            )}
          </p>
        </Section>

        {/* Twitch ----------------------------------------------------------*/}
        <Section title="Twitch" desc="Войдите — и слушаем активацию награды за баллы канала.">
          {status.twitch === 'connected' ? (
            <div className="row">
              <span className="ok">✓ {status.twitchUser}</span>
              <button className="ghost" onClick={() => window.api.twitchDisconnect()}>
                Отключить
              </button>
              <button className="ghost" onClick={() => window.api.twitchLogout()}>
                Выйти
              </button>
            </div>
          ) : (
            <button className="primary big" onClick={loginTwitch}>
              Войти через Twitch
            </button>
          )}
          <p className="muted small">{twitchMsg}</p>

          <details className="adv">
            <summary>Расширенно (Client ID — один раз)</summary>
            <p className="muted small">
              Twitch требует свой Client ID. Создайте приложение на dev.twitch.tv,
              добавьте Redirect URI <code>http://localhost</code>, вставьте Client ID.
            </p>
            <label className="field">
              <span>Client ID</span>
              <input
                type="text"
                value={t.clientId}
                placeholder="abcd1234..."
                onChange={(e) => setSettings({ ...settings, twitch: { ...t, clientId: e.target.value } })}
                onBlur={() => patch({ twitch: { ...settings.twitch } })}
              />
            </label>
          </details>

          <div className="reward">
            <div className="row">
              <button className="ghost" onClick={loadRewards} disabled={status.twitch !== 'connected'}>
                Загрузить награды
              </button>
              <span className="muted">Текущая: {t.rewardTitle || '—'}</span>
            </div>
            {rewards.length > 0 && (
              <select
                value={t.rewardId ?? ''}
                onChange={(e) => {
                  const r = rewards.find((x) => x.id === e.target.value)
                  patch({ twitch: { ...t, rewardId: r?.id ?? null, rewardTitle: r?.title ?? '' } })
                }}
              >
                <option value="">— любая награда —</option>
                {rewards.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.cost})
                  </option>
                ))}
              </select>
            )}
          </div>
        </Section>

        {/* Yandex ----------------------------------------------------------*/}
        <Section title="Яндекс.Музыка" desc="Просто войдите в свой аккаунт — токен подтянется сам.">
          {status.yandex === 'connected' || settings.yandex.token ? (
            <div className="row">
              <span className="ok">✓ Аккаунт привязан</span>
              <button className="ghost" onClick={() => window.api.providerLogout('yandex')}>
                Выйти
              </button>
              <button className="ghost" onClick={verifyYandex}>
                Проверить
              </button>
            </div>
          ) : (
            <button className="primary big" onClick={loginYandex}>
              Войти через Яндекс
            </button>
          )}
          <div className="field">
            <span>Режим воспроизведения</span>
            <div className="seg">
              <button
                className={settings.yandex.mode === 'stream' ? 'seg-on' : ''}
                onClick={() => patch({ yandex: { ...settings.yandex, mode: 'stream' } })}
              >
                В оверлее (рекомендуется)
              </button>
              <button
                className={settings.yandex.mode === 'app' ? 'seg-on' : ''}
                onClick={() => patch({ yandex: { ...settings.yandex, mode: 'app' } })}
              >
                Через приложение Яндекса
              </button>
            </div>
          </div>
          <p className="muted small">{yandexMsg}</p>
        </Section>

        {/* Spotify ---------------------------------------------------------*/}
        <Section
          title="Spotify"
          desc="Войдите в аккаунт. Воспроизведение — в приложении Spotify: бесплатно с рекламой, Premium — без."
        >
          {status.spotify === 'connected' || settings.spotify.accessToken ? (
            <div className="row">
              <span className="ok">✓ Аккаунт привязан</span>
              <button className="ghost" onClick={() => window.api.providerLogout('spotify')}>
                Выйти
              </button>
              <button className="ghost" onClick={verifySpotify}>
                Проверить
              </button>
            </div>
          ) : (
            <button className="primary big" onClick={loginSpotify}>
              Войти через Spotify
            </button>
          )}
          <div className="field">
            <span>Режим воспроизведения</span>
            <div className="seg">
              <button
                className={settings.spotify.mode === 'app' ? 'seg-on' : ''}
                onClick={() => patch({ spotify: { ...settings.spotify, mode: 'app' } })}
              >
                Приложение (полный трек)
              </button>
              <button
                className={settings.spotify.mode === 'preview' ? 'seg-on' : ''}
                onClick={() => patch({ spotify: { ...settings.spotify, mode: 'preview' } })}
              >
                Превью 30 сек (в оверлее)
              </button>
            </div>
          </div>
          <p className="muted small">{spotifyMsg}</p>
          <details className="adv">
            <summary>Как включить Spotify (Client ID — один раз)</summary>
            <ol className="steps">
              <li>
                Открой кабинет разработчика Spotify и войди:{' '}
                <button
                  className="link"
                  onClick={() => window.api.openExternal('https://developer.spotify.com/dashboard')}
                >
                  developer.spotify.com/dashboard ↗
                </button>
              </li>
              <li>Нажми <b>Create app</b>. Название и описание — любые.</li>
              <li>
                В поле <b>Redirect URI</b> вставь и нажми Add:
                <div className="copyrow">
                  <code>http://127.0.0.1:8765/callback</code>
                  <button
                    className="icon"
                    title="Копировать"
                    onClick={() => navigator.clipboard.writeText('http://127.0.0.1:8765/callback')}
                  >
                    📋
                  </button>
                </div>
              </li>
              <li>Отметь <b>Web API</b>, прими условия, нажми <b>Save</b>.</li>
              <li>Открой приложение → <b>Settings</b> → скопируй <b>Client ID</b> сюда:</li>
            </ol>
            <label className="field">
              <span>Client ID</span>
              <input
                type="text"
                value={settings.spotify.clientId}
                placeholder="вставь Client ID из кабинета Spotify"
                onChange={(e) =>
                  setSettings({ ...settings, spotify: { ...settings.spotify, clientId: e.target.value } })
                }
                onBlur={() => patch({ spotify: { ...settings.spotify } })}
              />
            </label>
            <p className="muted small">
              После этого жми «Войти через Spotify». Без Premium трек играет в
              приложении Spotify с рекламой; с Premium — без.
            </p>
          </details>
        </Section>

        {/* Overlay ---------------------------------------------------------*/}
        <Section title="Оверлей для OBS" desc="Добавьте Browser Source с этим адресом (фон прозрачный).">
          <div className="row url-row">
            <code className="url">{overlayUrl}</code>
            <button className="ghost" onClick={() => navigator.clipboard.writeText(overlayUrl)}>
              Копировать
            </button>
          </div>

          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.overlay.vinylEnabled}
              onChange={(e) => {
                const v = e.target.checked
                // Update the UI instantly, then sync to the overlay.
                setSettings({ ...settings, overlay: { ...settings.overlay, vinylEnabled: v } })
                window.api.toggleVinyl(v)
              }}
            />
            <span>Анимация винила {settings.overlay.vinylEnabled ? 'вкл' : 'выкл'}</span>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.overlay.showNowPlaying}
              onChange={(e) =>
                patch({ overlay: { ...settings.overlay, showNowPlaying: e.target.checked } })
              }
            />
            <span>Показывать «сейчас играет»</span>
          </label>

          <label className="field">
            <span>Громкость: {Math.round(settings.overlay.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.overlay.volume}
              onChange={(e) =>
                patch({ overlay: { ...settings.overlay, volume: Number(e.target.value) } })
              }
            />
          </label>

          <label className="field">
            <span>
              Скрывать винил через:{' '}
              {settings.overlay.displaySeconds === 0
                ? 'весь трек'
                : `${settings.overlay.displaySeconds} сек`}
            </span>
            <input
              type="range"
              min={0}
              max={60}
              step={1}
              value={settings.overlay.displaySeconds}
              onChange={(e) =>
                patch({ overlay: { ...settings.overlay, displaySeconds: Number(e.target.value) } })
              }
            />
            <span className="muted small">
              0 = показывать весь трек. Звук продолжает играть после скрытия.
            </span>
          </label>

          <label className="field">
            <span>Порт (применится после перезапуска)</span>
            <input
              type="number"
              value={settings.overlay.port}
              onChange={(e) => setSettings({ ...settings, overlay: { ...settings.overlay, port: Number(e.target.value) } })}
              onBlur={() => patch({ overlay: { ...settings.overlay } })}
            />
          </label>
        </Section>

        {/* Queue -----------------------------------------------------------*/}
        <Section title="Очередь" desc="Заказы зрителей. Можно протестировать вручную.">
          {np ? (
            <div className="now">
              {np.track.coverUrl && <img src={np.track.coverUrl} alt="" />}
              <div>
                <div className="now-title">{np.track.title}</div>
                <div className="muted">{np.track.artists.join(', ')}</div>
                <div className="muted small">заказал: {np.requestedBy}</div>
              </div>
            </div>
          ) : (
            <p className="muted">Ничего не играет.</p>
          )}

          <ol className="queue">
            {queue.map((q, i) => (
              <li key={q.id}>
                <span className="q-title">
                  {q.track.artists.join(', ')} — {q.track.title}
                  <span className="muted small"> · {q.requestedBy}</span>
                </span>
                <span className="q-actions">
                  <button
                    className="icon"
                    title="Вверх"
                    disabled={i === 0}
                    onClick={() => window.api.queueMove(q.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="icon"
                    title="Вниз"
                    disabled={i === queue.length - 1}
                    onClick={() => window.api.queueMove(q.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="icon danger"
                    title="Удалить"
                    onClick={() => window.api.queueRemove(q.id)}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
            {queue.length === 0 && <li className="muted">Очередь пуста</li>}
          </ol>

          <div className="row">
            <button className="ghost" onClick={() => window.api.queueSkip()}>
              Пропустить
            </button>
            <button className="ghost" onClick={() => window.api.queueClear()}>
              Очистить
            </button>
          </div>

          <div className="row">
            <input
              type="text"
              placeholder="тест: название трека"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manual.trim()) {
                  window.api.queueRequest(manual.trim())
                  setManual('')
                }
              }}
            />
            <button
              className="primary"
              onClick={() => {
                if (manual.trim()) {
                  window.api.queueRequest(manual.trim())
                  setManual('')
                }
              }}
            >
              В очередь
            </button>
          </div>
        </Section>

        {/* Log -------------------------------------------------------------*/}
        <Section title="Лог">
          <div className="log" ref={logRef}>
            {logs.map((l, i) => (
              <div key={i} className={`log-line log-${l.level}`}>
                <span className="muted small">{new Date(l.ts).toLocaleTimeString()}</span> {l.message}
              </div>
            ))}
            {logs.length === 0 && <div className="muted">Событий пока нет</div>}
          </div>
        </Section>
      </main>
    </div>
  )
}
