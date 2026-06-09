import { useEffect, useRef, useState } from 'react'
import type {
  AppStatus,
  ConnectionState,
  DeviceAuthInfo,
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
  const [device, setDevice] = useState<DeviceAuthInfo | null>(null)
  const [rewards, setRewards] = useState<TwitchReward[]>([])
  const [yandexMsg, setYandexMsg] = useState('')
  const [manual, setManual] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.getStatus().then(setStatus)
    window.api.queueList().then(setQueue)
    window.api.getOverlayUrl().then(setOverlayUrl)
    const offs = [
      window.api.onStatus(setStatus),
      window.api.onQueue(setQueue),
      window.api.onLog((e) => setLogs((l) => [...l.slice(-200), e])),
      window.api.onTwitchAuth((r) => {
        setDevice(null)
        setYandexMsg('')
        if (!r.ok && r.error) alert('Twitch: ' + r.error)
      })
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

  async function startAuth(): Promise<void> {
    if (!settings!.twitch.clientId.trim()) {
      alert('Сначала укажите Twitch Client-ID')
      return
    }
    await persist(settings!) // make sure clientId is saved before auth
    const info = await window.api.twitchAuthStart()
    setDevice(info)
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
    const r = await window.api.yandexVerify()
    setYandexMsg(r.ok ? '✓ Токен работает' : '✗ ' + r.error)
  }

  const t = settings.twitch
  const np = status.nowPlaying

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◉</span> LS Music
        </div>
        <div className="pills">
          <Pill label="Twitch" state={status.twitch} />
          <Pill label="Яндекс" state={status.yandex} />
          <span className="pill pill--info">OBS: {status.overlayClients}</span>
        </div>
      </header>

      <main className="grid">
        {/* Twitch ----------------------------------------------------------*/}
        <Section
          title="Twitch"
          desc="Слушаем активацию награды за баллы канала. Нужен Client-ID приложения с dev.twitch.tv."
        >
          <label className="field">
            <span>Client-ID</span>
            <input
              type="text"
              value={t.clientId}
              placeholder="abcd1234..."
              onChange={(e) => setSettings({ ...settings, twitch: { ...t, clientId: e.target.value } })}
              onBlur={() => patch({ twitch: { ...settings.twitch } })}
            />
          </label>

          {status.twitch === 'connected' ? (
            <div className="row">
              <span className="ok">Авторизован: {status.twitchUser}</span>
              <button className="ghost" onClick={() => window.api.twitchDisconnect()}>
                Отключить
              </button>
              <button className="ghost" onClick={() => window.api.twitchLogout()}>
                Выйти
              </button>
            </div>
          ) : device ? (
            <div className="device">
              <p>
                Откройте{' '}
                <a href={device.verificationUri} target="_blank" rel="noreferrer">
                  {device.verificationUri}
                </a>{' '}
                и введите код:
              </p>
              <div className="code">{device.userCode}</div>
              <p className="muted">Ожидаем подтверждение…</p>
            </div>
          ) : (
            <button className="primary" onClick={startAuth}>
              Авторизоваться в Twitch
            </button>
          )}

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
        <Section title="Яндекс.Музыка" desc="Нужен OAuth-токен аккаунта с подпиской Плюс.">
          <label className="field">
            <span>Токен</span>
            <input
              type="password"
              value={settings.yandex.token}
              placeholder="y0_AgAAAA..."
              onChange={(e) => setSettings({ ...settings, yandex: { token: e.target.value } })}
              onBlur={() => patch({ yandex: { ...settings.yandex } })}
            />
          </label>
          <div className="row">
            <button className="primary" onClick={verifyYandex}>
              Проверить токен
            </button>
            <span className="muted">{yandexMsg}</span>
          </div>
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
              onChange={(e) => window.api.toggleVinyl(e.target.checked).then(() =>
                setSettings({ ...settings, overlay: { ...settings.overlay, vinylEnabled: e.target.checked } })
              )}
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
            {queue.map((q) => (
              <li key={q.id}>
                <span>
                  {q.track.artists.join(', ')} — {q.track.title}
                </span>
                <span className="muted small">{q.requestedBy}</span>
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
