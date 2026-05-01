export const ordersQueryKeys = {
  all: ['orders'] as const,
  delivery: {
    all: ['orders', 'delivery'] as const,
    list: () => ['orders', 'delivery', 'list'] as const,
  },
  kitchen: {
    all: ['orders', 'kitchen'] as const,
    queue: () => ['orders', 'kitchen', 'queue'] as const,
  },
}
