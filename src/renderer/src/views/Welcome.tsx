import { useState } from 'react'
import type { SetupStatus } from '@shared/types'
import AiSettingsForm from '../components/AiSettingsForm'
import { Logo } from '../components/Common'
import SetupList from '../components/SetupList'

interface Props {
  status: SetupStatus
  onRefresh: () => Promise<void>
  onDone: () => void
}

export default function Welcome({ status, onRefresh, onDone }: Props) {
  const [step, setStep] = useState<'tools' | 'ai'>('tools')

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-head">
          <Logo size={44} />
          <div>
            <h1>Welcome to Sunday Studio</h1>
            <p className="muted">Turn this week’s sermon into short, captioned clips, right here on your Mac.</p>
          </div>
        </div>

        <ol className="welcome-steps">
          <li className={step === 'tools' ? 'active' : 'done'}>Get ready</li>
          <li className={step === 'ai' ? 'active' : ''}>AI suggestions (optional)</li>
        </ol>

        {step === 'tools' ? (
          <>
            <p className="lede">
              Transcription, framing and captions all run on this computer, so your videos stay private. A few tools need to be
              downloaded once.
            </p>
            <SetupList status={status} onRefresh={onRefresh} />
            <div className="welcome-foot">
              <button className="btn btn-ghost" onClick={() => void onRefresh()}>
                Check again
              </button>
              <button className="btn btn-primary" disabled={!status.ready} onClick={() => setStep('ai')}>
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="lede">
              Connect an AI service to have Sunday Studio suggest the strongest moments in each sermon. You can skip this; everything
              else works without it.
            </p>
            <AiSettingsForm />
            <div className="welcome-foot">
              <button className="btn btn-ghost" onClick={() => setStep('tools')}>
                Back
              </button>
              <button className="btn btn-primary" onClick={onDone}>
                {status.aiConfigured ? 'Start' : 'Skip for now'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
