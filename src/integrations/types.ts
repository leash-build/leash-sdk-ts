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
  code?: 'not_connected' | 'token_expired'
  connectUrl?: string
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
