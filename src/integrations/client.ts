import { IntegrationError } from './types'
import type { ConnectionStatus, GmailMessageList, GmailLabelList, DriveFile, DriveFileList, CalendarList, CalendarEventList, CalendarEvent } from './types'

const DEFAULT_PLATFORM_URL = 'https://leash.build'

interface IntegrationsConfig {
  platformUrl?: string
  /** For server-side usage: pass the auth token directly */
  authToken?: string
}

export class LeashIntegrations {
  private platformUrl: string
  private authToken?: string

  constructor(config?: IntegrationsConfig) {
    this.platformUrl = config?.platformUrl || process.env.LEASH_PLATFORM_URL || DEFAULT_PLATFORM_URL
    this.authToken = config?.authToken
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

  /** Generic proxy call for any provider action */
  async call(provider: string, action: string, body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
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
