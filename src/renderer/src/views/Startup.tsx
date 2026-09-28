import { Logo, Spinner } from '../components/Common'

export default function Startup({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="startup">
      <Logo size={56} />
      <h1>Sunday Studio</h1>
      {error ? (
        <div className="startup-error">
          <p>Something went wrong while getting ready.</p>
          <p className="muted small">{error}</p>
          <button className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <p className="muted">
          <Spinner /> Getting ready…
        </p>
      )}
    </div>
  )
}
