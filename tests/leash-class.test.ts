import { beforeEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { Leash } from '../src/leash'
import { LeashError } from '../src/errors'

// Helper to make a minimal server request with a leash-auth cookie
function makeRequest(cookieValue?: string) {
  return {
    cookies: {
      get(name: string): { value: string } | undefined {
        if (name === 'leash-auth' && cookieValue !== undefined) {
          return { value: cookieValue }
        }
        return undefined
      },
    },
  }
}

describe('LeashError', () => {
  it('formats toString with message, Fix, and See lines', () => {
    const err = new LeashError({
      code: 'INTEGRATION_ERROR',
      message: 'something went wrong',
      action: 'do the thing',
      seeAlso: 'https://example.com',
    })

    expect(err.toString()).toBe(
      '× something went wrong\n  Fix: do the thing\n  See: https://example.com'
    )
  })

  it('formats toString with only message when action and seeAlso are absent', () => {
    const err = new LeashError({ code: 'NETWORK_ERROR', message: 'bare error' })
    expect(err.toString()).toBe('× bare error')
  })

  it('has the right name and code properties', () => {
    const err = new LeashError({ code: 'UNAUTHORIZED', message: 'msg' })
    expect(err.name).toBe('LeashError')
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err instanceof Error).toBe(true)
    expect(err instanceof LeashError).toBe(true)
  })
})

describe('Leash constructor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Ensure window is not defined (server context) by default
    vi.stubGlobal('window', undefined)
    // Clear the API key env var
    delete process.env['LEASH_API_KEY']
  })

  it('throws NO_REQUEST_SERVER_CONSTRUCT when no request and no window', () => {
    expect(() => new Leash()).toThrow(
      expect.objectContaining<Partial<LeashError>>({
        code: 'NO_REQUEST_SERVER_CONSTRUCT',
        action: expect.stringContaining('use client'),
      })
    )
  })

  it('succeeds in server mode when request and LEASH_API_KEY are provided', () => {
    process.env['LEASH_API_KEY'] = 'test-key'
    const leash = new Leash({ request: makeRequest('cookie-tok') })
    expect(leash).toBeDefined()
    expect(leash.integrations.gmail).toBeDefined()
  })

  it('throws NO_API_KEY when request is provided but no API key', () => {
    expect(() => new Leash({ request: makeRequest() })).toThrow(
      expect.objectContaining<Partial<LeashError>>({
        code: 'NO_API_KEY',
        action: expect.stringContaining('.env.local'),
      })
    )
  })

  it('throws BROWSER_MODE_UNSUPPORTED when globalThis.window is defined', () => {
    vi.stubGlobal('window', {})
    expect(() => new Leash()).toThrow(
      expect.objectContaining<Partial<LeashError>>({
        code: 'BROWSER_MODE_UNSUPPORTED',
        action: expect.stringContaining('0.4 milestone'),
      })
    )
  })

  it('accepts an explicit apiKey override in server mode', () => {
    const leash = new Leash({ request: makeRequest(), apiKey: 'explicit-key' })
    expect(leash).toBeDefined()
  })

  it('respects LEASH_PLATFORM_URL env var (Critical #3)', async () => {
    process.env['LEASH_API_KEY'] = 'test-key'
    process.env['LEASH_PLATFORM_URL'] = 'https://staging.leash.build'
    try {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      const leash = new Leash({ request: makeRequest('tok') })
      await leash.integrations.gmail.listMessages()
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('https://staging.leash.build'),
        expect.anything()
      )
    } finally {
      delete process.env['LEASH_PLATFORM_URL']
    }
  })

  it('opts.platformUrl overrides LEASH_PLATFORM_URL env var', () => {
    process.env['LEASH_API_KEY'] = 'test-key'
    process.env['LEASH_PLATFORM_URL'] = 'https://staging.leash.build'
    try {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      const leash = new Leash({
        request: makeRequest('tok'),
        platformUrl: 'https://custom.example.com',
      })
      leash.integrations.gmail.listMessages()
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('https://custom.example.com'),
        expect.anything()
      )
    } finally {
      delete process.env['LEASH_PLATFORM_URL']
    }
  })
})

describe('Leash.integrations.gmail — server mode fetch calls', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'server-api-key'
  })

  it('listMessages POSTs to the right URL with X-API-Key and Cookie headers (platform contract)', async () => {
    // This test asserts the headers the platform actually expects.
    // Contract defined at leash-platform/src/app/api/integrations/[provider]/[action]/route.ts:
    //   - X-API-Key: app key (validated via validateApiKey)
    //   - Authorization: Bearer <JWT> reserved for resolveUser() (user JWT, NOT api key)
    //   - Cookie: leash-auth=<JWT> for user identity via cookie
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { messages: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({
      request: makeRequest('auth-cookie-value'),
      platformUrl: 'https://staging.leash.build',
    })

    await leash.integrations.gmail.listMessages({ query: 'newer_than:1d' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging.leash.build/api/integrations/gmail/list-messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          // X-API-Key carries the app key — NOT Authorization: Bearer
          'X-API-Key': 'server-api-key',
          Cookie: 'leash-auth=auth-cookie-value',
        }),
        body: JSON.stringify({ query: 'newer_than:1d' }),
      })
    )

    // Authorization header must be ABSENT — lsk_live_* is not a JWT;
    // sending it in Bearer would cause resolveUser() to reject it before
    // the API-key check even runs (→ 401).
    const callArgs = fetchMock.mock.calls[0]
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['authorization']).toBeUndefined()
  })

  it('listMessages — 401 response throws LeashError UNAUTHORIZED mentioning leash-auth', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({ request: makeRequest('tok') })

    await expect(leash.integrations.gmail.listMessages()).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'UNAUTHORIZED',
        action: expect.stringContaining('leash-auth'),
      })
    )
  })

  it('listMessages — 403 response throws LeashError INTEGRATION_NOT_ENABLED mentioning /dashboard/integrations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({ request: makeRequest('tok') })

    await expect(leash.integrations.gmail.listMessages()).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'INTEGRATION_NOT_ENABLED',
        action: expect.stringContaining('/dashboard/integrations'),
      })
    )
  })

  it('getMessage POSTs with messageId and format params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'msg-123' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({
      request: makeRequest('tok'),
      platformUrl: 'https://leash.build',
    })

    await leash.integrations.gmail.getMessage('msg-123', 'full')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/gmail/get-message',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messageId: 'msg-123', format: 'full' }),
      })
    )
  })

  it('sendMessage POSTs to gmail/send-message with message params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'sent-123' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({ request: makeRequest('tok'), platformUrl: 'https://leash.build' })
    const msg = { to: 'a@b.com', subject: 'Hi', body: 'Hello' }
    await leash.integrations.gmail.sendMessage(msg)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/gmail/send-message',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(msg) })
    )
  })

  it('searchMessages POSTs to gmail/search-messages with query and maxResults', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { messages: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({ request: makeRequest('tok'), platformUrl: 'https://leash.build' })
    await leash.integrations.gmail.searchMessages('from:boss@co.com', 10)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/gmail/search-messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'from:boss@co.com', maxResults: 10 }),
      })
    )
  })

  it('listLabels POSTs to gmail/list-labels', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { labels: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({ request: makeRequest('tok'), platformUrl: 'https://leash.build' })
    await leash.integrations.gmail.listLabels()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/gmail/list-labels',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('getProfile POSTs to gmail/get-profile', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { emailAddress: 'user@example.com' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({ request: makeRequest('tok'), platformUrl: 'https://leash.build' })
    await leash.integrations.gmail.getProfile()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/gmail/get-profile',
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('Leash.integrations.calendar — server mode fetch calls', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'server-api-key'
  })

  it('listEvents POSTs to /api/integrations/google_calendar/list-events with params in body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { events: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({
      request: makeRequest('auth-cookie-value'),
      platformUrl: 'https://staging.leash.build',
    })

    await leash.integrations.calendar.listEvents({ calendarId: 'primary', timeMin: '2024-01-01T00:00:00Z' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging.leash.build/api/integrations/google_calendar/list-events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': 'server-api-key',
          Cookie: 'leash-auth=auth-cookie-value',
        }),
        body: JSON.stringify({ calendarId: 'primary', timeMin: '2024-01-01T00:00:00Z' }),
      })
    )
  })

  it('createEvent POSTs to /api/integrations/google_calendar/create-event with event params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'evt-123', summary: 'Test' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({
      request: makeRequest('tok'),
      platformUrl: 'https://leash.build',
    })

    const eventParams = {
      summary: 'Test',
      start: { dateTime: '2024-06-01T10:00:00Z', timeZone: 'UTC' },
      end: { dateTime: '2024-06-01T11:00:00Z', timeZone: 'UTC' },
    }
    await leash.integrations.calendar.createEvent(eventParams)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/google_calendar/create-event',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(eventParams),
      })
    )
  })
})

describe('Leash.integrations.drive — server mode fetch calls', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'server-api-key'
  })

  it('listFiles POSTs to /api/integrations/google_drive/list-files with params in body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { files: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({
      request: makeRequest('auth-cookie-value'),
      platformUrl: 'https://staging.leash.build',
    })

    await leash.integrations.drive.listFiles({ query: 'mimeType="application/pdf"' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging.leash.build/api/integrations/google_drive/list-files',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': 'server-api-key',
          Cookie: 'leash-auth=auth-cookie-value',
        }),
        body: JSON.stringify({ query: 'mimeType="application/pdf"' }),
      })
    )
  })

  it('uploadFile POSTs to /api/integrations/google_drive/upload-file with file params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'file-123', name: 'x', mimeType: 'text/plain' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({
      request: makeRequest('tok'),
      platformUrl: 'https://leash.build',
    })

    const fileParams = { name: 'x', content: 'hello world', mimeType: 'text/plain' }
    await leash.integrations.drive.uploadFile(fileParams)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/google_drive/upload-file',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(fileParams),
      })
    )
  })

  it('deleteFile POSTs to google_drive/delete-file with fileId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({ request: makeRequest('tok'), platformUrl: 'https://leash.build' })
    await leash.integrations.drive.deleteFile('file-abc')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/google_drive/delete-file',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ fileId: 'file-abc' }),
      })
    )
  })

  it('searchFiles POSTs to google_drive/search-files with query and maxResults', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { files: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({ request: makeRequest('tok'), platformUrl: 'https://leash.build' })
    await leash.integrations.drive.searchFiles('name contains "report"', 5)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/google_drive/search-files',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'name contains "report"', maxResults: 5 }),
      })
    )
  })
})

describe('Platform contract — header shape (Critical #1)', () => {
  // This test guards the header contract between the SDK and
  // leash-platform/src/app/api/integrations/[provider]/[action]/route.ts.
  // If either side changes its header expectations, this test fails.

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'server-api-key'
  })

  it('sends X-API-Key (not Authorization) and Cookie, never Authorization for api key', async () => {
    // Contract (verified against leash-platform/src/app/api/integrations/[provider]/[action]/route.ts):
    //   - X-API-Key header carries the app key → validateApiKey()
    //   - Authorization: Bearer <JWT> is reserved for resolveUser() user JWT
    //   - Cookie: leash-auth=<JWT> for user identity via cookie
    //   Sending lsk_live_* in Authorization: Bearer causes verifyToken() to throw → 401
    //   before the x-api-key check even runs.

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const leash = new Leash({
      request: makeRequest('user-jwt-value'),
      platformUrl: 'https://leash.build',
    })

    await leash.integrations.gmail.listMessages()

    const [, init] = fetchMock.mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>

    // 1. X-API-Key is present with the app key
    expect(headers['X-API-Key']).toBe('server-api-key')

    // 2. Authorization is ABSENT (would cause verifyToken() to reject lsk_live_* as non-JWT)
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['authorization']).toBeUndefined()

    // 3. Cookie carries the leash-auth value for user identity
    expect(headers['Cookie']).toBe('leash-auth=user-jwt-value')
  })
})

describe('Cookie extraction — _extractCookie', () => {
  // Exercises the three input shapes without going through the full Leash constructor.
  // Tests that raw Node IncomingMessage, Next.js NextRequest, and cookie-parser shapes all work.

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'k'
  })

  it('Next.js NextRequest shape: cookies.get(name) → { value }', () => {
    const req = {
      cookies: { get: (n: string) => n === 'leash-auth' ? { value: 'next-tok' } : undefined },
    }
    const leash = new Leash({ request: req })
    // If cookie extraction worked, the leash object is constructed successfully.
    // The cookieValue is private; we verify it indirectly via the fetch call.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    leash.integrations.gmail.listMessages()
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Cookie: 'leash-auth=next-tok',
    })
  })

  it('Express cookie-parser shape: cookies[name] = string', () => {
    const req = {
      cookies: { 'leash-auth': 'express-tok' },
    }
    const leash = new Leash({ request: req })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    leash.integrations.gmail.listMessages()
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Cookie: 'leash-auth=express-tok',
    })
  })

  it('Raw Node IncomingMessage shape: headers.cookie string', () => {
    const req = {
      headers: { cookie: 'other=x; leash-auth=raw-node-tok; another=y' },
    }
    const leash = new Leash({ request: req })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    leash.integrations.gmail.listMessages()
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Cookie: 'leash-auth=raw-node-tok',
    })
  })

  it('No cookie present: Cookie header is absent, no throw', () => {
    const req = { cookies: {}, headers: {} }
    // Should not throw — server mode is valid even without leash-auth cookie
    const leash = new Leash({ request: req })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    leash.integrations.gmail.listMessages()
    const [, init] = fetchMock.mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['Cookie']).toBeUndefined()
  })
})

// ─── leash.auth — server-mode reader ──────────────────────────────────────────

const AUTH_TEST_SECRET = 'auth-test-secret'
const AUTH_TEST_PAYLOAD = {
  userId: 'user-abc',
  email: 'arvin@leash.build',
  name: 'Arvin',
}

function makeAuthToken(payload = AUTH_TEST_PAYLOAD, secret = AUTH_TEST_SECRET) {
  return jwt.sign(payload, secret, { expiresIn: '1h' })
}

function makeRequestWithCookie(cookieValue?: string) {
  return {
    cookies: {
      get(name: string): { value: string } | undefined {
        if (name === 'leash-auth' && cookieValue !== undefined) {
          return { value: cookieValue }
        }
        return undefined
      },
    },
  }
}

describe('leash.auth.user() — server mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'test-key'
    vi.stubEnv('LEASH_JWT_SECRET', AUTH_TEST_SECRET)
  })

  it('returns LeashUser with correct id, email, name when cookie holds a valid JWT', () => {
    const token = makeAuthToken()
    const leash = new Leash({ request: makeRequestWithCookie(token) })
    const user = leash.auth.user()
    expect(user).not.toBeNull()
    expect(user!.id).toBe('user-abc')
    expect(user!.email).toBe('arvin@leash.build')
    expect(user!.name).toBe('Arvin')
  })

  it('returns null when no leash-auth cookie is present', () => {
    const leash = new Leash({ request: makeRequestWithCookie(undefined) })
    expect(leash.auth.user()).toBeNull()
  })

  it('returns null (does NOT throw) when cookie contains a malformed JWT', () => {
    const leash = new Leash({ request: makeRequestWithCookie('not.a.valid.jwt') })
    expect(() => leash.auth.user()).not.toThrow()
    expect(leash.auth.user()).toBeNull()
  })

  it('returns null when cookie JWT has an invalid signature', () => {
    const token = jwt.sign(AUTH_TEST_PAYLOAD, 'wrong-secret')
    const leash = new Leash({ request: makeRequestWithCookie(token) })
    expect(leash.auth.user()).toBeNull()
  })
})

describe('leash.auth.isAuthenticated() — server mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'test-key'
    vi.stubEnv('LEASH_JWT_SECRET', AUTH_TEST_SECRET)
  })

  it('returns true when user() returns a valid user', () => {
    const token = makeAuthToken()
    const leash = new Leash({ request: makeRequestWithCookie(token) })
    expect(leash.auth.isAuthenticated()).toBe(true)
  })

  it('returns false when user() returns null', () => {
    const leash = new Leash({ request: makeRequestWithCookie(undefined) })
    expect(leash.auth.isAuthenticated()).toBe(false)
  })

  it('mirrors user() truthiness — malformed cookie → false', () => {
    const leash = new Leash({ request: makeRequestWithCookie('garbage') })
    expect(leash.auth.isAuthenticated()).toBe(false)
  })
})

// ─── Leash.createDevAuthHandler ───────────────────────────────────────────────

function makeGetRequest(url: string) {
  return { url }
}

describe('Leash.createDevAuthHandler() — missing code', () => {
  it('returns 400 HTML when no code param in URL', async () => {
    const handler = Leash.createDevAuthHandler()
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth'))
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('text/html')
    const body = await res.text()
    expect(body).toContain('Missing exchange code')
  })
})

describe('Leash.createDevAuthHandler() — valid code → 302 + Set-Cookie', () => {
  // Platform contract: these mocks must match the response shape from
  //   leash-platform/src/app/api/auth/exchange-code/route.ts
  // If the platform changes the envelope, update these mocks AND consider
  // adding an integration test against staging.
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    delete process.env['LEASH_PLATFORM_URL']
  })

  it('returns 302 with Set-Cookie containing the token, HttpOnly and Path=/', async () => {
    const fakeToken = 'fake.jwt.token'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { token: fakeToken, expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const handler = Leash.createDevAuthHandler()
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=abc123'))

    expect(res.status).toBe(302)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    expect(setCookie).toContain(`leash-auth=${fakeToken}`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Path=/')
  })

  it('redirects to / by default', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { token: 'tok', expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = Leash.createDevAuthHandler()
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=abc'))
    expect(res.headers.get('location')).toBe('/')
  })

  it('respects custom redirectTo option', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { token: 'tok', expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = Leash.createDevAuthHandler({ redirectTo: '/dashboard' })
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=abc'))
    expect(res.headers.get('location')).toBe('/dashboard')
  })

  it('includes SameSite=Lax in Set-Cookie', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { token: 'tok', expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = Leash.createDevAuthHandler()
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=abc'))
    expect(res.headers.get('set-cookie')).toContain('SameSite=Lax')
  })

  it('derives Max-Age from platform expires_at', async () => {
    const futureMs = Date.now() + 4 * 60 * 60 * 1000 // 4 hours from now
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { token: 'tok', expires_at: new Date(futureMs).toISOString() },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = Leash.createDevAuthHandler()
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=abc'))
    const setCookie = res.headers.get('set-cookie')
    // Max-Age should be approximately 4 hours in seconds (within a few seconds of 14400)
    const match = setCookie?.match(/Max-Age=(\d+)/)
    expect(match).not.toBeNull()
    const maxAge = parseInt(match![1], 10)
    expect(maxAge).toBeGreaterThan(4 * 60 * 60 - 5)
    expect(maxAge).toBeLessThanOrEqual(4 * 60 * 60)
  })

  it('falls back to cookieMaxAge constant when expires_at is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { token: 'tok' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = Leash.createDevAuthHandler({ cookieMaxAge: 3600 })
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=abc'))
    expect(res.headers.get('set-cookie')).toContain('Max-Age=3600')
  })
})

describe('Leash.createDevAuthHandler() — exchange error responses', () => {
  // Platform contract: these mocks must match the response shape from
  //   leash-platform/src/app/api/auth/exchange-code/route.ts
  // If the platform changes the envelope, update these mocks AND consider
  // adding an integration test against staging.
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    delete process.env['LEASH_PLATFORM_URL']
  })

  it('returns 410 HTML when platform returns 410 (code expired/used)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Code expired or already redeemed' }), { status: 410 })
    )
    const handler = Leash.createDevAuthHandler()
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=used'))
    expect(res.status).toBe(410)
    const body = await res.text()
    expect(body).toContain('expired')
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('returns 404 HTML when platform returns 404 (unknown code)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Unknown code' }), { status: 404 })
    )
    const handler = Leash.createDevAuthHandler()
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=unknown'))
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).toContain('Unknown code')
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('returns 500 HTML when platform returns 5xx status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 503 })
    )
    const handler = Leash.createDevAuthHandler()
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=xyz'))
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toContain('Authentication failed')
  })

  it('passes through 4xx status codes verbatim for unexpected errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), { status: 400 })
    )
    const handler = Leash.createDevAuthHandler()
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=xyz'))
    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toContain('Authentication failed')
  })

  it('includes platform error message as secondary note in error page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'User context no longer valid' }), { status: 410 })
    )
    const handler = Leash.createDevAuthHandler()
    const res = await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=used'))
    const body = await res.text()
    expect(body).toContain('User context no longer valid')
  })
})

describe('Leash.createDevAuthHandler() — LEASH_PLATFORM_URL env var', () => {
  // Platform contract: these mocks must match the response shape from
  //   leash-platform/src/app/api/auth/exchange-code/route.ts
  // If the platform changes the envelope, update these mocks AND consider
  // adding an integration test against staging.
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
  })

  it('POSTs to LEASH_PLATFORM_URL when set', async () => {
    process.env['LEASH_PLATFORM_URL'] = 'https://staging.leash.build'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { token: 'tok', expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    try {
      const handler = Leash.createDevAuthHandler()
      await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=abc'))
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('https://staging.leash.build'),
        expect.anything()
      )
    } finally {
      delete process.env['LEASH_PLATFORM_URL']
    }
  })

  it('POSTs to https://leash.build by default (no env var)', async () => {
    delete process.env['LEASH_PLATFORM_URL']
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { token: 'tok', expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = Leash.createDevAuthHandler()
    await handler(makeGetRequest('http://localhost:3000/api/_leash/dev-auth?code=abc'))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://leash.build'),
      expect.anything()
    )
  })
})
