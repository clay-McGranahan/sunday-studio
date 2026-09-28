import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ProgressEvent } from '@shared/types'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  if (!res.ok) throw new Error(res.error)
  return res.value
}

const api = {
  invoke,
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  onProgress: (fn: (event: ProgressEvent) => void) => {
    const listener = (_: unknown, event: ProgressEvent) => fn(event)
    ipcRenderer.on('progress', listener)
    return () => ipcRenderer.removeListener('progress', listener)
  }
}


contextBridge.exposeInMainWorld('sunday', api)
