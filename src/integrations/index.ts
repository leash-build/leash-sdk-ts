// Client
export { LeashIntegrations } from './client.js'

// Server
export { getIntegrations } from './server.js'

// MCP
export { getLeashMcpConfig, getLeashMcpUrl } from './mcp.js'
export type { McpServerConfig } from './mcp.js'

// Types
export { IntegrationError } from './types.js'
export type {
  ConnectionStatus,
  GmailMessageList, GmailLabelList, GmailMessage, GmailLabel,
  DriveFile, DriveFileList,
  CalendarListEntry, CalendarList, CalendarEvent, CalendarEventList,
} from './types.js'

// Provider types — Linear (LEA-180)
export type {
  LinearIssue,
  LinearComment,
  LinearTeam,
  LinearProject,
  LinearStateType,
  LinearPriority,
  LinearProjectState,
  LinearUserRef,
  LinearStateRef,
  LinearTeamRef,
  LinearListIssuesFilter,
  LinearListIssuesResult,
  LinearCreateIssueInput,
  LinearUpdateIssuePatch,
  LinearListProjectsFilter,
  LeashLinearNamespace,
} from './providers/linear.js'
