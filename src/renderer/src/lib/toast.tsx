import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Tone = 'info' | 'success' | 'error'
interface Toast {
  id: number
  tone: Tone
  message: string
  action?: { label: string; run: () => void }
}

interface ToastApi {
  show: (message: string, tone?: Tone, action?: Toast['action']) => void
  error: (err: unknown) => void
}

const ToastContext = createContext<ToastApi>({ show: () => {}, error: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const show = useCallback<ToastApi['show']>(
    (message, tone = 'info', action) => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t.slice(-3), { id, tone, message, action }])
      setTimeout(() => dismiss(id), tone === 'error' ? 8000 : action ? 7000 : 4000)
    },
    [dismiss]
  )
  const error = useCallback((err: unknown) => show(err instanceof Error ? err.message : String(err), 'error'), [show])
  const value = useMemo(() => ({ show, error }), [show, error])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span className="toast-dot" />
            <span className="toast-msg">{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
