'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { LeashContext } from './leashContext.js'
import { LEASH_AUTH_COOKIE } from '../../constants.js'
import type { LeashUser, LeashJWTPayload } from '../../types.js'
import { payloadToUser } from '../../auth/payload.js'

interface LeashProviderProps {
  children: React.ReactNode
}

// Helper function to decode JWT (client-side only, no verification)
function decodeJWT(token: string): LeashJWTPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = parts[1]
    const decoded = JSON.parse(atob(payload))

    // Check if token is expired
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null
    }

    return decoded
  } catch (error) {
    console.error('Failed to decode JWT:', error)
    return null
  }
}

// Helper function to get cookie value
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null

  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)

  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null
  }

  return null
}

export function LeashProvider({ children }: LeashProviderProps) {
  const [user, setUser] = useState<LeashUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') {
      setIsLoading(false)
      return
    }

    try {
      const token = getCookie(LEASH_AUTH_COOKIE)

      if (!token) {
        setUser(null)
        setIsLoading(false)
        return
      }

      const payload = decodeJWT(token)

      if (!payload) {
        setUser(null)
        setError(new Error('Invalid or expired token'))
        setIsLoading(false)
        return
      }

      setUser(payloadToUser(payload))
      setIsLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to authenticate'))
      setIsLoading(false)
    }
  }, [])

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({ user, isLoading, error }),
    [user, isLoading, error]
  )

  return (
    <LeashContext.Provider value={contextValue}>
      {children}
    </LeashContext.Provider>
  )
}
