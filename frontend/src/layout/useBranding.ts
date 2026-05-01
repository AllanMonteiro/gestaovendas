import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

export type StoreHeaderConfig = {
  store_name?: string
  logo_url?: string | null
  theme?: string | null
}

type BrandingDetail = {
  store_name?: string
  logo_url?: string | null
}

type BrandingState = {
  store_name: string
  logo_url: string
  theme: string
}

const BRANDING_QUERY_KEY = ['store-branding']
const BRANDING_CACHE_KEY = 'sorveteria.branding-cache'

const defaultBranding: BrandingState = {
  store_name: 'Sorveteria POS',
  logo_url: '',
  theme: 'cream',
}

export const normalizeTheme = (value?: string | null) => {
  if (!value || value === 'light') return 'cream'
  if (value === 'green' || value === 'blue' || value === 'cream') return value
  return 'cream'
}

const normalizeBranding = (branding?: StoreHeaderConfig | null): BrandingState => ({
  store_name: branding?.store_name || defaultBranding.store_name,
  logo_url: branding?.logo_url || '',
  theme: normalizeTheme(branding?.theme),
})

const readBrandingCache = () => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(BRANDING_CACHE_KEY)
    if (!raw) {
      return null
    }
    return normalizeBranding(JSON.parse(raw) as StoreHeaderConfig)
  } catch {
    return null
  }
}

const writeBrandingCache = (branding: BrandingState) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(branding))
  } catch {
    // Ignore storage failures and keep runtime state only.
  }
}

export const useBranding = () => {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: BRANDING_QUERY_KEY,
    initialData: readBrandingCache() ?? defaultBranding,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const response = await api.get<StoreHeaderConfig>('/api/config/ui')
        return normalizeBranding(response.data)
      } catch {
        return readBrandingCache() ?? defaultBranding
      }
    },
  })

  const branding = query.data ?? defaultBranding

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', branding.theme)
    writeBrandingCache(branding)
  }, [branding])

  useEffect(() => {
    const handleTheme = (event: Event) => {
      const custom = event as CustomEvent<string>
      const nextTheme = normalizeTheme(custom.detail)
      queryClient.setQueryData<BrandingState>(BRANDING_QUERY_KEY, (current) => ({
        ...(current ?? defaultBranding),
        theme: nextTheme,
      }))
    }

    const handleBranding = (event: Event) => {
      const custom = event as CustomEvent<BrandingDetail>
      queryClient.setQueryData<BrandingState>(BRANDING_QUERY_KEY, (current) => ({
        ...(current ?? defaultBranding),
        store_name: custom.detail?.store_name || current?.store_name || defaultBranding.store_name,
        logo_url:
          custom.detail?.logo_url === undefined
            ? current?.logo_url || ''
            : custom.detail.logo_url || '',
      }))
    }

    window.addEventListener('sorveteria:theme', handleTheme as EventListener)
    window.addEventListener('sorveteria:branding', handleBranding as EventListener)
    return () => {
      window.removeEventListener('sorveteria:theme', handleTheme as EventListener)
      window.removeEventListener('sorveteria:branding', handleBranding as EventListener)
    }
  }, [queryClient])

  return {
    ...query,
    branding,
  }
}
