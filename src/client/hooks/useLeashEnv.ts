'use client'

import { useMemo } from 'react'
import { LEASH_ENV_KEYS } from '../../constants.js'
import type { LeashEnv } from '../../types.js'

/**
 * Hook to access Leash environment variables
 *
 * Reads from window.__LEASH_ENV__ (injected by Leash platform)
 * Falls back to process.env for development environments
 *
 * @returns LeashEnv object containing all environment variables
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const env = useLeashEnv()
 *
 *   return (
 *     <div>
 *       <p>App ID: {env.LEASH_APP_ID}</p>
 *       <p>Supabase URL: {env.SUPABASE_URL}</p>
 *       <p>Custom API Key: {env.API_KEY}</p>
 *     </div>
 *   )
 * }
 * ```
 */
export function useLeashEnv(): Partial<LeashEnv> {
  const env = useMemo(() => {
    // Check if running on client side
    if (typeof window !== 'undefined' && window.__LEASH_ENV__) {
      return window.__LEASH_ENV__
    }

    // Fallback to process.env for development
    if (typeof process !== 'undefined' && process.env) {
      return {
        LEASH_USER_ID: process.env.LEASH_USER_ID,
        LEASH_USER_EMAIL: process.env.LEASH_USER_EMAIL,
        LEASH_APP_ID: process.env.LEASH_APP_ID,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_KEY: process.env.SUPABASE_KEY,
        // Include any other custom env vars
        ...process.env,
      }
    }

    // Warn if no environment is available
    console.warn('Leash SDK: No environment variables found. Running outside Leash platform?')
    return {}
  }, [])

  return env
}
