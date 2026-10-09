import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { Input } from './Field'

export interface ConfirmOptions {
  title: ReactNode
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  /** Require typing this exact text to enable the confirm button */
  requireText?: string
}

export interface PromptOptions {
  title: ReactNode
  description?: ReactNode
  label: ReactNode
  placeholder?: string
  initialValue?: string
  hint?: ReactNode
  confirmLabel?: string
  mono?: boolean
  /** Return an error message to block submission, or null when valid */
  validate?: (value: string) => string | null
}

interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  prompt: (options: PromptOptions) => Promise<string | null>
}

type Request =
  | { kind: 'confirm', options: ConfirmOptions }
  | { kind: 'prompt', options: PromptOptions }

const DialogContext = createContext<DialogApi | null>(null)

/**
 * Promise-based replacements for window.confirm / window.prompt, rendered
 * with the app's Modal (themed, accessible, non-blocking).
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const resolver = useRef<((result: boolean | string | null) => void) | null>(null)

  const settle = useCallback((result: boolean | string | null) => {
    resolver.current?.(result)
    resolver.current = null
    setOpen(false)
  }, [])

  const show = useCallback((next: Request) => {
    // Only one dialog at a time: a new request cancels the previous one
    resolver.current?.(next.kind === 'confirm' ? false : null)
    setRequest(next)
    setValue(next.kind === 'prompt' ? next.options.initialValue || '' : '')
    setError(null)
    setOpen(true)
    return new Promise<boolean | string | null>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const api: DialogApi = {
    confirm: (options) => show({ kind: 'confirm', options }) as Promise<boolean>,
    prompt: (options) => show({ kind: 'prompt', options }) as Promise<string | null>,
  }

  const cancel = () => settle(request?.kind === 'confirm' ? false : null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!request) return
    if (request.kind === 'confirm') {
      if (request.options.requireText && value !== request.options.requireText) return
      settle(true)
      return
    }
    const trimmed = value.trim()
    const problem = request.options.validate?.(trimmed) ?? (trimmed ? null : 'This field is required')
    if (problem) {
      setError(problem)
      return
    }
    settle(trimmed)
  }

  const confirmOptions = request?.kind === 'confirm' ? request.options : null
  const promptOptions = request?.kind === 'prompt' ? request.options : null
  const confirmBlocked = !!confirmOptions?.requireText && value !== confirmOptions.requireText

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        open={open}
        onClose={cancel}
        size="sm"
        title={request?.options.title}
        description={confirmOptions ? undefined : promptOptions?.description}
      >
        <form id="devforge-dialog" onSubmit={submit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {confirmOptions?.message && (
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>{confirmOptions.message}</div>
          )}
          {confirmOptions?.requireText && (
            <Input
              label={<>Type <code>{confirmOptions.requireText}</code> to confirm</>}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              mono
            />
          )}
          {promptOptions && (
            <Input
              label={promptOptions.label}
              placeholder={promptOptions.placeholder}
              hint={promptOptions.hint}
              error={error}
              mono={promptOptions.mono}
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null) }}
              autoComplete="off"
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={cancel}>
              {confirmOptions?.cancelLabel || 'Cancel'}
            </Button>
            <Button
              type="submit"
              variant={confirmOptions?.tone === 'danger' ? 'danger' : 'primary'}
              disabled={confirmBlocked}
              data-autofocus={confirmOptions && !confirmOptions.requireText ? true : undefined}
            >
              {confirmOptions?.confirmLabel || promptOptions?.confirmLabel || 'Confirm'}
            </Button>
          </div>
        </form>
      </Modal>
    </DialogContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>')
  return ctx
}
