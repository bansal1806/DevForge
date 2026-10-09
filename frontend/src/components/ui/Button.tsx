import cx from 'classnames'
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'
import { Spinner } from './Spinner'
import { buttonClass } from './buttonClass'
import type { ButtonStyleProps } from './buttonClass'
import styles from './Button.module.css'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  loading?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth,
  loading = false,
  iconLeft,
  iconRight,
  className,
  children,
  disabled,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, fullWidth }, cx(loading && styles.loading, className))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {iconLeft}
      {children && <span>{children}</span>}
      {iconRight}
      {loading && (
        <span className={styles.spinnerSlot}>
          <Spinner size={size === 'lg' ? 20 : 16} label="Working" />
        </span>
      )}
    </button>
  )
}

/** A router link styled as a button */
export function LinkButton({ variant = 'secondary', size = 'md', fullWidth, className, ...rest }: LinkProps & ButtonStyleProps) {
  return <Link className={buttonClass({ variant, size, fullWidth }, className)} {...rest} />
}

export interface IconButtonProps extends Omit<ButtonProps, 'iconLeft' | 'iconRight' | 'children'> {
  /** Accessible name — required because there is no visible text */
  label: string
  icon: ReactNode
}

export function IconButton({ label, icon, variant = 'ghost', size = 'md', className, ...rest }: IconButtonProps) {
  return (
    <Button variant={variant} size={size} aria-label={label} title={label} className={cx(styles.icon, className)} {...rest}>
      {icon}
    </Button>
  )
}
