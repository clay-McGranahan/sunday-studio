import { useCallback, useEffect, useState } from 'react'
import type { SetupStatus } from '@shared/types'
import { api } from './lib/api'
import Startup from './views/Startup'
import Welcome from './views/Welcome'
import Projects from './views/Projects'
import Editor from './views/Editor'
import Settings from './views/Settings'

type Route = { name: 'projects' } | { name: 'editor'; id: string } | { name: 'settings' }

const WELCOMED_KEY = 'sunday.welcomed'

export default function App() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [startupError, setStartupError] = useState<string | null>(null)
  const [route, setRoute] = useState<Route>({ name: 'projects' })
  const [welcomed, setWelcomed] = useState(() => localStorage.getItem(WELCOMED_KEY) === '1')

  const check = useCallback(async () => {
    setStartupError(null)
    try {
      setStatus(await api.setupStatus())
    } catch (err) {
      setStartupError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // Re-check on returning home so banners (e.g. AI not connected) stay current.
  useEffect(() => {
    if (route.name === 'projects') void check()
  }, [check, route.name])

  if (!status) return <Startup error={startupError} onRetry={check} />

  if (!status.ready || !welcomed) {
    return (
      <Welcome
        status={status}
        onRefresh={check}
        onDone={() => {
          localStorage.setItem(WELCOMED_KEY, '1')
          setWelcomed(true)
          void check()
        }}
      />
    )
  }

  switch (route.name) {
    case 'editor':
      return <Editor projectId={route.id} onExit={() => setRoute({ name: 'projects' })} onSettings={() => setRoute({ name: 'settings' })} />
    case 'settings':
      return <Settings onBack={() => setRoute({ name: 'projects' })} onStatusChange={setStatus} />
    default:
      return (
        <Projects
          aiConfigured={status.aiConfigured}
          onOpen={(id) => setRoute({ name: 'editor', id })}
          onSettings={() => setRoute({ name: 'settings' })}
        />
      )
  }
}
