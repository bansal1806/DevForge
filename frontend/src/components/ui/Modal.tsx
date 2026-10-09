import cx from 'classnames'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import { EASE_OUT, spring } from '../../lib/motion'
import styles from './Modal.module.css'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** "right" renders a full-height drawer */
  side?: 'center' | 'right'
  /** Disable closing via backdrop/Escape (e.g. while saving) */
  dismissible?: boolean
}

/**
 * Accessible dialog: portal, focus trap, Escape/backdrop to close,
 * focus restored to the opener, page scroll locked while open.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  side = 'center',
  dismissible = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)

  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus the first field (or the panel) once it has mounted
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const target = panel.querySelector<HTMLElement>('[data-autofocus]') ||
        panel.querySelector<HTMLElement>('input, textarea, select') ||
        panel
      target.focus()
    }, 30)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissibleRef.current) {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus?.()
    }
  }, [open])

  const isDrawer = side === 'right'

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={cx(styles.backdrop, isDrawer && styles.backdropRight)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && dismissible) onClose()
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={cx(styles.panel, isDrawer ? styles.drawer : styles[size])}
            initial={isDrawer ? { x: '100%' } : { opacity: 0, y: 16, scale: 0.97 }}
            animate={isDrawer ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isDrawer ? { x: '100%' } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={spring}
          >
            <div className={styles.header}>
              <div>
                <h2 id={titleId} className={styles.title}>{title}</h2>
                {description && <p id={descriptionId} className={styles.description}>{description}</p>}
              </div>
              {dismissible && <IconButton label="Close" icon={<X size={18} />} size="sm" onClick={onClose} />}
            </div>
            {children && <div className={styles.body}>{children}</div>}
            {footer && <div className={styles.footer}>{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
