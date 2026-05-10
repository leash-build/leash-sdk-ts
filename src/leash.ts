import { LeashError } from './errors.js'

const DEFAULT_PLATFORM_URL = 'https://leash.build'

interface ServerRequest {
  // Supports Next.js NextRequest (cookies.get returns { value: string } | undefined)
  // and cookie-parser style (cookies is an object with string values)
  // and raw Node.js IncomingMessage (headers.cookie string)
  cookies:
    | { get(name: string): { value: string } | undefined }
    | Record<string, string | { value: string } | undefined>
  headers?: Record<string, string | string[] | undefined> | { get?(name: string): string | null }
}

interface LeashOptions {
  request?: ServerRequest
  platformUrl?: string
  apiKey?: string
}

type TransportMode = 'server' | 'browser'

export class Leash {
  private mode: TransportMode
  private platformUrl: string
  private apiKey?: string
  private request?: ServerRequest
  private cookieValue?: string

  readonly integrations: {
    gmail: {
      listMessages(params?: { query?: string; maxResults?: number }): Promise<unknown>
      getMessage(messageId: string, format?: 'full' | 'metadata' | 'minimal' | 'raw'): Promise<unknown>
    }
  }

  constructor(opts: LeashOptions = {}) {
    this.platformUrl = opts.platformUrl ?? DEFAULT_PLATFORM_URL

    if (opts.request !== undefined) {
      // Server mode
      this.mode = 'server'
      this.request = opts.request

      this.apiKey = opts.apiKey ?? process.env['LEASH_API_KEY']
      if (!this.apiKey) {
        throw new LeashError({
          code: 'NO_API_KEY',
          message: 'LEASH_API_KEY is required in server mode.',
          action:
            'Add LEASH_API_KEY to your .env.local and set it in your platform dashboard at https://leash.build/dashboard.',
          seeAlso: 'https://leash.build/docs/api-keys',
        })
      }

      // Extract leash-auth cookie value for forwarding
      this.cookieValue = this._extractCookie(opts.request, 'leash-auth')
    } else if (typeof globalThis.window !== 'undefined') {
      // Browser mode
      this.mode = 'browser'
      this.apiKey = opts.apiKey
    } else {
      // Neither request nor window — server environment without request
      throw new LeashError({
        code: 'NO_REQUEST_SERVER_CONSTRUCT',
        message: 'Leash requires a request object in server environments.',
        action:
          "Pass { request: req } to the Leash constructor in server code, or add 'use client' if this is a React component.",
        seeAlso: 'https://leash.build/docs/sdk',
      })
    }

    // Build integrations namespace
    this.integrations = {
      gmail: {
        listMessages: (params?: { query?: string; maxResults?: number }) =>
          this._call('gmail', 'list-messages', params),
        getMessage: (messageId: string, format?: 'full' | 'metadata' | 'minimal' | 'raw') =>
          this._call('gmail', 'get-message', { messageId, format }),
      },
    }
  }

  private _extractCookie(request: ServerRequest, name: string): string | undefined {
    const cookies = request.cookies

    // Strategy 1: cookies.get(name) — Next.js NextRequest / Web Request
    if (typeof (cookies as any).get === 'function') {
      const result = (cookies as { get(name: string): { value: string } | undefined }).get(name)
      if (result !== undefined) {
        return typeof result === 'object' && 'value' in result ? result.value : (result as unknown as string)
      }
    }

    // Strategy 2: cookies[name] — Express with cookie-parser or plain object
    const cookieRecord = cookies as Record<string, string | { value: string } | undefined>
    const entry = cookieRecord[name]
    if (entry !== undefined) {
      return typeof entry === 'object' && 'value' in entry ? entry.value : (entry as string)
    }

    // Strategy 3: raw headers.cookie
    if (request.headers) {
      let cookieHeader: string | null | undefined
      const headers = request.headers as any
      if (typeof headers.get === 'function') {
        cookieHeader = headers.get('cookie')
      } else if (typeof headers['cookie'] === 'string') {
        cookieHeader = headers['cookie']
      }
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
        if (match) return match[1]
      }
    }

    return undefined
  }

  private async _call(provider: string, action: string, params?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    if (this.mode === 'server' && this.cookieValue) {
      headers['Cookie'] = `leash-auth=${this.cookieValue}`
    }

    const res = await fetch(`${this.platformUrl}/api/integrations/${provider}/${action}`, {
      method: 'POST',
      headers,
      credentials: this.mode === 'browser' ? 'include' : 'same-origin',
      body: JSON.stringify(params ?? {}),
    })

    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`
      try {
        const data = await res.json() as Record<string, unknown>
        if (typeof data.error === 'string') errorMessage = data.error
      } catch {
        // ignore parse errors
      }

      if (res.status === 401) {
        throw new LeashError({
          code: 'UNAUTHORIZED',
          message: errorMessage,
          action:
            'Ensure the leash-auth cookie is present, or open your app in local dev via the Leash dashboard to get a valid session.',
          seeAlso: 'https://leash.build/docs/authentication',
        })
      }

      if (res.status === 403) {
        throw new LeashError({
          code: 'INTEGRATION_NOT_ENABLED',
          message: errorMessage,
          action:
            'Connect the integration at /dashboard/connections and make sure this app is on the allow-list.',
          seeAlso: 'https://leash.build/dashboard/connections',
        })
      }

      throw new LeashError({
        code: 'INTEGRATION_ERROR',
        message: errorMessage,
        action: 'Check the Leash platform status and your integration configuration.',
        seeAlso: 'https://leash.build/docs/integrations',
      })
    }

    const data = await res.json() as Record<string, unknown>
    return data.data ?? data
  }
}
