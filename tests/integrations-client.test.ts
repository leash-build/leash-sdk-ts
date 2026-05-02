import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LeashIntegrations } from '../src/integrations/client'
import { IntegrationError } from '../src/integrations/types'

describe('LeashIntegrations', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('calls the platform integrations route with auth and API key headers', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { ok: true },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const client = new LeashIntegrations({
      platformUrl: 'https://staging.leash.build',
      authToken: 'jwt-token',
      apiKey: 'api-key',
    })

    const result = await client.call('gmail', 'list-messages', { maxResults: 5 })

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging.leash.build/api/integrations/gmail/list-messages',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-token',
          'X-API-Key': 'api-key',
        }),
        body: JSON.stringify({ maxResults: 5 }),
      })
    )
  })

  it('caches app env after the first successful request', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            WORKFLOW_SECRET: 'top-secret',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const client = new LeashIntegrations({
      platformUrl: 'https://staging.leash.build',
      apiKey: 'api-key',
    })

    await expect(client.getEnv('WORKFLOW_SECRET')).resolves.toBe('top-secret')
    await expect(client.getEnv()).resolves.toEqual({ WORKFLOW_SECRET: 'top-secret' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging.leash.build/api/apps/env',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'api-key',
        }),
        credentials: 'include',
      })
    )
  })

  it('getAccessToken POSTs to /api/integrations/token with the provider slug', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { provider: 'slack', accessToken: 'xoxb-abc' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const client = new LeashIntegrations({
      platformUrl: 'https://staging.leash.build',
      authToken: 'jwt-token',
      apiKey: 'api-key',
    })

    await expect(client.getAccessToken('slack')).resolves.toBe('xoxb-abc')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging.leash.build/api/integrations/token',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ provider: 'slack' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-token',
          'X-API-Key': 'api-key',
        }),
      })
    )
  })

  it('getAccessToken throws IntegrationError on not_connected', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: "Integration 'slack' is not connected.",
          code: 'not_connected',
          connectUrl: '/api/integrations/connect/slack',
        }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      )
    )

    const client = new LeashIntegrations({ platformUrl: 'https://staging.leash.build', authToken: 't' })
    await expect(client.getAccessToken('slack')).rejects.toEqual(
      expect.objectContaining<Partial<IntegrationError>>({
        code: 'not_connected',
        connectUrl: '/api/integrations/connect/slack',
      })
    )
  })

  it('getCustomMcpConfig GETs /api/integrations/mcp-config/<slug> and returns config', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            slug: 'acme-tools',
            displayName: 'Acme Tools',
            url: 'https://internal.acme.com/mcp',
            headers: { Authorization: 'Bearer tok_abc', 'X-Tenant': 'acme' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const client = new LeashIntegrations({
      platformUrl: 'https://staging.leash.build',
      apiKey: 'api-key',
    })

    const cfg = await client.getCustomMcpConfig('acme-tools')
    expect(cfg.url).toBe('https://internal.acme.com/mcp')
    expect(cfg.headers.Authorization).toBe('Bearer tok_abc')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging.leash.build/api/integrations/mcp-config/acme-tools',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'X-API-Key': 'api-key' }),
      })
    )
  })

  it('getCustomMcpConfig throws IntegrationError on unknown server', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Unknown MCP server: missing',
          code: 'unknown_mcp_server',
        }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      )
    )
    const client = new LeashIntegrations({ platformUrl: 'https://staging.leash.build', apiKey: 'k' })
    await expect(client.getCustomMcpConfig('missing')).rejects.toEqual(
      expect.objectContaining<Partial<IntegrationError>>({
        code: 'unknown_mcp_server',
      })
    )
  })

  it('throws IntegrationError when the platform returns an error envelope', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Integration not connected',
          code: 'not_connected',
          connectUrl: '/api/integrations/connect/gmail',
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const client = new LeashIntegrations({
      platformUrl: 'https://staging.leash.build',
      authToken: 'jwt-token',
    })

    await expect(client.call('gmail', 'list-messages')).rejects.toEqual(
      expect.objectContaining<Partial<IntegrationError>>({
        message: 'Integration not connected',
        code: 'not_connected',
        connectUrl: '/api/integrations/connect/gmail',
      })
    )
  })
})
