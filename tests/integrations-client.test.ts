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
