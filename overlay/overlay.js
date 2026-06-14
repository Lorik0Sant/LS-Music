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
  let volume = 0.8

  // ---- YouTube IFrame player ----------------------------------------------
  let ytPlayer = null
  let ytReady = false
  let pendingYt = null
  window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player('yt', {
      height: '180',
      width: '320',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: () => {
          ytReady = true
          if (pendingYt) {
            const v = pendingYt
            pendingYt = null
            playYt(v)
          }
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED && current) send({ type: 'ended', queueItemId: current.id })
        },
        onError: () => {
          if (current) send({ type: 'ended', queueItemId: current.id })
        }
      }
    })
  }
  function playYt(videoId) {
    if (!ytReady || !ytPlayer) {
      pendingYt = videoId
      return
    }
    try {
      ytPlayer.setVolume(Math.round(volume * 100))
      ytPlayer.loadVideoById(videoId)
      ytPlayer.playVideo()
    } catch (err) {
      send({ type: 'error', message: 'youtube: ' + err.message })
    }
  }
  function stopYt() {
    pendingYt = null
    if (ytReady && ytPlayer) {
      try {
        ytPlayer.stopVideo()
      } catch (_) {
        /* ignore */
      }
    }
  }

  function applyConfig(cfg) {
    if (typeof cfg.volume === 'number') {
      volume = cfg.volume
      audio.volume = cfg.volume
      if (ytReady && ytPlayer) ytPlayer.setVolume(Math.round(cfg.volume * 100))
    }
    if (typeof cfg.displaySeconds === 'number') displaySeconds = cfg.displaySeconds
    if (cfg.theme) document.body.dataset.theme = cfg.theme
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
    stopYt()
    if (pb.kind === 'audio' && pb.url) {
      // We play the audio ourselves (Yandex Plus stream or Spotify preview).
      audio.src = pb.url
      const playPromise = audio.play()
      if (playPromise && playPromise.catch) {
        playPromise.catch((err) => send({ type: 'error', message: 'autoplay: ' + err.message }))
      }
    } else if (pb.kind === 'youtube' && pb.videoId) {
      // Free playback for everyone — plays right here via the YouTube player.
      audio.removeAttribute('src')
      audio.load()
      playYt(pb.videoId)
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
    stopYt()
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

  function pause() {
    if (!audio.paused) audio.pause()
    if (ytReady && ytPlayer) {
      try {
        ytPlayer.pauseVideo()
      } catch (_) {
        /* ignore */
      }
    }
    disc.classList.remove('spinning')
  }

  function resume() {
    if (!current) return
    const pb = current.playback || {}
    if (pb.kind === 'youtube') {
      if (ytReady && ytPlayer) ytPlayer.playVideo()
    } else if (audio.src) {
      audio.play().catch(() => {})
    }
    disc.classList.add('spinning')
  }

  function handle(msg) {
    if (msg.type === 'play') show(msg.item, msg)
    else if (msg.type === 'stop') stop()
    else if (msg.type === 'pause') pause()
    else if (msg.type === 'resume') resume()
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
