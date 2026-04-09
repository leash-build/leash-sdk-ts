'use client'

import { useState, useEffect } from 'react'
import type { ConnectionStatus } from '../types'
import { LeashIntegrations } from '../client'

interface UseIntegrationStatusResult {
  connections: ConnectionStatus[]
  isLoading: boolean
  error: Error | null
  isConnected: (providerId: string) => boolean
  getConnectUrl: (providerId: string) => string
  refresh: () => void
}

/**
 * React hook that fetches the user's integration connection statuses.
 *
 * Usage:
 * ```tsx
 * const { connections, isConnected, getConnectUrl } = useIntegrationStatus()
 *
 * if (!isConnected('gmail')) {
 *   return <a href={getConnectUrl('gmail')}>Connect Gmail</a>
 * }
 * ```
 */
export function useIntegrationStatus(): UseIntegrationStatusResult {
  const [connections, setConnections] = useState<ConnectionStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const client = new LeashIntegrations()
    setIsLoading(true)
    client
      .getConnections()
      .then(setConnections)
      .catch(setError)
      .finally(() => setIsLoading(false))
  }, [refreshKey])

  const client = new LeashIntegrations()

  return {
    connections,
    isLoading,
    error,
    isConnected: (providerId: string) =>
      connections.some((c) => c.providerId === providerId && c.status === 'active'),
    getConnectUrl: (providerId: string) => client.getConnectUrl(providerId),
    refresh: () => setRefreshKey((k) => k + 1),
  }
}
