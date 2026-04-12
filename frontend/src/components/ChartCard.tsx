import React from 'react'
import { Badge, Button, Card, CardDescription, CardTitle, EmptyState } from './ui'

type ChartCardProps = {
  title: string
  description?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}

export const ChartHeader: React.FC<{
  title: string
  description?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
}> = ({ title, description, meta, actions }) => (
  <div className="ui-chart-header">
    <div className="ui-chart-header-copy">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle className="ui-chart-title">{title}</CardTitle>
        {meta ? <div className="ui-chart-meta">{meta}</div> : null}
      </div>
      {description ? <CardDescription className="ui-chart-description">{description}</CardDescription> : null}
    </div>
    {actions ? <div className="ui-chart-actions">{actions}</div> : null}
  </div>
)

export const ChartCard: React.FC<ChartCardProps> = ({ title, description, meta, actions, children, footer }) => (
  <Card className="ui-chart-card">
    <ChartHeader title={title} description={description} meta={meta} actions={actions} />
    <div className="ui-chart-body">{children}</div>
    {footer ? <div className="ui-chart-footer">{footer}</div> : null}
  </Card>
)

type LegendItem = {
  label: string
  value?: string
  color: string
}

export const ChartLegend: React.FC<{ items: LegendItem[] }> = ({ items }) => (
  <div className="ui-chart-legend">
    {items.map((item) => (
      <div key={`${item.label}-${item.color}`} className="ui-chart-legend-item">
        <span className="ui-chart-legend-dot" style={{ backgroundColor: item.color }} />
        <span className="ui-chart-legend-label">{item.label}</span>
        {item.value ? <span className="ui-chart-legend-value">{item.value}</span> : null}
      </div>
    ))}
  </div>
)

export const ChartEmptyState: React.FC<{
  title: string
  description: string
}> = ({ title, description }) => (
  <div className="ui-chart-empty">
    <EmptyState title={title} description={description} />
  </div>
)

export const ChartLoadingState: React.FC<{
  title?: string
  description?: string
}> = ({
  title = 'Carregando grafico',
  description = 'Preparando a visualizacao dos dados para o periodo selecionado.',
}) => (
  <div className="ui-chart-skeleton" aria-hidden="true">
    <div className="ui-chart-skeleton-copy">
      <div className="ui-chart-skeleton-kicker" />
      <div className="ui-chart-skeleton-line ui-chart-skeleton-line-lg" />
      <div className="ui-chart-skeleton-line" />
    </div>
    <div className="ui-chart-skeleton-bars">
      {Array.from({ length: 7 }).map((_, index) => (
        <span
          key={index}
          className="ui-chart-skeleton-bar"
          style={{ height: `${42 + ((index % 4) + 1) * 18}px` }}
        />
      ))}
    </div>
    <div className="sr-only">
      <p>{title}</p>
      <p>{description}</p>
    </div>
  </div>
)

export const ChartToolbarButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, ...props }) => (
  <Button size="sm" variant="secondary" className={className} {...props} />
)

export const ChartPill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Badge variant="neutral" className="ui-chart-pill">{children}</Badge>
)
