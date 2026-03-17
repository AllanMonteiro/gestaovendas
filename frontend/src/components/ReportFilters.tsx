import React from 'react'

type ReportFiltersProps = {
  fromDate: string
  toDate: string
  onChangeFrom: (value: string) => void
  onChangeTo: (value: string) => void
  onQuickRange: (days: 0 | 1 | 7 | 30) => void
  onApply: () => void
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({ fromDate, toDate, onChangeFrom, onChangeTo, onQuickRange, onApply }) => {
  return (
    <div className="panel p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <input value={fromDate} onChange={(event) => onChangeFrom(event.target.value)} className="rounded-lg border border-brand-200 px-3 py-2 text-sm" type="date" />
          <input value={toDate} onChange={(event) => onChangeTo(event.target.value)} className="rounded-lg border border-brand-200 px-3 py-2 text-sm" type="date" />
          <button onClick={onApply} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
            Aplicar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onQuickRange(0)} className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700">Hoje</button>
          <button onClick={() => onQuickRange(1)} className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700">Ontem</button>
          <button onClick={() => onQuickRange(7)} className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700">7 dias</button>
          <button onClick={() => onQuickRange(30)} className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700">30 dias</button>
        </div>
      </div>
    </div>
  )
}
