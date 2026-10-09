import cx from 'classnames'
import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import styles from './Field.module.css'

interface FieldChrome {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  optional?: boolean
  /** Render the value in the code font (paths, branch names) */
  mono?: boolean
}

/** Shared label / hint / error wrapper; wires up ids and aria attributes. */
function FieldShell({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: FieldChrome & { id: string, children: (aria: { id: string, 'aria-invalid'?: true, 'aria-describedby'?: string }) => ReactNode }) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}>(optional)</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <span id={errorId} className={styles.error} role="alert">{error}</span>
      ) : hint ? (
        <span id={hintId} className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  )
}

type InputProps = FieldChrome & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { ref?: Ref<HTMLInputElement> }

export function Input({ label, hint, error, optional, mono, className, ref, ...rest }: InputProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      {(aria) => (
        <input ref={ref} className={cx(styles.control, mono && styles.mono, !!error && styles.invalid, className)} {...aria} {...rest} />
      )}
    </FieldShell>
  )
}

type TextareaProps = FieldChrome & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { ref?: Ref<HTMLTextAreaElement> }

export function Textarea({ label, hint, error, optional, mono, className, ref, ...rest }: TextareaProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      {(aria) => (
        <textarea ref={ref} className={cx(styles.control, mono && styles.mono, !!error && styles.invalid, className)} {...aria} {...rest} />
      )}
    </FieldShell>
  )
}

type SelectProps = FieldChrome & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & { ref?: Ref<HTMLSelectElement> }

export function Select({ label, hint, error, optional, mono, className, children, ref, ...rest }: SelectProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      {(aria) => (
        <select ref={ref} className={cx(styles.control, mono && styles.mono, !!error && styles.invalid, className)} {...aria} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  )
}
