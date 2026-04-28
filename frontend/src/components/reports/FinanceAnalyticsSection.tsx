import React from 'react'
import { PaymentMethodsChart } from '../PaymentMethodsChart'

type PaymentRow = {
  payment_method?: string
  total: string
}

type FinanceAnalyticsSectionProps = {
  payments: PaymentRow[]
  error?: string
}

const FinanceAnalyticsSection: React.FC<FinanceAnalyticsSectionProps> = ({ payments, error }) => (
  <PaymentMethodsChart payments={payments} error={error} />
)

export default FinanceAnalyticsSection
