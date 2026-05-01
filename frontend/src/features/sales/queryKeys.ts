export const salesQueryKeys = {
  all: ['sales'] as const,
  cashDashboard: {
    all: ['sales', 'cash-dashboard'] as const,
    detail: (params: { from: string; to: string; ordersLimit: number; movesLimit: number; historyLimit: number }) =>
      ['sales', 'cash-dashboard', params] as const,
  },
}
