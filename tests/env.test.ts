/**
 * Unit tests for leash.env.get / leash.env.getMany (LEA-191, 0.4 milestone 3).
 *
 * Platform contract:
 *   GET /api/apps/me/secrets/[key]
 *     Auth: Authorization: Bearer <LEASH_API_KEY>
 *     200: { value: string }
 *     401: missing/invalid bearer
 *     402: { error: 'upgrade_required', message, requiredPlan }
 *     404: key not declared / not found
 *     502: { error } — source resync failure
 *
 * All tests verified against:
 *   leash-platform/src/app/api/apps/me/secrets/[key]/route.ts
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { Leash } from '../src/leash'
import { LeashError } from '../src/errors'

// Minimal server request (no leash-auth cookie needed for env tests)
function makeRequest() {
  return {
    cookies: { get: () => undefined },
    headers: {},
  }
}

// Build a Response helper
function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('leash.env.get — basic fetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'lsk_live_test_key'
    delete process.env['LEASH_PLATFORM_URL']
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env['LEASH_API_KEY']
    delete process.env['LEASH_PLATFORM_URL']
  })

  it('calls GET /api/apps/me/secrets/FOO with Authorization: Bearer and returns the value', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({ value: 'sk_live_abc123' }, 200)
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    const result = await leash.env.get('FOO')

    expect(result).toBe('sk_live_abc123')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/apps/me/secrets/FOO',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer lsk_live_test_key',
        }),
      })
    )
  })

  it('URL-encodes keys with special characters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({ value: 'value-with-special' }, 200)
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    await leash.env.get('special key/with chars')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/apps/me/secrets/special%20key%2Fwith%20chars',
      expect.anything()
    )
  })

  it('respects LEASH_PLATFORM_URL env var', async () => {
    process.env['LEASH_PLATFORM_URL'] = 'https://staging.leash.build'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({ value: 'staging-val' }, 200)
    )

    const leash = new Leash({ request: makeRequest() })
    await leash.env.get('MY_KEY')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://staging.leash.build'),
      expect.anything()
    )
  })
})

describe('leash.env.get — TTL cache', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'lsk_live_test_key'
    delete process.env['LEASH_PLATFORM_URL']
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env['LEASH_API_KEY']
    delete process.env['LEASH_PLATFORM_URL']
  })

  it('returns cached value on second call within TTL — only one fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({ value: 'cached-value' }, 200)
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })

    const first = await leash.env.get('FOO')
    const second = await leash.env.get('FOO')

    expect(first).toBe('cached-value')
    expect(second).toBe('cached-value')
    // Only one network call — cache hit on second
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('{ fresh: true } bypasses cache and fetches even with a valid cached entry', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResp({ value: 'first-value' }, 200))
      .mockResolvedValueOnce(jsonResp({ value: 'refreshed-value' }, 200))

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })

    const first = await leash.env.get('FOO')
    const fresh = await leash.env.get('FOO', { fresh: true })

    expect(first).toBe('first-value')
    expect(fresh).toBe('refreshed-value')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('{ fresh: true } still writes the fresh value back to cache', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResp({ value: 'stale-value' }, 200))
      .mockResolvedValueOnce(jsonResp({ value: 'fresh-value' }, 200))

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })

    // Prime cache
    await leash.env.get('FOO')
    // Fresh fetch — writes back to cache
    await leash.env.get('FOO', { fresh: true })
    // Should hit the freshly written cache, no third fetch
    const cached = await leash.env.get('FOO')

    expect(cached).toBe('fresh-value')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('re-fetches after TTL expires (simulated via fake timers)', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResp({ value: 'value-before-ttl' }, 200))
      .mockResolvedValueOnce(jsonResp({ value: 'value-after-ttl' }, 200))

    try {
      const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })

      const before = await leash.env.get('FOO')
      expect(before).toBe('value-before-ttl')
      expect(fetchMock).toHaveBeenCalledOnce()

      // Advance clock past the 60s TTL
      vi.advanceTimersByTime(61_000)

      const after = await leash.env.get('FOO')
      expect(after).toBe('value-after-ttl')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('two Leash instances have independent caches', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResp({ value: 'value-A' }, 200))
      .mockResolvedValueOnce(jsonResp({ value: 'value-B' }, 200))

    const leashA = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    const leashB = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })

    const a = await leashA.env.get('FOO')
    const b = await leashB.env.get('FOO')

    expect(a).toBe('value-A')
    expect(b).toBe('value-B')
    // Each instance fetched independently
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('leash.env.get — error handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'lsk_live_test_key'
    delete process.env['LEASH_PLATFORM_URL']
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env['LEASH_API_KEY']
    delete process.env['LEASH_PLATFORM_URL']
  })

  it('401 → throws LeashError code=UNAUTHORIZED with action mentioning api-keys page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({ error: 'Missing Bearer token' }, 401)
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    await expect(leash.env.get('FOO')).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'UNAUTHORIZED',
        action: expect.stringContaining('api-keys'),
      })
    )
  })

  it('402 → throws LeashError code=UPGRADE_REQUIRED with action mentioning billing page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({
        error: 'upgrade_required',
        message: 'Growth plan required',
        requiredPlan: 'growth',
      }, 402)
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    await expect(leash.env.get('FOO')).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'UPGRADE_REQUIRED',
        action: expect.stringContaining('billing'),
      })
    )
  })

  it('402 → UPGRADE_REQUIRED message includes requiredPlan from platform response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({
        error: 'upgrade_required',
        message: 'The SDK secrets API is available on the Growth plan and above.',
        requiredPlan: 'growth',
      }, 402)
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    let caughtErr: LeashError | undefined
    try {
      await leash.env.get('FOO')
    } catch (e) {
      caughtErr = e as LeashError
    }
    expect(caughtErr?.code).toBe('UPGRADE_REQUIRED')
    expect(caughtErr?.message).toContain('growth')
  })

  it('404 → throws LeashError code=KEY_NOT_DECLARED with action mentioning .env.example', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({ error: 'Key FOO is not declared in any app\'s required env vars' }, 404)
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    await expect(leash.env.get('FOO')).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'KEY_NOT_DECLARED',
        action: expect.stringContaining('.env.example'),
      })
    )
  })

  it('404 → KEY_NOT_DECLARED action includes the key name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({ error: 'Key not found' }, 404)
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    await expect(leash.env.get('STRIPE_SECRET_KEY')).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'KEY_NOT_DECLARED',
        action: expect.stringContaining('STRIPE_SECRET_KEY'),
      })
    )
  })

  it('502 → throws LeashError code=SOURCE_RESYNC_FAILED with platform error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({ error: 'Vault connection timed out' }, 502)
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    let caughtErr: LeashError | undefined
    try {
      await leash.env.get('FOO')
    } catch (e) {
      caughtErr = e as LeashError
    }
    expect(caughtErr?.code).toBe('SOURCE_RESYNC_FAILED')
    expect(caughtErr?.message).toBe('Vault connection timed out')
  })

  it('5xx other → throws LeashError code=ENV_FETCH_ERROR with response status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp({ error: 'Internal Server Error' }, 503)
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    let caughtErr: LeashError | undefined
    try {
      await leash.env.get('FOO')
    } catch (e) {
      caughtErr = e as LeashError
    }
    expect(caughtErr?.code).toBe('ENV_FETCH_ERROR')
    expect(caughtErr?.message).toContain('503')
  })
})

describe('leash.env.getMany', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'lsk_live_test_key'
    delete process.env['LEASH_PLATFORM_URL']
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env['LEASH_API_KEY']
    delete process.env['LEASH_PLATFORM_URL']
  })

  it('makes parallel fetches for each key and returns an object map', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      (url: RequestInfo | URL) => {
        const urlStr = url.toString()
        if (urlStr.endsWith('/A')) return Promise.resolve(jsonResp({ value: 'val-A' }, 200))
        if (urlStr.endsWith('/B')) return Promise.resolve(jsonResp({ value: 'val-B' }, 200))
        if (urlStr.endsWith('/C')) return Promise.resolve(jsonResp({ value: 'val-C' }, 200))
        return Promise.resolve(jsonResp({ error: 'unexpected' }, 404))
      }
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    const result = await leash.env.getMany(['A', 'B', 'C'])

    expect(result).toEqual({ A: 'val-A', B: 'val-B', C: 'val-C' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('uses shared cache — second getMany call within TTL only fetches once per key', async () => {
    // Use mockImplementation with a factory so each call gets a fresh Response
    // (a single Response object can only be read once)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResp({ value: 'shared-val' }, 200))
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })

    await leash.env.getMany(['X', 'Y'])
    await leash.env.getMany(['X', 'Y'])

    // 2 fetches for first call, 0 for second (cache hits)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('propagates failures — if one key 404s, the whole call rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (url: RequestInfo | URL) => {
        const urlStr = url.toString()
        if (urlStr.endsWith('/A')) return Promise.resolve(jsonResp({ value: 'val-A' }, 200))
        if (urlStr.endsWith('/MISSING')) return Promise.resolve(jsonResp({ error: 'not found' }, 404))
        return Promise.resolve(jsonResp({ value: 'val-other' }, 200))
      }
    )

    const leash = new Leash({ request: makeRequest(), platformUrl: 'https://leash.build' })
    await expect(leash.env.getMany(['A', 'MISSING'])).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'KEY_NOT_DECLARED',
      })
    )
  })
})
