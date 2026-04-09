'use client'

import { useMemo } from 'react'
import { LeashIntegrations } from '../client'

/**
 * React hook that returns a LeashIntegrations client instance.
 * Uses the leash-auth cookie automatically (credentials: 'include').
 *
 * For use in client components — calls go through the platform proxy.
 *
 * Usage:
 * ```tsx
 * const integrations = useIntegrations()
 * const labels = await integrations.gmail.listLabels()
 * ```
 */
export function useIntegrations(): LeashIntegrations {
  return useMemo(() => new LeashIntegrations(), [])
}
