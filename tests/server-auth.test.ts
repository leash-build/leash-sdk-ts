/**
 * Server Auth Tests
 *
 * Verifies getLeashUser works with different request shapes:
 * - Express (req.cookies object)
 * - Next.js (req.cookies.get() method)
 * - Raw Node.js (req.headers.cookie string)
 * - Missing cookie → throws
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'

// Import from source, not dist — vitest handles TS
import { getLeashUser, isAuthenticated } from '../src/server/auth'

const TEST_SECRET = 'test-secret-key-for-unit-tests'
const TEST_PAYLOAD = {
  userId: 'user-123',
  email: 'test@leash.build',
  name: 'Test User',
  username: 'testuser',
}

function makeToken(payload = TEST_PAYLOAD, secret = TEST_SECRET) {
  return jwt.sign(payload, secret, { expiresIn: '1h' })
}

describe('getLeashUser — Express-style request', () => {
  beforeEach(() => {
    vi.stubEnv('LEASH_JWT_SECRET', TEST_SECRET)
  })

  it('reads from req.cookies object (cookie-parser)', () => {
    const token = makeToken()
    const req = {
      cookies: { 'leash-auth': token },
      headers: {},
    }

    const user = getLeashUser(req)
    expect(user.id).toBe('user-123')
    expect(user.email).toBe('test@leash.build')
    expect(user.name).toBe('Test User')
  })
})

describe('getLeashUser — Next.js-style request', () => {
  beforeEach(() => {
    vi.stubEnv('LEASH_JWT_SECRET', TEST_SECRET)
  })

  it('reads from req.cookies.get() method', () => {
    const token = makeToken()
    const req = {
      cookies: {
        get: (name: string) => (name === 'leash-auth' ? { value: token } : undefined),
      },
      headers: {},
    }

    const user = getLeashUser(req)
    expect(user.id).toBe('user-123')
    expect(user.email).toBe('test@leash.build')
  })
})

describe('getLeashUser — raw Node.js request', () => {
  beforeEach(() => {
    vi.stubEnv('LEASH_JWT_SECRET', TEST_SECRET)
  })

  it('parses from req.headers.cookie string', () => {
    const token = makeToken()
    const req = {
      headers: {
        cookie: `other=value; leash-auth=${token}; another=foo`,
      },
    }

    const user = getLeashUser(req)
    expect(user.id).toBe('user-123')
    expect(user.email).toBe('test@leash.build')
  })

  it('handles leash-auth as the only cookie', () => {
    const token = makeToken()
    const req = {
      headers: {
        cookie: `leash-auth=${token}`,
      },
    }

    const user = getLeashUser(req)
    expect(user.id).toBe('user-123')
  })
})

describe('getLeashUser — Web Request with headers.get()', () => {
  beforeEach(() => {
    vi.stubEnv('LEASH_JWT_SECRET', TEST_SECRET)
  })

  it('reads via headers.get("cookie")', () => {
    const token = makeToken()
    const req = {
      headers: {
        get: (name: string) => (name === 'cookie' ? `leash-auth=${token}` : null),
      },
    }

    const user = getLeashUser(req)
    expect(user.id).toBe('user-123')
  })
})

describe('getLeashUser — error cases', () => {
  beforeEach(() => {
    vi.stubEnv('LEASH_JWT_SECRET', TEST_SECRET)
  })

  it('throws when no cookie present', () => {
    const req = { headers: {}, cookies: {} }
    expect(() => getLeashUser(req)).toThrow('Missing auth cookie')
  })

  it('throws when cookie header is empty', () => {
    const req = { headers: { cookie: '' } }
    expect(() => getLeashUser(req)).toThrow('Missing auth cookie')
  })

  it('throws when token is expired', () => {
    const token = jwt.sign(TEST_PAYLOAD, TEST_SECRET, { expiresIn: '-1h' })
    const req = { headers: { cookie: `leash-auth=${token}` } }
    expect(() => getLeashUser(req)).toThrow(/Not authenticated/)
  })

  it('throws when token signature is invalid', () => {
    const token = jwt.sign(TEST_PAYLOAD, 'wrong-secret')
    const req = { headers: { cookie: `leash-auth=${token}` } }
    expect(() => getLeashUser(req)).toThrow(/Invalid token/i)
  })
})

describe('getLeashUser — without JWT secret (dev mode)', () => {
  beforeEach(() => {
    vi.stubEnv('LEASH_JWT_SECRET', '')
  })

  it('decodes without verification when secret not set', () => {
    const token = makeToken()
    const req = { headers: { cookie: `leash-auth=${token}` } }

    const user = getLeashUser(req)
    expect(user.id).toBe('user-123')
    expect(user.email).toBe('test@leash.build')
  })
})

describe('isAuthenticated', () => {
  beforeEach(() => {
    vi.stubEnv('LEASH_JWT_SECRET', TEST_SECRET)
  })

  it('returns true for valid token', () => {
    const token = makeToken()
    const req = { headers: { cookie: `leash-auth=${token}` } }
    expect(isAuthenticated(req)).toBe(true)
  })

  it('returns false for missing cookie', () => {
    const req = { headers: {} }
    expect(isAuthenticated(req)).toBe(false)
  })

  it('returns false for invalid token', () => {
    const req = { headers: { cookie: 'leash-auth=garbage' } }
    expect(isAuthenticated(req)).toBe(false)
  })
})
