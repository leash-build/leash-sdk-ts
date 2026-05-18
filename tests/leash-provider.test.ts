import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchUserFromPlatform } from '../src/client/context/LeashProvider'

describe('fetchUserFromPlatform', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete process.env.LEASH_PLATFORM_URL
  })

  it('returns the user on 200 and ships credentials cross-origin', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: 'user_123',
            email: 'arvi@leash.build',
            name: 'Arvin',
            username: 'arvi',
            picture: 'https://cdn.example.com/p.jpg',
            activeOrganizationId: 'org_42',
            activeOrganizationRole: 'admin',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const user = await fetchUserFromPlatform('https://staging.leash.build')

    expect(user).toEqual({
      id: 'user_123',
      email: 'arvi@leash.build',
      name: 'Arvin',
      picture: 'https://cdn.example.com/p.jpg',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging.leash.build/api/auth/me',
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('returns null on 401 (unauthenticated is not an error)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    )

    await expect(
      fetchUserFromPlatform('https://staging.leash.build')
    ).resolves.toBeNull()
  })

  it('throws on network failure so the caller can render retry UI', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      fetchUserFromPlatform('https://staging.leash.build')
    ).rejects.toThrow(/Failed to fetch/)
  })

  it('throws when the response shape is malformed', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { email: 'no-id@leash.build' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    await expect(
      fetchUserFromPlatform('https://staging.leash.build')
    ).rejects.toThrow(/Malformed/)
  })

  it('throws on non-401 error responses (e.g. 500)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('boom', { status: 500 })
    )

    await expect(
      fetchUserFromPlatform('https://staging.leash.build')
    ).rejects.toThrow(/HTTP 500/)
  })

  it('falls back to https://leash.build when LEASH_PLATFORM_URL is unset', async () => {
    delete process.env.LEASH_PLATFORM_URL
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 })
    )

    await fetchUserFromPlatform()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://leash.build/api/auth/me',
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('reads LEASH_PLATFORM_URL from process.env when no explicit URL is passed', async () => {
    process.env.LEASH_PLATFORM_URL = 'http://localhost:3001'
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 })
    )

    await fetchUserFromPlatform()

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/me',
      expect.objectContaining({ credentials: 'include' })
    )
  })
})
