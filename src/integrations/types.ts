export interface ConnectionStatus {
  providerId: string
  providerName: string
  status: 'active' | 'expired' | 'revoked' | 'error' | 'not_connected'
  accountEmail?: string
  accountId?: string
  connectedAt?: string
}

export interface IntegrationErrorResponse {
  success: false
  error: string
  code?: string
  connectUrl?: string
}

/** Resolved config for a customer-registered MCP server (LEA-143). */
export interface CustomMcpServerConfig {
  slug: string
  displayName: string
  /** Customer's MCP endpoint. */
  url: string
  /** Headers to attach to every request, including resolved Authorization
   *  for bearer-auth servers. */
  headers: Record<string, string>
}

export interface GmailMessage {
  id: string
  threadId: string
}

export interface GmailMessageList {
  messages?: GmailMessage[]
  nextPageToken?: string
  resultSizeEstimate?: number
}

export interface GmailLabel {
  id: string
  name: string
  type: string
}

export interface GmailLabelList {
  labels: GmailLabel[]
}

// Google Drive types
export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  createdTime?: string
  modifiedTime?: string
  parents?: string[]
  webViewLink?: string
  webContentLink?: string
}

export interface DriveFileList {
  files: DriveFile[]
  nextPageToken?: string
}

// Google Calendar types
export interface CalendarListEntry {
  id: string
  summary: string
  description?: string
  timeZone?: string
  primary?: boolean
  backgroundColor?: string
  foregroundColor?: string
}

export interface CalendarList {
  calendars: CalendarListEntry[]
}

export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: { email: string; responseStatus?: string }[]
  status?: string
  htmlLink?: string
  created?: string
  updated?: string
}

export interface CalendarEventList {
  events: CalendarEvent[]
  nextPageToken?: string
}

export class IntegrationError extends Error {
  public code?: string
  public connectUrl?: string

  constructor(response: IntegrationErrorResponse) {
    super(response.error)
    this.name = 'IntegrationError'
    this.code = response.code
    this.connectUrl = response.connectUrl
  }
}
