import { describe, expect, it } from 'vitest'
import { getLeashUserId, payloadToUser } from '../src/auth/payload'

describe('auth payload helpers', () => {
  it('prefers userId from the current platform JWT shape', () => {
    const payload = {
      userId: 'user-current',
      email: 'current@leash.build',
      name: 'Current User',
      username: 'current_user',
      iat: 1,
      exp: 2,
    }

    expect(getLeashUserId(payload)).toBe('user-current')
    expect(payloadToUser(payload)).toEqual({
      id: 'user-current',
      email: 'current@leash.build',
      name: 'Current User',
      picture: undefined,
    })
  })

  it('accepts legacy sub-based payloads for backward compatibility', () => {
    const payload = {
      sub: 'user-legacy',
      email: 'legacy@leash.build',
      name: 'Legacy User',
      iat: 1,
      exp: 2,
    }

    expect(getLeashUserId(payload)).toBe('user-legacy')
    expect(payloadToUser(payload).id).toBe('user-legacy')
  })

  it('throws when the token payload has no user identifier', () => {
    expect(() =>
      payloadToUser({
        email: 'broken@leash.build',
        name: 'Broken User',
        iat: 1,
        exp: 2,
      })
    ).toThrow(/user identifier/i)
  })
})
