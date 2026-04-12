export const catalogQueryKeys = {
  all: ['catalog'] as const,
  categories: {
    all: ['catalog', 'categories'] as const,
    list: () => ['catalog', 'categories', 'list'] as const,
  },
  products: {
    all: ['catalog', 'products'] as const,
    list: () => ['catalog', 'products', 'list'] as const,
  },
  productPrices: {
    all: ['catalog', 'product-prices'] as const,
    list: (productIds: number[]) => ['catalog', 'product-prices', 'list', productIds.join(',')] as const,
  },
}
