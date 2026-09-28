import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

function ensure(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export const paths = {
  data: () => ensure(app.getPath('userData')),
  projects: () => ensure(join(app.getPath('userData'), 'projects')),
  project: (id: string) => ensure(join(app.getPath('userData'), 'projects', id)),
  pythonEnv: () => join(app.getPath('userData'), 'python-env'),
  settings: () => join(app.getPath('userData'), 'settings.json'),
  /** Bundled resources: `resources/` in development, the app's Resources folder when packaged. */
  resource: (...parts: string[]) =>
    app.isPackaged ? join(process.resourcesPath, ...parts) : join(app.getAppPath(), 'resources', ...parts)
}
