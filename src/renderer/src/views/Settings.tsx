import { useCallback, useEffect, useState } from 'react'
import type { SetupStatus } from '@shared/types'
import AiSettingsForm from '../components/AiSettingsForm'
import { Icon, Spinner } from '../components/Common'
import SetupList from '../components/SetupList'
import { api } from '../lib/api'

interface Props {
  onBack: () => void
  onStatusChange: (s: SetupStatus) => void
}

export default function Settings({ onBack, onStatusChange }: Props) {
  const [status, setStatus] = useState<SetupStatus | null>(null)

  const refresh = useCallback(async () => {
    const s = await api.setupStatus()
    setStatus(s)
    onStatusChange(s)
  }, [onStatusChange])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn btn-ghost btn-icon-text" onClick={onBack}>
          <Icon name="back" /> Projects
        </button>
        <h2 className="topbar-title">Settings</h2>
        <span />
      </header>
      <main className="settings">
        {!status ? (
          <Spinner />
        ) : (
          <>
            <section className="card">
              <div className="card-head">
                <h3>On-device tools</h3>
                <span className={`pill ${status.ready ? 'pill-ok' : 'pill-warn'}`}>{status.ready ? 'Ready' : 'Needs setup'}</span>
              </div>
              <SetupList status={status} onRefresh={refresh} />
            </section>
            <section className="card">
              <div className="card-head">
                <h3>AI clip suggestions</h3>
                <span className={`pill ${status.aiConfigured ? 'pill-ok' : ''}`}>{status.aiConfigured ? 'Connected' : 'Not connected'}</span>
              </div>
              <p className="muted small">Optional. Transcription, framing and captions work fully without it.</p>
              <AiSettingsForm onSaved={() => void refresh()} />
            </section>
            <section className="card">
              <div className="card-head">
                <h3>Storage</h3>
              </div>
              <p>
                {status.projectCount} {status.projectCount === 1 ? 'project' : 'projects'} stored on this Mac. Sermon videos stay where
                you keep them; Sunday Studio stores only transcripts and settings.
              </p>
              <div className="row">
                <code className="path">{status.dataDir}</code>
                <button className="btn btn-small" onClick={() => void api.openDataFolder()}>
                  <Icon name="folder" size={15} /> Open
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
