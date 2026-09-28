import { useEffect, useState } from 'react'
import type { SetupItemId, SetupStatus } from '@shared/types'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { Icon, ProgressBar } from './Common'

interface Props {
  status: SetupStatus
  onRefresh: () => Promise<void> | void
}

export default function SetupList({ status, onRefresh }: Props) {
  const toast = useToast()
  const [busy, setBusy] = useState<SetupItemId | null>(null)
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState<number | undefined>()

  useEffect(
    () =>
      api.onProgress((e) => {
        if (e.kind !== 'setup') return
        setMessage(e.message)
        setProgress(e.progress)
      }),
    []
  )

  const install = async (id: SetupItemId) => {
    setBusy(id)
    setMessage('Starting…')
    setProgress(undefined)
    try {
      await api.install(id)
      toast.show('Installed', 'success')
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(null)
      await onRefresh()
    }
  }

  // Install everything missing, in order, stopping at the first failure.
  const installAll = async () => {
    for (const item of status.items) {
      if (item.ready || item.id === 'tracker') continue
      setBusy(item.id)
      setMessage('Starting…')
      setProgress(undefined)
      try {
        await api.install(item.id)
        await onRefresh()
      } catch (err) {
        toast.error(err)
        break
      }
    }
    setBusy(null)
    await onRefresh()
  }

  const missing = status.items.filter((i) => i.required && !i.ready)

  return (
    <div className="setup-list">
      {status.items.map((item) => (
        <div key={item.id} className={`setup-item ${item.ready ? 'is-ready' : ''}`}>
          <div className={`setup-mark ${item.ready ? 'ok' : item.required ? 'todo' : 'optional'}`}>
            {item.ready ? <Icon name="check" size={14} /> : null}
          </div>
          <div className="setup-body">
            <div className="setup-title">
              {item.label}
              {!item.required && <span className="tag">Optional</span>}
            </div>
            <div className="setup-desc">{item.description}</div>
            {busy === item.id ? (
              <div className="setup-busy">
                <ProgressBar value={progress} indeterminate={progress === undefined} />
                <div className="setup-log">{message}</div>
              </div>
            ) : (
              item.detail && <div className="setup-detail">{item.detail}</div>
            )}
          </div>
          {!item.ready && (
            <button className="btn btn-small" disabled={!item.installable || busy !== null} onClick={() => install(item.id)}>
              {item.id === 'tracker' ? 'Build' : 'Install'}
            </button>
          )}
        </div>
      ))}
      {missing.length > 1 && (
        <button className="btn btn-primary setup-all" disabled={busy !== null} onClick={installAll}>
          Set up everything
        </button>
      )}
    </div>
  )
}
