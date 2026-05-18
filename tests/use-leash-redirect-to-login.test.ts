import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLeashRedirectToLogin } from '../src/client/hooks/useLeashRedirectToLogin'

/**
 * The hook returns a plain function — no React tree needed to test it. We
 * stub `window.location.href` (via a getter/setter spy on a fake window)
 * and assert the redirect target.
 */
describe('useLeashRedirectToLogin', () => {
  const originalWindow = (globalThis as any).window

  beforeEach(() => {
    let href = 'https://app-acme.un.leash.build/dashboard?ref=email'
    ;(globalThis as any).window = {
      get location() {
        return {
          get href() {
            return href
          },
          set href(next: string) {
            href = next
          },
        }
      },
    }
    // Mirror the getter on the spy so reads after the assignment work.
    Object.defineProperty((globalThis as any).window.location, 'href', {
      configurable: true,
      get: () => href,
      set: (v: string) => {
        href = v
      },
    })
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window
    } else {
      ;(globalThis as any).window = originalWindow
    }
    delete process.env.LEASH_PLATFORM_URL
    vi.restoreAllMocks()
  })

  it('redirects to https://leash.build/login with return_to set to the current URL', () => {
    const redirect = useLeashRedirectToLogin()
    expect(typeof redirect).toBe('function')

    redirect()

    const current = (globalThis as any).window.location.href as string
    expect(current).toBe(
      'https://leash.build/login?return_to=' +
        encodeURIComponent('https://app-acme.un.leash.build/dashboard?ref=email')
    )
  })

  it('honors LEASH_PLATFORM_URL for local dev', () => {
    process.env.LEASH_PLATFORM_URL = 'http://localhost:3001'

    const redirect = useLeashRedirectToLogin()
    redirect()

    const current = (globalThis as any).window.location.href as string
    expect(current).toBe(
      'http://localhost:3001/login?return_to=' +
        encodeURIComponent('https://app-acme.un.leash.build/dashboard?ref=email')
    )
  })

  it('no-ops outside the browser (window undefined) instead of throwing', () => {
    delete (globalThis as any).window

    const redirect = useLeashRedirectToLogin()
    expect(() => redirect()).not.toThrow()
  })
})
