import React, { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { AuthProvider } from './auth'
import { registerWSMessageHandler } from '../api/ws'
import { invalidateQueriesFromSocketEvent } from './socketEvents'

export const createAppQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  })

const SocketQueryBridge: React.FC = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    return registerWSMessageHandler((payload, path) => {
      invalidateQueriesFromSocketEvent(queryClient, payload, path)
    })
  }, [queryClient])

  return null
}

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queryClient] = useState(() => createAppQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <SocketQueryBridge />
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
