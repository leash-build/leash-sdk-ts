'use client'

import { useContext } from 'react'
import { LeashContext } from '../context/leashContext.js'
import type { LeashAuthContext } from '../../types.js'

/**
 * Hook to access Leash authentication context
 *
 * @returns LeashAuthContext containing user, isLoading, and error
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isLoading, error } = useLeashAuth()
 *
 *   if (isLoading) return <div>Loading...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *   if (!user) return <div>Not authenticated</div>
 *
 *   return <div>Hello {user.name}</div>
 * }
 * ```
 */
export function useLeashAuth(): LeashAuthContext {
  const context = useContext(LeashContext)

  if (context === undefined) {
    throw new Error('useLeashAuth must be used within a LeashProvider')
  }

  return context
}
