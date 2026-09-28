import { app, BrowserWindow, protocol, shell } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { registerIpc } from './ipc'
import { recoverInterruptedProjects } from './pipeline'
import { readProject, thumbnailFile } from './store'

// Lets development and tests run against an isolated data folder.
if (process.env.SUNDAY_USER_DATA) app.setPath('userData', process.env.SUNDAY_USER_DATA)

protocol.registerSchemesAsPrivileged([
  { scheme: 'sunday-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
])

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg'
}

/** Serve a local file with HTTP range support so <video> can seek through multi-GB sermons. */
function serveFile(file: string, request: Request): Response {
  if (!existsSync(file)) return new Response('Not found', { status: 404 })
  const size = statSync(file).size
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
  if (!range) {
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream
    return new Response(body, { headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } })
  }
  let start = range[1] ? Number(range[1]) : size - Number(range[2])
  let end = range[1] && range[2] ? Number(range[2]) : size - 1
  start = Math.max(0, start)
  end = Math.min(size - 1, end)
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes'
    }
  })
}

function registerMediaProtocol(): void {
  protocol.handle('sunday-media', (request) => {
    const url = new URL(request.url)
    const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (url.host === 'thumb') return serveFile(thumbnailFile(id), request)
    const project = readProject(id)
    if (url.host === 'video' && project) return serveFile(project.sourcePath, request)
    return new Response('Not found', { status: 404 })
  })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Sunday Studio',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#15130f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

app.whenReady().then(() => {
  app.setName('Sunday Studio')
  recoverInterruptedProjects()
  registerMediaProtocol()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
