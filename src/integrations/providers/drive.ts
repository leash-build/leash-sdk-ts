/**
 * Google Drive integration types.
 */

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

export interface DriveListParams {
  /** Drive search query (Google Drive API query syntax). */
  query?: string
  /** Maximum number of files to return. */
  maxResults?: number
  /** Restrict to files within a specific folder. */
  folderId?: string
}

export interface DriveUploadParams {
  /** File name. */
  name: string
  /** File content (text or base64-encoded). */
  content: string
  /** MIME type of the file. */
  mimeType: string
  /** Optional parent folder ID. */
  parentId?: string
}
