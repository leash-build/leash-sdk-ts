/**
 * Live-platform contract tests for the auth flow (LEA-193).
 *
 * These tests mint a real one-time exchange code on the configured Leash
 * platform, redeem it through the SDK's `Leash.createDevAuthHandler()`,
 * and assert the JWT round-trips correctly.
 *
 * Why this file exists: unit tests with mocked fetch can pass while the
 * SDK actually ships a contract bug. Three contract bugs slipped past
 * unit tests in two days (PR #3 ×2, PR #4 ×1). Real network calls against
 * the live platform catch this class of bug at write time, not at
 * customer-Claude time.
 *
 * Opt-in. Skipped unless LEASH_CONTRACT_TEST=1 is set, so `npm test`
 * never makes network calls.
 *
 * Run:
 *   npm run test:contract                 # defaults to staging
 *   LEASH_PLATFORM_URL=https://leash.build npm run test:contract   # against prod
 *
 * Auth: reads the user's Leash CLI token from the macOS keychain. Requires
 * the developer to have run `leash login` first against the same platform
 * that LEASH_PLATFORM_URL points at.
 *
 * Platform contracts asserted:
 *  - POST /api/auth/dev-codes (LEA-186 mint)
 *      leash-platform/src/app/api/auth/dev-codes/route.ts
 *  - POST /api/auth/exchange-code (LEA-186 redeem)
 *      leash-platform/src/app/api/auth/exchange-code/route.ts
 */

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import jwt from 'jsonwebtoken'
import { Leash } from '../../src/leash'

const RUN_CONTRACT = process.env.LEASH_CONTRACT_TEST === '1'
const PLATFORM_URL = process.env.LEASH_PLATFORM_URL ?? 'https://staging.leash.build'

function getCliToken(): string {
  let raw: string
  try {
    raw = execSync('security find-generic-password -s leash -a token -w', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    throw new Error(
      'Could not read CLI token from keychain. Run `leash login` first against ' +
        PLATFORM_URL,
    )
  }
  const stripped = raw.replace(/^go-keyring-base64:/, '')
  return Buffer.from(stripped, 'base64').toString('utf8')
}

function decodeJwt(token: string): Record<string, unknown> {
  const decoded = jwt.decode(token)
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Failed to decode JWT')
  }
  return decoded as Record<string, unknown>
}

function parseSetCookie(setCookie: string | null): {
  name: string
  value: string
  attrs: Record<string, string | true>
} | null {
  if (!setCookie) return null
  const [pair, ...rest] = setCookie.split(';').map((s) => s.trim())
  const eq = pair.indexOf('=')
  if (eq < 0) return null
  const attrs: Record<string, string | true> = {}
  for (const a of rest) {
    const i = a.indexOf('=')
    if (i < 0) attrs[a.toLowerCase()] = true
    else attrs[a.slice(0, i).toLowerCase()] = a.slice(i + 1)
  }
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attrs }
}

describe.skipIf(!RUN_CONTRACT)('SDK ↔ platform auth flow (live contract)', () => {
  it(`mints + redeems a dev-auth code; SDK parses ${PLATFORM_URL} correctly`, async () => {
    const cliToken = getCliToken()
    const cliClaims = decodeJwt(cliToken)
    const userId = cliClaims.userId ?? cliClaims.sub

    // 1. Mint a code via the platform (server-to-server)
    const mintRes = await fetch(`${PLATFORM_URL}/api/auth/dev-codes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cliToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ port: 3000 }),
    })
    expect(mintRes.status, 'mint should return 200').toBe(200)
    const mintBody = (await mintRes.json()) as {
      success: boolean
      data?: { code?: string; expires_at?: string }
    }
    expect(mintBody.success).toBe(true)
    expect(typeof mintBody.data?.code).toBe('string')
    expect(mintBody.data!.code.startsWith('dev_')).toBe(true)

    // 2. Drive the SDK handler with the minted code.
    //    Handler reads LEASH_PLATFORM_URL at request time, so target whatever
    //    platform was used to mint the code.
    const prevPlatformUrl = process.env.LEASH_PLATFORM_URL
    process.env.LEASH_PLATFORM_URL = PLATFORM_URL
    try {
      const handler = Leash.createDevAuthHandler()
      const fakeReq = new Request(
        `http://localhost:3000/api/_leash/dev-auth?code=${encodeURIComponent(mintBody.data!.code!)}`,
      )
      const handlerRes = await handler(fakeReq)

      // 3. Assert the redirect + Set-Cookie shape
      expect(handlerRes.status, 'handler should 302 on success').toBe(302)
      expect(handlerRes.headers.get('location')).toBe('/')

      const setCookie = parseSetCookie(handlerRes.headers.get('set-cookie'))
      expect(setCookie?.name).toBe('leash-auth')
      expect(typeof setCookie?.value).toBe('string')
      expect(setCookie?.attrs['httponly']).toBe(true)
      expect(setCookie?.attrs['path']).toBe('/')
      expect(setCookie?.attrs['samesite']?.toString().toLowerCase()).toBe('lax')
      expect(Number(setCookie?.attrs['max-age'])).toBeGreaterThan(0)

      // 4. Decode the cookie JWT and assert it belongs to the same user that
      //    minted the code — the round-trip works end-to-end.
      const cookieClaims = decodeJwt(setCookie!.value)
      const cookieUserId = cookieClaims.userId ?? cookieClaims.sub
      expect(cookieUserId).toBe(userId)
    } finally {
      if (prevPlatformUrl === undefined) delete process.env.LEASH_PLATFORM_URL
      else process.env.LEASH_PLATFORM_URL = prevPlatformUrl
    }
  })

  it('redeeming the same code twice returns 410 (atomicity)', async () => {
    const cliToken = getCliToken()

    const mintRes = await fetch(`${PLATFORM_URL}/api/auth/dev-codes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cliToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ port: 3000 }),
    })
    const mintBody = (await mintRes.json()) as { data: { code: string } }
    const code = mintBody.data.code

    const prevPlatformUrl = process.env.LEASH_PLATFORM_URL
    process.env.LEASH_PLATFORM_URL = PLATFORM_URL
    try {
      const handler = Leash.createDevAuthHandler()

      const first = await handler(
        new Request(`http://localhost:3000/api/_leash/dev-auth?code=${code}`),
      )
      expect(first.status).toBe(302)

      const second = await handler(
        new Request(`http://localhost:3000/api/_leash/dev-auth?code=${code}`),
      )
      expect(second.status, 'second redemption should 410').toBe(410)
      const body = await second.text()
      expect(body.toLowerCase()).toContain('expired')
    } finally {
      if (prevPlatformUrl === undefined) delete process.env.LEASH_PLATFORM_URL
      else process.env.LEASH_PLATFORM_URL = prevPlatformUrl
    }
  })
})
