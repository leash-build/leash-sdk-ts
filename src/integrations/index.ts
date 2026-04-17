// Client
export { LeashIntegrations } from './client.js'

// Server
export { getIntegrations } from './server.js'

// MCP
export { getLeashMcpConfig, getLeashMcpUrl } from './mcp.js'
export type { McpServerConfig } from './mcp.js'

// Hooks
export { useIntegrations } from './hooks/useIntegrations.js'
export { useIntegrationStatus } from './hooks/useIntegrationStatus.js'

// Types
export { IntegrationError } from './types.js'
export type {
  ConnectionStatus,
  GmailMessageList, GmailLabelList, GmailMessage, GmailLabel,
  DriveFile, DriveFileList,
  CalendarListEntry, CalendarList, CalendarEvent, CalendarEventList,
} from './types.js'
