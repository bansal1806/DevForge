import cx from 'classnames'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonStyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

/** Class list for anything that should look like a button (e.g. a router Link). */
export function buttonClass({ variant = 'secondary', size = 'md', fullWidth }: ButtonStyleProps, extra?: string) {
  return cx(styles.button, styles[variant], size !== 'md' && styles[size], fullWidth && styles.full, extra)
}
