import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Leash } from '../../src/leash'
import { LeashError } from '../../src/errors'
import type {
  LinearIssue,
  LinearComment,
  LinearTeam,
  LinearProject,
} from '../../src/integrations/providers/linear'

function makeRequest(cookieValue?: string) {
  return {
    cookies: {
      get(name: string): { value: string } | undefined {
        if (name === 'leash-auth' && cookieValue !== undefined) {
          return { value: cookieValue }
        }
        return undefined
      },
    },
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Leash.integrations.linear — wiring', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'server-api-key'
    delete process.env['LEASH_PLATFORM_URL']
  })

  it('namespace is exposed on leash.integrations', () => {
    const leash = new Leash({ request: makeRequest('tok'), platformUrl: 'https://leash.build' })
    expect(leash.integrations.linear).toBeDefined()
    expect(typeof leash.integrations.linear.listIssues).toBe('function')
    expect(typeof leash.integrations.linear.getIssue).toBe('function')
    expect(typeof leash.integrations.linear.createIssue).toBe('function')
    expect(typeof leash.integrations.linear.updateIssue).toBe('function')
    expect(typeof leash.integrations.linear.addComment).toBe('function')
    expect(typeof leash.integrations.linear.listTeams).toBe('function')
    expect(typeof leash.integrations.linear.listProjects).toBe('function')
  })
})

describe('Leash.integrations.linear — wire path and headers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'server-api-key'
    delete process.env['LEASH_PLATFORM_URL']
  })

  it('listIssues POSTs to /api/integrations/linear/list-issues with the filter in body and platform headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: { issues: [], cursor: undefined } })
    )
    const leash = new Leash({
      request: makeRequest('auth-cookie-value'),
      platformUrl: 'https://leash.build',
    })

    await leash.integrations.linear.listIssues({ teamId: 'team-1', limit: 25 })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/linear/list-issues',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': 'server-api-key',
          Cookie: 'leash-auth=auth-cookie-value',
        }),
        body: JSON.stringify({ teamId: 'team-1', limit: 25 }),
      })
    )

    // Authorization must be absent (Critical #1)
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('listIssues with no args POSTs an empty body object', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: { issues: [] } })
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    await leash.integrations.linear.listIssues()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/linear/list-issues',
      expect.objectContaining({ body: JSON.stringify({}) })
    )
  })

  it('getIssue POSTs to /api/integrations/linear/get-issue with { id }', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: { id: 'iss-1', identifier: 'LEA-1', title: 'x' } })
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    await leash.integrations.linear.getIssue('LEA-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/linear/get-issue',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'LEA-1' }),
      })
    )
  })

  it('createIssue POSTs to /api/integrations/linear/create-issue with the input body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: { id: 'iss-1', identifier: 'LEA-2', title: 'New' } })
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    const input = { teamId: 'team-1', title: 'New', description: 'd', priority: 2 as const }
    await leash.integrations.linear.createIssue(input)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/linear/create-issue',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) })
    )
  })

  it('updateIssue POSTs to /api/integrations/linear/update-issue with { id, ...patch }', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: { id: 'iss-1', identifier: 'LEA-2', title: 'Updated' } })
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    await leash.integrations.linear.updateIssue('iss-1', { title: 'Updated', priority: 1 as const })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/linear/update-issue',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'iss-1', title: 'Updated', priority: 1 }),
      })
    )
  })

  it('addComment POSTs to /api/integrations/linear/add-comment with { issueId, body }', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: { id: 'cmt-1', body: 'Hello', issueId: 'iss-1' } })
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    await leash.integrations.linear.addComment('iss-1', 'Hello')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/linear/add-comment',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ issueId: 'iss-1', body: 'Hello' }),
      })
    )
  })

  it('listTeams POSTs to /api/integrations/linear/list-teams with empty body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: { teams: [] } })
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    await leash.integrations.linear.listTeams()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/linear/list-teams',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) })
    )
  })

  it('listProjects POSTs to /api/integrations/linear/list-projects with optional teamId filter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: { projects: [] } })
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    await leash.integrations.linear.listProjects({ teamId: 'team-2' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/integrations/linear/list-projects',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ teamId: 'team-2' }) })
    )
  })
})

describe('Leash.integrations.linear — response unwrapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'server-api-key'
    delete process.env['LEASH_PLATFORM_URL']
  })

  it('listIssues returns { issues, cursor } from data envelope', async () => {
    const sampleIssue: LinearIssue = {
      id: 'iss-1',
      identifier: 'LEA-7',
      title: 'Sample',
      description: 'desc',
      priority: 2,
      url: 'https://linear.app/leashbuild/issue/LEA-7',
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: { issues: [sampleIssue], cursor: 'next-cursor' } })
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    const out = await leash.integrations.linear.listIssues()
    expect(out.issues).toHaveLength(1)
    expect(out.issues[0].identifier).toBe('LEA-7')
    expect(out.cursor).toBe('next-cursor')
  })

  it('getIssue returns LinearIssue', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: { id: 'iss-1', identifier: 'LEA-1', title: 'Hello', priority: 0 },
      })
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    const issue = await leash.integrations.linear.getIssue('LEA-1')
    expect(issue.id).toBe('iss-1')
    expect(issue.identifier).toBe('LEA-1')
    expect(issue.title).toBe('Hello')
  })

  it('addComment returns LinearComment', async () => {
    const sample: LinearComment = {
      id: 'cmt-1',
      body: 'Hi',
      issueId: 'iss-1',
      createdAt: '2026-05-12T00:00:00Z',
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: sample }))
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    const cmt = await leash.integrations.linear.addComment('iss-1', 'Hi')
    expect(cmt.id).toBe('cmt-1')
    expect(cmt.body).toBe('Hi')
  })

  it('listTeams returns LinearTeam[] from { teams }', async () => {
    const team: LinearTeam = { id: 'team-1', key: 'LEA', name: 'Leash_build' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: { teams: [team] } }))
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    const teams = await leash.integrations.linear.listTeams()
    expect(Array.isArray(teams)).toBe(true)
    expect(teams[0].key).toBe('LEA')
  })

  it('listProjects returns LinearProject[] from { projects }', async () => {
    const project: LinearProject = {
      id: 'proj-1',
      name: 'SDK',
      state: 'started',
      url: 'https://linear.app/leashbuild/project/SDK',
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: { projects: [project] } })
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    const projects = await leash.integrations.linear.listProjects()
    expect(projects[0].name).toBe('SDK')
  })

  it('listTeams accepts a bare array in data (alternate envelope)', async () => {
    // Some MCP servers return the array directly without a wrapper key.
    const team: LinearTeam = { id: 'team-1', key: 'LEA', name: 'Leash_build' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: [team] }))
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    const teams = await leash.integrations.linear.listTeams()
    expect(teams).toHaveLength(1)
    expect(teams[0].id).toBe('team-1')
  })
})

describe('Leash.integrations.linear — error mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'server-api-key'
    delete process.env['LEASH_PLATFORM_URL']
  })

  it('401 → LeashError UNAUTHORIZED', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'Unauthorized' }, 401)
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    await expect(leash.integrations.linear.listIssues()).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'UNAUTHORIZED',
      })
    )
  })

  it('403 → LeashError INTEGRATION_NOT_ENABLED mentioning /dashboard/integrations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'Linear not enabled' }, 403)
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    await expect(leash.integrations.linear.getIssue('LEA-1')).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'INTEGRATION_NOT_ENABLED',
        action: expect.stringContaining('/dashboard/integrations'),
      })
    )
  })

  it('500 → LeashError INTEGRATION_ERROR surfacing upstream message and seeAlso → Linear docs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'Linear GraphQL: rate limited' }, 500)
    )
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    await expect(
      leash.integrations.linear.createIssue({ teamId: 't', title: 'x' })
    ).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'INTEGRATION_ERROR',
        message: expect.stringContaining('rate limited'),
        seeAlso: expect.stringContaining('linear'),
      })
    )
  })

  it('fetch throw → LeashError NETWORK_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('failed to fetch'))
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    await expect(leash.integrations.linear.listTeams()).rejects.toEqual(
      expect.objectContaining<Partial<LeashError>>({
        code: 'NETWORK_ERROR',
      })
    )
  })
})

// ─── Type-shape constraints (compile-time) ────────────────────────────────────
// These are exercises for the TypeScript compiler: they must pass `tsc` without
// errors. If the types regress, the test file itself will stop compiling.

describe('Leash.integrations.linear — typed shape (compile-time)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', undefined)
    process.env['LEASH_API_KEY'] = 'server-api-key'
  })

  it('listIssues filter is fully typed', () => {
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    // All valid filter fields
    void leash.integrations.linear.listIssues({
      teamId: 't',
      assigneeId: 'a',
      stateType: 'started',
      limit: 10,
      cursor: 'c',
    })
    // No args is valid
    void leash.integrations.linear.listIssues()
    // @ts-expect-error — unknown filter key
    void leash.integrations.linear.listIssues({ bogus: true })
    // @ts-expect-error — stateType must be a known union member
    void leash.integrations.linear.listIssues({ stateType: 'made-up' })
  })

  it('createIssue requires teamId and title', () => {
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    void leash.integrations.linear.createIssue({ teamId: 't', title: 'x' })
    // @ts-expect-error — missing teamId
    void leash.integrations.linear.createIssue({ title: 'x' })
    // @ts-expect-error — missing title
    void leash.integrations.linear.createIssue({ teamId: 't' })
  })

  it('updateIssue patch fields are all optional', () => {
    const leash = new Leash({ request: makeRequest('t'), platformUrl: 'https://leash.build' })
    void leash.integrations.linear.updateIssue('iss-1', { title: 'new' })
    void leash.integrations.linear.updateIssue('iss-1', {})
    // @ts-expect-error — unknown patch key
    void leash.integrations.linear.updateIssue('iss-1', { bogus: 1 })
  })
})
