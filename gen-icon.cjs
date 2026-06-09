const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

const SIZE = 256
const html = `<!doctype html><html><body style="margin:0">
<canvas id="c" width="${SIZE}" height="${SIZE}"></canvas>
<script>
const ctx = document.getElementById('c').getContext('2d')
const S = ${SIZE}
// rounded gradient background
const g = ctx.createLinearGradient(0,0,S,S)
g.addColorStop(0,'#a970ff'); g.addColorStop(1,'#5b2bd6')
ctx.fillStyle = g
const r = 56
ctx.beginPath()
ctx.moveTo(r,0); ctx.arcTo(S,0,S,S,r); ctx.arcTo(S,S,0,S,r)
ctx.arcTo(0,S,0,0,r); ctx.arcTo(0,0,S,0,r); ctx.closePath(); ctx.fill()

// soft inner glow
const rg = ctx.createRadialGradient(S/2,90,10,S/2,90,170)
rg.addColorStop(0,'rgba(255,255,255,0.25)'); rg.addColorStop(1,'rgba(255,255,255,0)')
ctx.fillStyle = rg; ctx.fillRect(0,0,S,S)

// bunny
ctx.textAlign='center'; ctx.textBaseline='middle'
ctx.font='118px "Segoe UI Emoji"'
ctx.fillText('🐰', S/2, 96)

// LS wordmark
ctx.fillStyle='#ffffff'
ctx.font='800 92px "Segoe UI", Arial, sans-serif'
ctx.fillText('LS', S/2, 192)
window.__done = true
</script></body></html>`

app.whenReady().then(async () => {
  const os = require('os')
  const tmpHtml = join(os.tmpdir(), 'lsm-icon.html')
  writeFileSync(tmpHtml, '<meta charset="utf-8">' + html, 'utf8')
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false })
  await win.loadFile(tmpHtml)
  await new Promise((r) => setTimeout(r, 600))
  const dataUrl = await win.webContents.executeJavaScript(
    "document.getElementById('c').toDataURL('image/png')"
  )
  const png = Buffer.from(dataUrl.split(',')[1], 'base64')

  mkdirSync(join(__dirname, 'build'), { recursive: true })
  mkdirSync(join(__dirname, 'resources'), { recursive: true })
  writeFileSync(join(__dirname, 'resources', 'icon.png'), png)
  writeFileSync(join(__dirname, 'build', 'icon.png'), png)

  // Wrap the 256x256 PNG in an .ico container (ICO can embed PNG directly).
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(1, 4) // count
  const entry = Buffer.alloc(16)
  entry.writeUInt8(0, 0) // width 0 => 256
  entry.writeUInt8(0, 1) // height 0 => 256
  entry.writeUInt8(0, 2) // colors
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(png.length, 8) // size
  entry.writeUInt32LE(22, 12) // offset
  writeFileSync(join(__dirname, 'build', 'icon.ico'), Buffer.concat([header, entry, png]))

  console.log('icon written:', png.length, 'bytes png')
  app.quit()
})
