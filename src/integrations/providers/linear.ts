/**
 * Linear integration types.
 *
 * Shapes are based on the Linear MCP server's JSON responses, which mirror
 * the public Linear GraphQL API field names (camelCase). The SDK intentionally
 * surfaces only the fields most users care about — the platform proxy passes
 * through any extra fields, so consumers can still cast to a richer type if
 * they need something we haven't exposed here.
 *
 * If Linear's wire format changes, update these types and the corresponding
 * tests in `tests/integrations/linear.test.ts`.
 */

/** A Linear workflow state classification. */
export type LinearStateType =
  | 'backlog'
  | 'unstarted'
  | 'started'
  | 'completed'
  | 'canceled'
  | 'triage'

/**
 * Linear priority levels.
 *  0 = no priority
 *  1 = urgent
 *  2 = high
 *  3 = normal / medium
 *  4 = low
 */
export type LinearPriority = 0 | 1 | 2 | 3 | 4

/** A minimal user reference Linear returns on issues and comments. */
export interface LinearUserRef {
  id: string
  name?: string
  email?: string
  displayName?: string
}

/** A minimal state reference returned on issues. */
export interface LinearStateRef {
  id: string
  name: string
  type: LinearStateType
  color?: string
}

/** A minimal team reference returned on issues. */
export interface LinearTeamRef {
  id: string
  key: string
  name: string
}

/** A Linear issue. */
export interface LinearIssue {
  /** Linear UUID for the issue. */
  id: string
  /** Human-readable identifier, e.g. `LEA-180`. May be omitted for new issues. */
  identifier?: string
  title: string
  description?: string
  priority?: LinearPriority
  /** ISO 8601 timestamp. */
  createdAt?: string
  /** ISO 8601 timestamp. */
  updatedAt?: string
  /** Linear URL to view this issue in the app. */
  url?: string
  assignee?: LinearUserRef
  state?: LinearStateRef
  team?: LinearTeamRef
  labelIds?: string[]
  projectId?: string
}

/** A Linear comment on an issue. */
export interface LinearComment {
  id: string
  body: string
  issueId: string
  user?: LinearUserRef
  /** ISO 8601 timestamp. */
  createdAt?: string
  /** ISO 8601 timestamp. */
  updatedAt?: string
  url?: string
}

/** A Linear team. */
export interface LinearTeam {
  id: string
  key: string
  name: string
  description?: string
  private?: boolean
  icon?: string
  color?: string
}

/** Linear project lifecycle state. */
export type LinearProjectState =
  | 'planned'
  | 'started'
  | 'paused'
  | 'completed'
  | 'canceled'
  | 'backlog'

/** A Linear project. */
export interface LinearProject {
  id: string
  name: string
  description?: string
  state?: LinearProjectState
  /** ISO date (YYYY-MM-DD). */
  targetDate?: string
  /** ISO date (YYYY-MM-DD). */
  startDate?: string
  url?: string
  teamIds?: string[]
  progress?: number
}

// ─── Method parameter shapes ──────────────────────────────────────────────────

export interface LinearListIssuesFilter {
  teamId?: string
  assigneeId?: string
  stateType?: LinearStateType
  limit?: number
  cursor?: string
}

export interface LinearListIssuesResult {
  issues: LinearIssue[]
  cursor?: string
}

export interface LinearCreateIssueInput {
  teamId: string
  title: string
  description?: string
  assigneeId?: string
  priority?: LinearPriority
  labelIds?: string[]
}

/** Partial of LinearCreateIssueInput — all keys optional. */
export type LinearUpdateIssuePatch = Partial<LinearCreateIssueInput>

export interface LinearListProjectsFilter {
  teamId?: string
}

/**
 * Surface contract for `leash.integrations.linear`.
 * Kept in this file so the Linear namespace owns its full shape — `Leash`
 * just wires the calls.
 */
export interface LeashLinearNamespace {
  listIssues(filter?: LinearListIssuesFilter): Promise<LinearListIssuesResult>
  getIssue(id: string): Promise<LinearIssue>
  createIssue(input: LinearCreateIssueInput): Promise<LinearIssue>
  updateIssue(id: string, patch: LinearUpdateIssuePatch): Promise<LinearIssue>
  addComment(issueId: string, body: string): Promise<LinearComment>
  listTeams(): Promise<LinearTeam[]>
  listProjects(filter?: LinearListProjectsFilter): Promise<LinearProject[]>
}
