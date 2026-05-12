import { LeashError } from './errors.js'
import { getLeashUser } from './server/auth.js'
import type { LeashUser } from './types.js'
import type { GmailMessageList, GmailLabelList, CalendarList, CalendarEventList, CalendarEvent, DriveFile, DriveFileList } from './integrations/types.js'
import type {
  LeashLinearNamespace,
  LinearIssue,
  LinearComment,
  LinearTeam,
  LinearProject,
  LinearListIssuesFilter,
  LinearListIssuesResult,
  LinearCreateIssueInput,
  LinearUpdateIssuePatch,
  LinearListProjectsFilter,
} from './integrations/providers/linear.js'

const DEFAULT_PLATFORM_URL = 'https://leash.build'

interface LeashOptions {
  // Typed as `any` to accept any HTTP framework — Next.js NextRequest, Express,
  // Hono, Fastify, raw Node.js IncomingMessage, Lambda events, etc.
  // (Framework-agnostic stance documented in CLAUDE.md line 63.)
  request?: any
  platformUrl?: string
  apiKey?: string
}

interface DevAuthHandlerOptions {
  cookieName?: string
  cookieMaxAge?: number
  redirectTo?: string
}

type TransportMode = 'server' | 'browser'

export class Leash {
  private mode: TransportMode
  private platformUrl: string
  private apiKey?: string
  private cookieValue?: string
  private _request?: unknown

  readonly auth: {
    /**
     * Returns the authenticated LeashUser from the request's leash-auth cookie,
     * or null if not authenticated / cookie is missing or invalid.
     * Sync — no await needed.
     * Server mode only in 0.4.
     */
    user(): LeashUser | null
    /**
     * True when auth.user() returns a non-null user.
     */
    isAuthenticated(): boolean
    /**
     * Returns a request handler (req) => Promise<Response> that implements the
     * LEA-186 local-dev cookie-exchange flow. Mount at /api/_leash/dev-auth.
     * Thin instance wrapper around Leash.createDevAuthHandler().
     */
    attachLocalDevHandler(opts?: DevAuthHandlerOptions): (req: unknown) => Promise<Response>
  }

  readonly integrations: {
    gmail: {
      listMessages(params?: { query?: string; maxResults?: number; labelIds?: string[]; pageToken?: string }): Promise<GmailMessageList>
      getMessage(messageId: string, format?: 'full' | 'metadata' | 'minimal' | 'raw'): Promise<unknown>
      sendMessage(message: { to: string; subject: string; body: string; cc?: string; bcc?: string }): Promise<unknown>
      searchMessages(query: string, maxResults?: number): Promise<GmailMessageList>
      listLabels(): Promise<GmailLabelList>
      getProfile(): Promise<unknown>
    }
    calendar: {
      listCalendars(): Promise<CalendarList>
      listEvents(params?: { calendarId?: string; timeMin?: string; timeMax?: string; maxResults?: number; query?: string; singleEvents?: boolean; orderBy?: string }): Promise<CalendarEventList>
      createEvent(params: { calendarId?: string; summary: string; description?: string; location?: string; start: { dateTime?: string; date?: string; timeZone?: string }; end: { dateTime?: string; date?: string; timeZone?: string }; attendees?: { email: string }[] }): Promise<CalendarEvent>
      getEvent(eventId: string, calendarId?: string): Promise<CalendarEvent>
    }
    drive: {
      listFiles(params?: { query?: string; maxResults?: number; folderId?: string }): Promise<DriveFileList>
      getFile(fileId: string): Promise<DriveFile>
      downloadFile(fileId: string): Promise<unknown>
      createFolder(name: string, parentId?: string): Promise<DriveFile>
      uploadFile(params: { name: string; content: string; mimeType: string; parentId?: string }): Promise<DriveFile>
      deleteFile(fileId: string): Promise<unknown>
      searchFiles(query: string, maxResults?: number): Promise<DriveFileList>
    }
    linear: LeashLinearNamespace
  }

  constructor(opts: LeashOptions = {}) {
    // Critical #3: respect LEASH_PLATFORM_URL env var (documented staging dev workflow)
    this.platformUrl = opts.platformUrl ?? process.env['LEASH_PLATFORM_URL'] ?? DEFAULT_PLATFORM_URL

    if (opts.request !== undefined) {
      // Server mode
      this.mode = 'server'
      this._request = opts.request

      this.apiKey = opts.apiKey ?? process.env['LEASH_API_KEY']
      if (!this.apiKey) {
        throw new LeashError({
          code: 'NO_API_KEY',
          message: 'LEASH_API_KEY is required in server mode.',
          action:
            'Add LEASH_API_KEY to your .env.local and set it in your platform dashboard at https://leash.build/dashboard.',
          seeAlso: 'https://leash.build/docs/sdk',
        })
      }

      // Extract leash-auth cookie value for forwarding to platform
      this.cookieValue = _extractCookie(opts.request, 'leash-auth')
    } else if (typeof globalThis.window !== 'undefined') {
      // Important #5: browser mode is not supported in 0.4-alpha — throw explicitly
      // instead of silently sending requests without an API key (which 401s every call).
      throw new LeashError({
        code: 'BROWSER_MODE_UNSUPPORTED',
        message: 'Browser-mode Leash() is not supported in 0.4-alpha.',
        action:
          'For server-side use, construct from an API route: const leash = new Leash({ request: req }). Browser-side integration calls are deferred to a later 0.4 milestone (see design doc open question #1).',
        seeAlso: 'https://leash.build/docs/sdk',
      })
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

    // Build auth namespace
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    this.auth = {
      user(): LeashUser | null {
        if (self.mode !== 'server') {
          throw new LeashError({
            code: 'BROWSER_MODE_UNSUPPORTED',
            message: 'leash.auth.user() is not supported in browser mode.',
            action:
              'Construct Leash with { request: req } in server code. Browser-side auth reads are deferred to a later 0.4 milestone.',
            seeAlso: 'https://leash.build/docs/sdk',
          })
        }
        try {
          return getLeashUser(self._request)
        } catch {
          return null
        }
      },
      isAuthenticated(): boolean {
        return this.user() !== null
      },
      attachLocalDevHandler(opts?: DevAuthHandlerOptions): (req: unknown) => Promise<Response> {
        return Leash.createDevAuthHandler(opts)
      },
    }

    // Build integrations namespace
    this.integrations = {
      gmail: {
        listMessages: (params?: { query?: string; maxResults?: number; labelIds?: string[]; pageToken?: string }) =>
          this._call('gmail', 'list-messages', params) as Promise<GmailMessageList>,
        getMessage: (messageId: string, format?: 'full' | 'metadata' | 'minimal' | 'raw') =>
          this._call('gmail', 'get-message', { messageId, format }),
        sendMessage: (message: { to: string; subject: string; body: string; cc?: string; bcc?: string }) =>
          this._call('gmail', 'send-message', message),
        searchMessages: (query: string, maxResults?: number) =>
          this._call('gmail', 'search-messages', { query, maxResults }) as Promise<GmailMessageList>,
        listLabels: () =>
          this._call('gmail', 'list-labels') as Promise<GmailLabelList>,
        getProfile: () =>
          this._call('gmail', 'get-profile'),
      },
      calendar: {
        listCalendars: () =>
          this._call('google_calendar', 'list-calendars') as Promise<CalendarList>,
        listEvents: (params?: { calendarId?: string; timeMin?: string; timeMax?: string; maxResults?: number; query?: string; singleEvents?: boolean; orderBy?: string }) =>
          this._call('google_calendar', 'list-events', params) as Promise<CalendarEventList>,
        createEvent: (params: { calendarId?: string; summary: string; description?: string; location?: string; start: { dateTime?: string; date?: string; timeZone?: string }; end: { dateTime?: string; date?: string; timeZone?: string }; attendees?: { email: string }[] }) =>
          this._call('google_calendar', 'create-event', params) as Promise<CalendarEvent>,
        getEvent: (eventId: string, calendarId?: string) =>
          this._call('google_calendar', 'get-event', { eventId, calendarId }) as Promise<CalendarEvent>,
      },
      drive: {
        listFiles: (params?: { query?: string; maxResults?: number; folderId?: string }) =>
          this._call('google_drive', 'list-files', params) as Promise<DriveFileList>,
        getFile: (fileId: string) =>
          this._call('google_drive', 'get-file', { fileId }) as Promise<DriveFile>,
        downloadFile: (fileId: string) =>
          this._call('google_drive', 'download-file', { fileId }),
        createFolder: (name: string, parentId?: string) =>
          this._call('google_drive', 'create-folder', { name, parentId }) as Promise<DriveFile>,
        uploadFile: (params: { name: string; content: string; mimeType: string; parentId?: string }) =>
          this._call('google_drive', 'upload-file', params) as Promise<DriveFile>,
        deleteFile: (fileId: string) =>
          this._call('google_drive', 'delete-file', { fileId }),
        searchFiles: (query: string, maxResults?: number) =>
          this._call('google_drive', 'search-files', { query, maxResults }) as Promise<DriveFileList>,
      },
      linear: {
        listIssues: async (filter?: LinearListIssuesFilter): Promise<LinearListIssuesResult> => {
          const raw = (await this._callMcp('linear', 'list-issues', filter ?? {})) as
            | { issues?: LinearIssue[]; cursor?: string }
            | LinearIssue[]
            | null
            | undefined
          if (Array.isArray(raw)) return { issues: raw }
          return {
            issues: raw?.issues ?? [],
            ...(raw?.cursor !== undefined ? { cursor: raw.cursor } : {}),
          }
        },
        getIssue: (id: string) =>
          this._callMcp('linear', 'get-issue', { id }) as Promise<LinearIssue>,
        createIssue: (input: LinearCreateIssueInput) =>
          this._callMcp('linear', 'create-issue', input) as Promise<LinearIssue>,
        updateIssue: (id: string, patch: LinearUpdateIssuePatch) =>
          this._callMcp('linear', 'update-issue', { id, ...patch }) as Promise<LinearIssue>,
        addComment: (issueId: string, body: string) =>
          this._callMcp('linear', 'add-comment', { issueId, body }) as Promise<LinearComment>,
        listTeams: async (): Promise<LinearTeam[]> => {
          const raw = (await this._callMcp('linear', 'list-teams', {})) as
            | { teams?: LinearTeam[] }
            | LinearTeam[]
            | null
            | undefined
          if (Array.isArray(raw)) return raw
          return raw?.teams ?? []
        },
        listProjects: async (filter?: LinearListProjectsFilter): Promise<LinearProject[]> => {
          const raw = (await this._callMcp('linear', 'list-projects', filter ?? {})) as
            | { projects?: LinearProject[] }
            | LinearProject[]
            | null
            | undefined
          if (Array.isArray(raw)) return raw
          return raw?.projects ?? []
        },
      },
    }
  }

  /**
   * Returns a Next.js-style route handler that implements the LEA-186
   * local-dev cookie-exchange flow. Mount at /api/_leash/dev-auth.
   *
   * @example
   * ```ts
   * // src/app/api/_leash/dev-auth/route.ts
   * import { Leash } from '@leash/sdk/leash'
   * export const GET = Leash.createDevAuthHandler()
   * ```
   */
  static createDevAuthHandler(opts: DevAuthHandlerOptions = {}): (req: unknown) => Promise<Response> {
    const {
      cookieName = 'leash-auth',
      cookieMaxAge = 8 * 60 * 60,
      redirectTo = '/',
    } = opts

    return async function leashDevAuthHandler(req: unknown): Promise<Response> {
      // Extract the ?code= query param from the request URL.
      // Works with Next.js Request (Web API) and any object with a url string.
      let code: string | null = null
      try {
        const reqAny = req as Record<string, unknown>
        let urlStr: string | undefined
        if (typeof reqAny['url'] === 'string') {
          urlStr = reqAny['url']
        }
        if (urlStr) {
          const url = new URL(urlStr, 'http://localhost')
          code = url.searchParams.get('code')
        }
      } catch {
        // Fall through — code stays null
      }

      if (!code) {
        return new Response(
          _devAuthErrorPage({
            title: 'Missing exchange code',
            body: 'No <code>code</code> parameter was found in the URL.',
            hint: 'Click <strong>Open in local dev</strong> from the Leash dashboard to start a fresh session.',
          }),
          { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }

      const platformUrl = process.env['LEASH_PLATFORM_URL'] ?? DEFAULT_PLATFORM_URL

      let exchangeRes: Response
      try {
        exchangeRes = await fetch(`${platformUrl}/api/auth/exchange-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
      } catch {
        return new Response(
          _devAuthErrorPage({
            title: 'Could not reach Leash',
            body: 'Failed to connect to the Leash platform to exchange your code.',
            hint: 'Check your internet connection and try again.',
          }),
          { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }

      if (exchangeRes.status === 410) {
        // Platform contract: { success: false, error: "..." }
        // leash-platform/src/app/api/auth/exchange-code/route.ts lines 82–85, 98–101
        let platformReason: string | undefined
        try {
          const errJson = await exchangeRes.clone().json() as Record<string, unknown>
          if (typeof errJson['error'] === 'string') platformReason = errJson['error']
        } catch { /* ignore parse failures */ }
        return new Response(
          _devAuthErrorPage({
            title: 'Code expired or already used',
            body: 'This exchange code has expired or was already used.' +
              (platformReason ? `<br><small>${_escapeHtml(platformReason)}</small>` : ''),
            hint: 'Click <strong>Open in local dev</strong> from the Leash dashboard to get a fresh code.',
          }),
          { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }

      if (exchangeRes.status === 404) {
        // Platform contract: { success: false, error: "Unknown code" }
        let platformReason: string | undefined
        try {
          const errJson = await exchangeRes.clone().json() as Record<string, unknown>
          if (typeof errJson['error'] === 'string') platformReason = errJson['error']
        } catch { /* ignore parse failures */ }
        return new Response(
          _devAuthErrorPage({
            title: 'Unknown code',
            body: 'The exchange code was not recognised by the Leash platform.' +
              (platformReason ? `<br><small>${_escapeHtml(platformReason)}</small>` : ''),
            hint: 'Click <strong>Open in local dev</strong> from the Leash dashboard to get a valid code.',
          }),
          { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }

      if (!exchangeRes.ok) {
        // Pass through 4xx codes verbatim; collapse unexpected 5xx to SDK 500.
        const status = exchangeRes.status >= 400 && exchangeRes.status < 500 ? exchangeRes.status : 500
        let platformReason: string | undefined
        try {
          const errJson = await exchangeRes.clone().json() as Record<string, unknown>
          if (typeof errJson['error'] === 'string') platformReason = errJson['error']
        } catch { /* ignore parse failures */ }
        return new Response(
          _devAuthErrorPage({
            title: 'Authentication failed',
            body: 'The Leash platform returned an unexpected error.' +
              (platformReason ? `<br><small>${_escapeHtml(platformReason)}</small>` : ''),
            hint: 'Try again or contact support if the issue persists.',
          }),
          { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }

      // Platform contract: { success: true, data: { token, expires_at } }
      // leash-platform/src/app/api/auth/exchange-code/route.ts lines 158–164
      let token: string
      let resolvedMaxAge: number = cookieMaxAge
      try {
        const json = await exchangeRes.json() as Record<string, unknown>

        if (json['success'] !== true) {
          throw new Error(
            typeof json['error'] === 'string' ? json['error'] : 'Exchange failed'
          )
        }

        const payload = json['data'] as Record<string, unknown> | undefined
        if (!payload || typeof payload['token'] !== 'string') {
          throw new Error('No token in response')
        }

        token = payload['token']
        const expiresAt = typeof payload['expires_at'] === 'string'
          ? payload['expires_at']
          : undefined
        if (expiresAt) {
          const ms = new Date(expiresAt).getTime() - Date.now()
          resolvedMaxAge = Math.max(0, Math.floor(ms / 1000))
        }
      } catch {
        return new Response(
          _devAuthErrorPage({
            title: 'Unexpected response from Leash',
            body: 'The platform response did not contain a valid token.',
            hint: 'Try again or contact support if the issue persists.',
          }),
          { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }

      const cookieValue = `${cookieName}=${token}; HttpOnly; Path=/; Max-Age=${resolvedMaxAge}; SameSite=Lax`

      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectTo,
          'Set-Cookie': cookieValue,
        },
      })
    }
  }

  private async _call(provider: string, action: string, params?: unknown): Promise<unknown> {
    return this._post(
      `${this.platformUrl}/api/integrations/${provider}/${action}`,
      params,
      { docsUrl: `https://leash.build/docs/integrations/${provider}` },
    )
  }

  /**
   * MCP-proxy call path used by typed namespaces that delegate to upstream
   * MCP servers (e.g. Linear). The platform routes these through
   * `/api/integrations/mcp/<provider>/<method>` — see LEA-180.
   */
  private async _callMcp(provider: string, action: string, params?: unknown): Promise<unknown> {
    return this._post(
      `${this.platformUrl}/api/integrations/mcp/${provider}/${action}`,
      params,
      { docsUrl: `https://leash.build/docs/integrations/${provider}` },
    )
  }

  private async _post(url: string, params: unknown, opts: { docsUrl: string }): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Critical #1: platform contract — X-API-Key for app key, NOT Authorization.
    // Authorization: Bearer is reserved for user JWT (resolveUser in
    // leash-platform/src/lib/integrations/resolve-user.ts). Sending lsk_live_*
    // there causes verifyToken() to reject it before the API-key check runs → 401.
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }

    if (this.cookieValue) {
      headers['Cookie'] = `leash-auth=${this.cookieValue}`
    }

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(params ?? {}),
      })
    } catch (e) {
      throw new LeashError({
        code: 'NETWORK_ERROR',
        message: e instanceof Error ? e.message : 'Failed to reach Leash platform',
        action: 'Check your network connection and that the Leash platform is reachable.',
        seeAlso: 'https://leash.build/docs/sdk',
      })
    }

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
          seeAlso: 'https://leash.build/docs/sdk',
        })
      }

      if (res.status === 403) {
        throw new LeashError({
          code: 'INTEGRATION_NOT_ENABLED',
          message: errorMessage,
          action:
            'Connect the integration at /dashboard/integrations and make sure this app is on the allow-list.',
          seeAlso: 'https://leash.build/dashboard/integrations',
        })
      }

      throw new LeashError({
        code: 'INTEGRATION_ERROR',
        message: errorMessage,
        action: 'Check your integration configuration and try again — the upstream provider returned an error.',
        seeAlso: opts.docsUrl,
      })
    }

    const data = await res.json() as Record<string, unknown>
    return data.data ?? data
  }
}

/**
 * Extract a named cookie value from any HTTP request object.
 * Mirrors the battle-tested strategy in src/server/auth.ts (extractToken).
 * Handles:
 *   - Next.js NextRequest: req.cookies.get(name) → { value: string } | string
 *   - Express cookie-parser: req.cookies[name] → string
 *   - Raw Node/Hono/Fastify/Lambda: req.headers.cookie string
 *   - Anything else: returns undefined, never throws
 */
export function _extractCookie(req: any, name: string): string | undefined {
  try {
    // Strategy 1: cookies.get(name) — Next.js NextRequest / Web Request
    if (req.cookies?.get && typeof req.cookies.get === 'function') {
      const result = req.cookies.get(name)
      if (result !== undefined) {
        return typeof result === 'object' && result !== null && 'value' in result
          ? result.value
          : (result as string)
      }
    }

    // Strategy 2: cookies[name] — Express with cookie-parser or plain object
    if (req.cookies && typeof req.cookies === 'object' && name in req.cookies) {
      const entry = req.cookies[name]
      if (entry !== undefined) {
        return typeof entry === 'object' && entry !== null && 'value' in entry
          ? entry.value
          : (entry as string)
      }
    }

    // Strategy 3: raw headers.cookie string — Node IncomingMessage, Hono, Fastify, Lambda
    const cookieHeader: string | null | undefined =
      req.headers?.get?.('cookie') ?? req.headers?.cookie
    if (typeof cookieHeader === 'string' && cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
      if (match) return match[1]
    }
  } catch {
    // Never throw — return undefined for any unexpected shape
  }

  return undefined
}

function _escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Render a minimal, action-oriented HTML error page for the dev-auth handler.
 * Not JSON — this is a browser redirect target.
 */
function _devAuthErrorPage(opts: { title: string; body: string; hint: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leash — ${opts.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; color: #111; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    p { color: #444; line-height: 1.6; }
    .hint { margin-top: 1.25rem; padding: 12px 16px; background: #f5f5f5; border-radius: 6px; font-size: 0.9rem; }
    a { color: #0070f3; }
  </style>
</head>
<body>
  <h1>${opts.title}</h1>
  <p>${opts.body}</p>
  <div class="hint">${opts.hint}</div>
  <p style="margin-top:2rem;font-size:0.8rem;color:#999">
    <a href="https://leash.build/dashboard">Leash Dashboard</a> &middot;
    <a href="https://leash.build/docs/sdk">Docs</a>
  </p>
</body>
</html>`
}
