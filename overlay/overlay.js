/* LS Music — OBS overlay client. Plain ES, no build step. */
(() => {
  const el = (id) => document.getElementById(id)
  const card = el('card')
  const vinyl = el('vinyl')
  const disc = vinyl.querySelector('.disc')
  const cover = el('cover')
  const title = el('title')
  const artist = el('artist')
  const requester = el('requester')
  const bar = el('bar')
  const audio = el('audio')

  let current = null // current QueueItem
  let ws = null
  let reconnectTimer = null
  let hideTimer = null
  let displaySeconds = 0

  function applyConfig(cfg) {
    if (typeof cfg.volume === 'number') audio.volume = cfg.volume
    if (typeof cfg.displaySeconds === 'number') displaySeconds = cfg.displaySeconds
    vinyl.classList.toggle('hidden', cfg.vinylEnabled === false)
    card.classList.toggle('text-hidden', cfg.showNowPlaying === false)
  }

  function show(item, cfg) {
    current = item
    const t = item.track
    title.textContent = t.title || '—'
    artist.textContent = (t.artists || []).join(', ') || '—'
    requester.textContent = item.requestedBy ? `заказал: ${item.requestedBy}` : ''
    if (t.coverUrl) {
      cover.src = t.coverUrl
      cover.style.display = 'block'
    } else {
      cover.style.display = 'none'
    }
    applyConfig(cfg)

    bar.style.width = '0%'
    const pb = item.playback || {}
    if (pb.kind === 'audio' && pb.url) {
      // We play the audio ourselves (Yandex Plus stream or Spotify preview).
      audio.src = pb.url
      const playPromise = audio.play()
      if (playPromise && playPromise.catch) {
        playPromise.catch((err) => send({ type: 'error', message: 'autoplay: ' + err.message }))
      }
    } else {
      // External app plays the sound (e.g. Spotify desktop). Vinyl only.
      audio.removeAttribute('src')
      audio.load()
    }
    card.classList.add('visible')
    disc.classList.add('spinning')
    vinyl.classList.add('playing')

    // Auto-hide the card after N seconds (audio keeps playing). 0 = whole track.
    clearTimeout(hideTimer)
    if (displaySeconds > 0) {
      hideTimer = setTimeout(() => card.classList.remove('visible'), displaySeconds * 1000)
    }
  }

  function stop() {
    current = null
    clearTimeout(hideTimer)
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    card.classList.remove('visible')
    disc.classList.remove('spinning')
    vinyl.classList.remove('playing')
  }

  audio.addEventListener('timeupdate', () => {
    if (audio.duration) bar.style.width = (audio.currentTime / audio.duration) * 100 + '%'
  })
  audio.addEventListener('ended', () => {
    if (current) send({ type: 'ended', queueItemId: current.id })
  })
  audio.addEventListener('error', () => {
    if (current) {
      send({ type: 'error', message: 'audio error' })
      send({ type: 'ended', queueItemId: current.id })
    }
  })

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  function handle(msg) {
    if (msg.type === 'play') show(msg.item, msg)
    else if (msg.type === 'stop') stop()
    else if (msg.type === 'config') applyConfig(msg)
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onopen = () => {
      clearTimeout(reconnectTimer)
      send({ type: 'ready' })
    }
    ws.onmessage = (e) => {
      try {
        handle(JSON.parse(e.data))
      } catch (_) {
        /* ignore malformed */
      }
    }
    ws.onclose = () => {
      reconnectTimer = setTimeout(connect, 1500)
    }
    ws.onerror = () => ws.close()
  }

  connect()
})()
