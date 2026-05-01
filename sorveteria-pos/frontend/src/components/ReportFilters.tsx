import React from 'react'
import { Badge, Button, FilterBar, Input } from './ui'

type ReportFiltersProps = {
  fromDate: string
  toDate: string
  onChangeFrom: (value: string) => void
  onChangeTo: (value: string) => void
  onQuickRange: (days: 0 | 1 | 7 | 30) => void
  onApply: () => void
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({
  fromDate,
  toDate,
  onChangeFrom,
  onChangeTo,
  onQuickRange,
  onApply,
}) => {
  return (
    <FilterBar
      title="Periodo do relatorio"
      description="Filtre vendas, pagamentos e desempenho operacional sem sair da mesma visao."
      actions={<Badge variant="brand">Atualizacao manual</Badge>}
    >
      <Input
        label="Data inicial"
        value={fromDate}
        onChange={(event) => onChangeFrom(event.target.value)}
        type="date"
        className="min-w-[11rem]"
      />
      <Input
        label="Data final"
        value={toDate}
        onChange={(event) => onChangeTo(event.target.value)}
        type="date"
        className="min-w-[11rem]"
      />
      <Button onClick={onApply} variant="primary">
        Aplicar filtro
      </Button>
      <div className="flex flex-wrap gap-2 lg:ml-auto">
        <Button onClick={() => onQuickRange(0)} variant="secondary" size="sm">
          Hoje
        </Button>
        <Button onClick={() => onQuickRange(1)} variant="secondary" size="sm">
          Ontem
        </Button>
        <Button onClick={() => onQuickRange(7)} variant="secondary" size="sm">
          7 dias
        </Button>
        <Button onClick={() => onQuickRange(30)} variant="secondary" size="sm">
          30 dias
        </Button>
      </div>
    </FilterBar>
  )
}
