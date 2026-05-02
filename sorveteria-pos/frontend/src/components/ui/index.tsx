import React from 'react'

type ClassValue = string | false | null | undefined

const cn = (...values: ClassValue[]) => values.filter(Boolean).join(' ')

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'brand'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
}

const buttonVariantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'ui-button-primary',
  secondary: 'ui-button-secondary',
  ghost: 'ui-button-ghost',
  danger: 'ui-button-danger',
  success: 'ui-button-success',
  warning: 'ui-button-warning',
  brand: 'ui-button-brand',
}

const buttonSizeClass: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'ui-button-sm',
  md: 'ui-button-md',
  lg: 'ui-button-lg',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'secondary',
    size = 'md',
    fullWidth = false,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'ui-button',
        buttonVariantClass[variant],
        buttonSizeClass[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    />
  )
})

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, id, ...props },
  ref
) {
  const inputId = id || props.name
  if (!label) {
    return <input ref={ref} id={inputId} className={cn('ui-input', className)} {...props} />
  }
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      <input ref={ref} id={inputId} className={cn('ui-input', className)} {...props} />
      {error ? <span className="ui-field-error">{error}</span> : hint ? <span className="ui-field-hint">{hint}</span> : null}
    </label>
  )
})

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  hint?: string
  error?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, hint, error, id, children, ...props },
  ref
) {
  const selectId = id || props.name
  if (!label) {
    return (
      <select ref={ref} id={selectId} className={cn('ui-input ui-select', className)} {...props}>
        {children}
      </select>
    )
  }
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      <select ref={ref} id={selectId} className={cn('ui-input ui-select', className)} {...props}>
        {children}
      </select>
      {error ? <span className="ui-field-error">{error}</span> : hint ? <span className="ui-field-hint">{hint}</span> : null}
    </label>
  )
})

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string
  hint?: string
  error?: string
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, label, hint, error, id, ...props },
  ref
) {
  const areaId = id || props.name
  if (!label) {
    return <textarea ref={ref} id={areaId} className={cn('ui-input ui-textarea', className)} {...props} />
  }
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      <textarea ref={ref} id={areaId} className={cn('ui-input ui-textarea', className)} {...props} />
      {error ? <span className="ui-field-error">{error}</span> : hint ? <span className="ui-field-hint">{hint}</span> : null}
    </label>
  )
})

type CheckboxFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: React.ReactNode
  description?: React.ReactNode
  containerClassName?: string
}

export const CheckboxField = React.forwardRef<HTMLInputElement, CheckboxFieldProps>(function CheckboxField(
  { className, containerClassName, label, description, id, ...props },
  ref
) {
  const checkboxId = id || props.name
  return (
    <label className={cn('ui-checkbox-field', containerClassName)} htmlFor={checkboxId}>
      <input
        ref={ref}
        id={checkboxId}
        type="checkbox"
        className={cn('ui-checkbox-input', className)}
        {...props}
      />
      <span className="ui-checkbox-copy">
        <span className="ui-checkbox-label">{label}</span>
        {description ? <span className="ui-checkbox-description">{description}</span> : null}
      </span>
    </label>
  )
})

type CardProps = React.HTMLAttributes<HTMLElement> & {
  as?: keyof JSX.IntrinsicElements
  tone?: 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'danger'
}

const cardToneClass: Record<NonNullable<CardProps['tone']>, string> = {
  default: 'ui-card-default',
  muted: 'ui-card-muted',
  accent: 'ui-card-accent',
  success: 'ui-card-success',
  warning: 'ui-card-warning',
  danger: 'ui-card-danger',
}

export const Card = ({ as: Component = 'section', className, tone = 'default', ...props }: CardProps) => {
  const El = Component as React.ElementType
  return <El className={cn('ui-card', cardToneClass[tone], className)} {...props} />
}

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('ui-card-header', className)} {...props} />
)

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, ...props }) => (
  <h2 className={cn('ui-card-title', className)} {...props} />
)

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className, ...props }) => (
  <p className={cn('ui-card-description', className)} {...props} />
)

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
}

const badgeVariantClass: Record<NonNullable<BadgeProps['variant']>, string> = {
  neutral: 'ui-badge-neutral',
  brand: 'ui-badge-brand',
  success: 'ui-badge-success',
  warning: 'ui-badge-warning',
  danger: 'ui-badge-danger',
  info: 'ui-badge-info',
}

export const Badge: React.FC<BadgeProps> = ({ className, variant = 'neutral', ...props }) => (
  <span className={cn('ui-badge', badgeVariantClass[variant], className)} {...props} />
)

type ModalProps = {
  open: boolean
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  onClose?: () => void
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const modalSizeClass: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'ui-modal-sm',
  md: 'ui-modal-md',
  lg: 'ui-modal-lg',
  xl: 'ui-modal-xl',
}

export const Modal: React.FC<ModalProps> = ({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = 'md',
}) => {
  if (!open) {
    return null
  }

  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className={cn('ui-modal-shell', modalSizeClass[size])} onClick={(event) => event.stopPropagation()}>
        <div className="ui-modal-header">
          <div>
            <h3 className="ui-modal-title">{title}</h3>
            {description ? <p className="ui-modal-description">{description}</p> : null}
          </div>
          {onClose ? (
            <button type="button" onClick={onClose} className="ui-modal-close" aria-label="Fechar modal">
              X
            </button>
          ) : null}
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer ? <div className="ui-modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

export const Table: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('ui-table-wrap', className)} {...props} />
)

export const TableElement: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, ...props }) => (
  <table className={cn('ui-table responsive-table', className)} {...props} />
)

export const TableHead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, ...props }) => (
  <thead className={cn('ui-table-head', className)} {...props} />
)

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, ...props }) => (
  <tbody className={cn('ui-table-body', className)} {...props} />
)

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className, ...props }) => (
  <tr className={cn('ui-table-row', className)} {...props} />
)

export const TableHeaderCell: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, ...props }) => (
  <th className={cn('ui-table-th', className)} {...props} />
)

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, ...props }) => (
  <td className={cn('ui-table-td', className)} {...props} />
)

type PageHeaderProps = {
  eyebrow?: string
  title: string
  description?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
}

export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, description, meta, actions }) => (
  <div className="ui-page-header">
    <div className="ui-page-header-copy">
      {eyebrow ? <p className="ui-page-header-eyebrow">{eyebrow}</p> : null}
      <h1 className="ui-page-header-title">{title}</h1>
      {description ? <p className="ui-page-header-description">{description}</p> : null}
      {meta ? <div className="ui-page-header-meta">{meta}</div> : null}
    </div>
    {actions ? <div className="ui-page-header-actions">{actions}</div> : null}
  </div>
)

type EmptyStateProps = {
  title: string
  description?: string
  action?: React.ReactNode
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => (
  <div className="ui-empty-state">
    <div className="ui-empty-state-illustration" />
    <h3 className="ui-empty-state-title">{title}</h3>
    {description ? <p className="ui-empty-state-description">{description}</p> : null}
    {action ? <div className="ui-empty-state-action">{action}</div> : null}
  </div>
)

type LoadingStateProps = {
  title?: string
  description?: string
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  title = 'Carregando...',
  description = 'Aguarde enquanto os dados sao atualizados.',
}) => (
  <div className="ui-loading-state">
    <div className="ui-loading-spinner" />
    <div>
      <p className="ui-loading-title">{title}</p>
      <p className="ui-loading-description">{description}</p>
    </div>
  </div>
)

type StatCardProps = {
  label: string
  value: React.ReactNode
  description?: React.ReactNode
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger'
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, description, tone = 'default' }) => (
  <Card className="ui-kpi-card" tone={tone}>
    <p className="ui-kpi-label">{label}</p>
    <p className="ui-kpi-value">{value}</p>
    {description ? <p className="ui-kpi-description">{description}</p> : null}
  </Card>
)

type SectionHeaderProps = {
  title: string
  description?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, description, meta, actions }) => (
  <div className="ui-section-header">
    <div className="ui-section-header-copy">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="ui-section-header-title">{title}</h2>
        {meta ? <div className="ui-section-header-meta">{meta}</div> : null}
      </div>
      {description ? <p className="ui-section-header-description">{description}</p> : null}
    </div>
    {actions ? <div className="ui-section-header-actions">{actions}</div> : null}
  </div>
)

type FilterBarProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string
  description?: string
  actions?: React.ReactNode
}

export const FilterBar: React.FC<FilterBarProps> = ({ title, description, actions, className, children, ...props }) => (
  <Card className={cn('ui-filter-bar', className)} tone="accent" {...props}>
    {(title || description || actions) ? (
      <SectionHeader
        title={title || 'Filtros'}
        description={description}
        actions={actions}
      />
    ) : null}
    <div className="ui-filter-bar-content">{children}</div>
  </Card>
)
