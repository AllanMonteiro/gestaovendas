import { api } from '../../core/api'
import type { CashCloseInput, CashMoveInput, CashSessionOpenResponse, Reconciliation } from './types'

export const openCashSession = async (initialFloat: string) => {
  const response = await api.post<CashSessionOpenResponse>('/api/cash/open', { initial_float: initialFloat })
  return response.data
}

export const createCashMove = async (input: CashMoveInput) => {
  const response = await api.post('/api/cash/move', input)
  return response.data
}

export const deleteCashMove = async (moveId: number) => {
  const response = await api.delete(`/api/cash/move/${moveId}`)
  return response.data
}

export const closeCashSession = async (input: CashCloseInput) => {
  const response = await api.post<Reconciliation>('/api/cash/close', input)
  return response.data
}
