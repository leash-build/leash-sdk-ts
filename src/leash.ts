import { LeashError } from './errors.js'
import type { GmailMessageList, GmailLabelList, CalendarList, CalendarEventList, CalendarEvent, DriveFile, DriveFileList } from './integrations/types.js'

const DEFAULT_PLATFORM_URL = 'https://leash.build'

interface LeashOptions {
  // Typed as `any` to accept any HTTP framework — Next.js NextRequest, Express,
  // Hono, Fastify, raw Node.js IncomingMessage, Lambda events, etc.
  // (Framework-agnostic stance documented in CLAUDE.md line 63.)
  request?: any
  platformUrl?: string
  apiKey?: string
}

type TransportMode = 'server' | 'browser'

export class Leash {
  private mode: TransportMode
  private platformUrl: string
  private apiKey?: string
  private cookieValue?: string

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
  }

  constructor(opts: LeashOptions = {}) {
    // Critical #3: respect LEASH_PLATFORM_URL env var (documented staging dev workflow)
    this.platformUrl = opts.platformUrl ?? process.env['LEASH_PLATFORM_URL'] ?? DEFAULT_PLATFORM_URL

    if (opts.request !== undefined) {
      // Server mode
      this.mode = 'server'

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
    }
  }

  private async _call(provider: string, action: string, params?: unknown): Promise<unknown> {
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

    const res = await fetch(`${this.platformUrl}/api/integrations/${provider}/${action}`, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
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
        action: 'Check the Leash platform status and your integration configuration.',
        seeAlso: 'https://leash.build/docs/integrations/gmail',
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
