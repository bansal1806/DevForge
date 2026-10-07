import { Toaster as SonnerToaster } from 'sonner'
import { useTheme } from '../../contexts/ThemeContext'

/** App-wide toast host, themed with the forge tokens. Use `toast` from 'sonner'. */
export function Toaster() {
  const { resolved } = useTheme()
  return (
    <SonnerToaster
      theme={resolved}
      position="bottom-right"
      closeButton
      toastOptions={{
        style: {
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-3)',
          fontFamily: 'var(--font-body)',
        },
      }}
    />
  )
}
