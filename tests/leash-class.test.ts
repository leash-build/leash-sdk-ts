import { beforeEach, describe, expect, it, vi } from 'vitest'
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
      code: 'TEST_CODE',
      message: 'something went wrong',
      action: 'do the thing',
      seeAlso: 'https://example.com',
    })

    expect(err.toString()).toBe(
      '× something went wrong\n  Fix: do the thing\n  See: https://example.com'
    )
  })

  it('formats toString with only message when action and seeAlso are absent', () => {
    const err = new LeashError({ code: 'BARE', message: 'bare error' })
    expect(err.toString()).toBe('× bare error')
  })

  it('has the right name and code properties', () => {
    const err = new LeashError({ code: 'MY_CODE', message: 'msg' })
    expect(err.name).toBe('LeashError')
    expect(err.code).toBe('MY_CODE')
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

  it('succeeds in browser mode when globalThis.window is defined', () => {
    vi.stubGlobal('window', {})
    const leash = new Leash()
    expect(leash).toBeDefined()
    expect(leash.integrations.gmail).toBeDefined()
  })

  it('accepts an explicit apiKey override in server mode', () => {
    const leash = new Leash({ request: makeRequest(), apiKey: 'explicit-key' })
    expect(leash).toBeDefined()
  })
})

describe('Leash.integrations.gmail — server mode fetch calls', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'server-api-key'
  })

  it('listMessages POSTs to the right URL with Authorization and Cookie headers', async () => {
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
          Authorization: 'Bearer server-api-key',
          Cookie: 'leash-auth=auth-cookie-value',
        }),
        body: JSON.stringify({ query: 'newer_than:1d' }),
      })
    )
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

  it('listMessages — 403 response throws LeashError INTEGRATION_NOT_ENABLED mentioning /dashboard/connections', async () => {
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
        action: expect.stringContaining('/dashboard/connections'),
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
          Authorization: 'Bearer server-api-key',
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
