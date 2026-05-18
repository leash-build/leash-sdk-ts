'use client'

import { LEASH_PLATFORM_URL } from '../../constants.js'

/**
 * Resolve the Leash platform URL the same way the integrations client and
 * LeashProvider do: `LEASH_PLATFORM_URL` env var → fallback to
 * `https://leash.build`.
 */
function resolvePlatformUrl(): string {
  if (typeof process !== 'undefined' && process.env && process.env.LEASH_PLATFORM_URL) {
    return process.env.LEASH_PLATFORM_URL
  }
  return LEASH_PLATFORM_URL
}

/**
 * Returns a function the caller can invoke to redirect the browser to
 * leash.build's login page with `return_to` set to the current URL. After
 * successful auth the user lands back on the page they were on.
 *
 * Use this in deployed apps when `useLeashAuth()` returns `null` and you
 * want the visitor to sign in before continuing.
 *
 * @example
 * ```tsx
 * function GatedPage() {
 *   const { user, isLoading } = useLeashAuth()
 *   const redirectToLogin = useLeashRedirectToLogin()
 *
 *   if (isLoading) return <Loading />
 *   if (!user) {
 *     return <button onClick={redirectToLogin}>Sign in</button>
 *   }
 *   return <Dashboard />
 * }
 * ```
 */
export function useLeashRedirectToLogin(): () => void {
  return () => {
    if (typeof window === 'undefined') return
    const returnTo = encodeURIComponent(window.location.href)
    const platformUrl = resolvePlatformUrl()
    window.location.href = `${platformUrl}/login?return_to=${returnTo}`
  }
}
