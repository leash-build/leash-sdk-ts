'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { LeashContext } from './leashContext.js'
import { LEASH_AUTH_COOKIE, LEASH_PLATFORM_URL } from '../../constants.js'
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
  } catch {
    // Silent fail — invalid/malformed cookie isn't an actionable error for
    // the user, and console.error noise gives observers an XSS signal. The
    // fetch-fallback path will handle the "not signed in" state cleanly.
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

/**
 * Resolve the Leash platform URL the same way the integrations client does:
 *   LEASH_PLATFORM_URL env var → fallback to https://leash.build
 *
 * In Next.js client bundles, `process.env.LEASH_PLATFORM_URL` is inlined at
 * build time (only when `NEXT_PUBLIC_…` is used) or stripped to undefined,
 * so customers who want to point at a local platform can set
 * `LEASH_PLATFORM_URL=http://localhost:3001` and the browser bundle will
 * carry the override. Defensive `typeof process` guards keep this safe in
 * pure-browser bundlers that don't shim `process`.
 */
function resolvePlatformUrl(): string {
  if (typeof process !== 'undefined' && process.env && process.env.LEASH_PLATFORM_URL) {
    return process.env.LEASH_PLATFORM_URL
  }
  return LEASH_PLATFORM_URL
}

/**
 * Fetch the current user from the platform via /api/auth/me. Used when the
 * `leash-auth` cookie is httpOnly (every production deployment today) and
 * therefore not visible to `document.cookie`.
 *
 * Returns:
 *   - LeashUser  → signed in
 *   - null       → 401 unauthenticated (expected, not an error)
 * Throws when the network call fails or the response is malformed; the
 * caller decides whether to surface that to the UI.
 */
export async function fetchUserFromPlatform(
  platformUrl: string = resolvePlatformUrl()
): Promise<LeashUser | null> {
  const res = await fetch(`${platformUrl}/api/auth/me`, {
    credentials: 'include',
  })

  if (res.status === 401) {
    return null
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch user: HTTP ${res.status}`)
  }

  const body = (await res.json()) as { user?: Partial<LeashUser> & Record<string, unknown> }

  if (!body || !body.user || typeof body.user.id !== 'string') {
    throw new Error('Malformed /api/auth/me response')
  }

  const u = body.user
  // The narrowing on line 96 (typeof u.id !== 'string') doesn't propagate
  // through the reassignment to `u`, so keep the explicit cast. Other fields
  // default to '' because the platform may legitimately have null email/name
  // on sparse user profiles (e.g. just-created Google OAuth user mid-flow).
  return {
    id: u.id as string,
    email: (u.email as string) ?? '',
    name: (u.name as string) ?? '',
    picture: u.picture as string | undefined,
  }
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

    let cancelled = false

    const run = async () => {
      // 1) Cookie-visible path — works for non-httpOnly cookies (local dev,
      //    legacy setups). Cheap and synchronous; no network hop.
      try {
        const token = getCookie(LEASH_AUTH_COOKIE)
        if (token) {
          const payload = decodeJWT(token)
          if (payload) {
            if (cancelled) return
            setUser(payloadToUser(payload))
            setIsLoading(false)
            return
          }
          // Token present but invalid/expired — fall through to the fetch
          // path. The platform may have a fresh session via httpOnly cookie.
        }
      } catch {
        // Cookie parse / JWT decode errors fall through to the fetch path.
      }

      // 2) Fetch fallback — production path. The browser ships the httpOnly
      //    `leash-auth` cookie cross-origin because `credentials: 'include'`.
      try {
        const fetched = await fetchUserFromPlatform()
        if (cancelled) return
        setUser(fetched)
        setIsLoading(false)
      } catch (err) {
        if (cancelled) return
        // Network error (offline, CORS, DNS, 5xx) — surface it so customers
        // can render a retry UI. 401 is handled inside fetchUserFromPlatform
        // and returns null without throwing.
        setError(err instanceof Error ? err : new Error('Failed to authenticate'))
        setIsLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
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
