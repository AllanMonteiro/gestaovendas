import { useMutation, useQueryClient } from '@tanstack/react-query'
import { closeCashSession, createCashMove, deleteCashMove, openCashSession } from '../mutations'
import { salesQueryKeys } from '../queryKeys'

const invalidateCashDashboard = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({ queryKey: salesQueryKeys.cashDashboard.all })
}

export const useOpenCashSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: openCashSession,
    onSuccess: () => {
      invalidateCashDashboard(queryClient)
    },
  })
}

export const useCreateCashMoveMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createCashMove,
    onSuccess: () => {
      invalidateCashDashboard(queryClient)
    },
  })
}

export const useDeleteCashMoveMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteCashMove,
    onSuccess: () => {
      invalidateCashDashboard(queryClient)
    },
  })
}

export const useCloseCashSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: closeCashSession,
    onSuccess: () => {
      invalidateCashDashboard(queryClient)
    },
  })
}
