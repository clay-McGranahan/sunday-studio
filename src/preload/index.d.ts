import type { ProgressEvent } from '../shared/types'

declare global {
  interface Window {
    sunday: {
      invoke<T>(channel: string, ...args: unknown[]): Promise<T>
      pathForFile(file: File): string
      onProgress(fn: (event: ProgressEvent) => void): () => void
    }
  }
}

export {}
