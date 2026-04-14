import { IntegrationError } from './types'
import type { ConnectionStatus, GmailMessageList, GmailLabelList, DriveFile, DriveFileList, CalendarList, CalendarEventList, CalendarEvent } from './types'

const DEFAULT_PLATFORM_URL = 'https://leash.build'

interface IntegrationsConfig {
  platformUrl?: string
  /** For server-side usage: pass the auth token directly */
  authToken?: string
  /** API key for app identification (X-API-Key header) */
  apiKey?: string
}

export class LeashIntegrations {
  private platformUrl: string
  private authToken?: string
  private apiKey?: string
  private _envCache?: Record<string, string>

  constructor(config?: IntegrationsConfig) {
    this.platformUrl = config?.platformUrl || process.env.LEASH_PLATFORM_URL || DEFAULT_PLATFORM_URL
    this.authToken = config?.authToken
    this.apiKey = config?.apiKey || process.env.LEASH_API_KEY
  }

  /** Gmail integration */
  get gmail() {
    return {
      listMessages: (params?: {
        query?: string
        maxResults?: number
        labelIds?: string[]
        pageToken?: string
      }): Promise<GmailMessageList> =>
        this.call('gmail', 'list-messages', params),

      getMessage: (messageId: string, format?: 'full' | 'metadata' | 'minimal' | 'raw') =>
        this.call('gmail', 'get-message', { messageId, format }),

      sendMessage: (message: {
        to: string
        subject: string
        body: string
        cc?: string
        bcc?: string
      }) =>
        this.call('gmail', 'send-message', message),

      searchMessages: (query: string, maxResults?: number): Promise<GmailMessageList> =>
        this.call('gmail', 'search-messages', { query, maxResults }),

      listLabels: (): Promise<GmailLabelList> =>
        this.call('gmail', 'list-labels'),

      getProfile: () =>
        this.call('gmail', 'get-profile'),
    }
  }

  /** Google Drive integration */
  get drive() {
    return {
      /** List files in the user's Drive. */
      listFiles: (params?: {
        query?: string
        maxResults?: number
        folderId?: string
      }): Promise<DriveFileList> =>
        this.call('google_drive', 'list-files', params),

      /** Get file metadata by ID. */
      getFile: (fileId: string): Promise<DriveFile> =>
        this.call('google_drive', 'get-file', { fileId }),

      /** Download file content by ID. */
      downloadFile: (fileId: string): Promise<any> =>
        this.call('google_drive', 'download-file', { fileId }),

      /** Create a new folder. */
      createFolder: (name: string, parentId?: string): Promise<DriveFile> =>
        this.call('google_drive', 'create-folder', { name, parentId }),

      /** Upload a file to Drive. */
      uploadFile: (params: {
        name: string
        content: string
        mimeType: string
        parentId?: string
      }): Promise<DriveFile> =>
        this.call('google_drive', 'upload-file', params),

      /** Delete a file by ID. */
      deleteFile: (fileId: string): Promise<any> =>
        this.call('google_drive', 'delete-file', { fileId }),

      /** Search files using a query string. */
      searchFiles: (query: string, maxResults?: number): Promise<DriveFileList> =>
        this.call('google_drive', 'search-files', { query, maxResults }),
    }
  }

  /** Google Calendar integration */
  get calendar() {
    return {
      /** List all calendars for the user. */
      listCalendars: (): Promise<CalendarList> =>
        this.call('google_calendar', 'list-calendars'),

      /** List events from a calendar. */
      listEvents: (params?: {
        calendarId?: string
        timeMin?: string
        timeMax?: string
        maxResults?: number
        query?: string
        singleEvents?: boolean
        orderBy?: string
      }): Promise<CalendarEventList> =>
        this.call('google_calendar', 'list-events', params),

      /** Create a new calendar event. */
      createEvent: (params: {
        calendarId?: string
        summary: string
        description?: string
        location?: string
        start: { dateTime?: string; date?: string; timeZone?: string }
        end: { dateTime?: string; date?: string; timeZone?: string }
        attendees?: { email: string }[]
      }): Promise<CalendarEvent> =>
        this.call('google_calendar', 'create-event', params),

      /** Get a single event by ID. */
      getEvent: (eventId: string, calendarId?: string): Promise<CalendarEvent> =>
        this.call('google_calendar', 'get-event', { eventId, calendarId }),
    }
  }

  /** Access a custom integration by name. Returns an untyped client. */
  integration(name: string) {
    return {
      call: async (path: string, options?: { method?: string; body?: any; headers?: Record<string, string> }) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }

        if (this.authToken) {
          headers['Authorization'] = `Bearer ${this.authToken}`
        }

        if (this.apiKey) {
          headers['X-API-Key'] = this.apiKey
        }

        const res = await fetch(
          `${this.platformUrl}/api/integrations/custom/${encodeURIComponent(name)}`,
          {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ path, ...options }),
          }
        )

        const data = await res.json()

        if (!data.success) {
          throw new IntegrationError(data)
        }

        return data.data
      }
    }
  }

  /**
   * Call any MCP server tool directly — no pre-registration needed.
   * The platform spawns the MCP server process and executes the tool.
   *
   * @param npmPackage - The npm package name of the MCP server (e.g., '@modelcontextprotocol/server-notion')
   * @param tool - The tool name to call
   * @param args - Optional arguments to pass to the tool
   */
  async mcp(npmPackage: string, tool: string, args?: Record<string, any>): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`
    if (this.apiKey) headers['X-API-Key'] = this.apiKey

    const res = await fetch(`${this.platformUrl}/api/mcp/run`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ package: npmPackage, tool, args: args ?? {} }),
    })

    const data = await res.json()
    if (!data.success) throw new IntegrationError(data)
    return data.data
  }

  /**
   * Fetch environment variables for this app from the platform.
   * Results are cached for the lifetime of this client instance.
   *
   * @param key - Optional specific key to fetch. If omitted, returns all env vars.
   */
  async getEnv(): Promise<Record<string, string>>
  async getEnv(key: string): Promise<string | null>
  async getEnv(key?: string): Promise<Record<string, string> | string | null> {
    if (!this._envCache) {
      const headers: Record<string, string> = {}
      if (this.apiKey) headers['X-API-Key'] = this.apiKey
      if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`

      const res = await fetch(`${this.platformUrl}/api/apps/env`, {
        headers,
        credentials: 'include',
      })

      const data = await res.json()
      if (!data.success) throw new IntegrationError(data)
      this._envCache = data.data as Record<string, string>
    }

    if (key) return this._envCache[key] ?? null
    return this._envCache
  }

  /** Generic proxy call for any provider action */
  async call(provider: string, action: string, body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }

    const res = await fetch(
      `${this.platformUrl}/api/integrations/${provider}/${action}`,
      {
        method: 'POST',
        headers,
        credentials: 'include', // Send leash-auth cookie in browser context
        body: body ? JSON.stringify(body) : undefined,
      }
    )

    const data = await res.json()

    if (!data.success) {
      throw new IntegrationError(data)
    }

    return data.data
  }

  /** Check if a provider is connected for the current user */
  async isConnected(providerId: string): Promise<boolean> {
    try {
      const connections = await this.getConnections()
      const conn = connections.find((c) => c.providerId === providerId)
      return conn?.status === 'active'
    } catch {
      return false
    }
  }

  /** Get connection status for all providers */
  async getConnections(): Promise<ConnectionStatus[]> {
    const headers: Record<string, string> = {}
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }

    const res = await fetch(`${this.platformUrl}/api/integrations/connections`, {
      headers,
      credentials: 'include',
    })

    const data = await res.json()
    if (!data.success) throw new IntegrationError(data)
    return data.data
  }

  /** Get the URL to connect a provider (for UI buttons) */
  getConnectUrl(providerId: string, returnUrl?: string): string {
    const params = returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : ''
    return `${this.platformUrl}/api/integrations/connect/${providerId}${params}`
  }
}
