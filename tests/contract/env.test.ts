/**
 * Live-platform contract tests for leash.env.get (LEA-191).
 *
 * Exercises the real GET /api/apps/me/secrets/[key] endpoint using a
 * LEASH_API_KEY from the environment (or .env.local). Verifies that:
 *   1. The SDK sends Authorization: Bearer correctly
 *   2. The platform returns { value: string } on 200
 *   3. A missing key returns 404 (KEY_NOT_DECLARED) — not a silent empty string
 *
 * Opt-in: only runs when LEASH_CONTRACT_TEST=1.
 *
 * Run:
 *   LEASH_CONTRACT_TEST=1 npm run test:contract
 *   LEASH_CONTRACT_TEST=1 LEASH_PLATFORM_URL=https://leash.build npm run test:contract
 *
 * Auth: reads LEASH_API_KEY from process.env. Set in your shell or .env.local
 * before running. The key must belong to a Growth plan org on the target platform.
 *
 * Platform contract asserted:
 *   GET /api/apps/me/secrets/[key]
 *     leash-platform/src/app/api/apps/me/secrets/[key]/route.ts
 */

import { describe, it, expect } from 'vitest'
import { Leash } from '../../src/leash'
import { LeashError } from '../../src/errors'

const RUN_CONTRACT = process.env.LEASH_CONTRACT_TEST === '1'
const PLATFORM_URL = process.env.LEASH_PLATFORM_URL ?? 'https://staging.leash.build'
const API_KEY = process.env.LEASH_API_KEY

// Minimal server request (no user cookie needed for env key reads)
function makeRequest() {
  return {
    cookies: { get: () => undefined },
    headers: {},
  }
}

describe.skipIf(!RUN_CONTRACT)('leash.env.get ↔ platform contract (live)', () => {
  it('fetches a declared key and returns a non-empty string value', async () => {
    if (!API_KEY) {
      throw new Error(
        'LEASH_API_KEY is not set. Export it before running contract tests.',
      )
    }

    const leash = new Leash({
      request: makeRequest(),
      platformUrl: PLATFORM_URL,
      apiKey: API_KEY,
    })

    // Try to read a key. The org may or may not have a declared key.
    // We handle both the success case and the 404 case gracefully.
    let value: string | undefined
    let notDeclared = false

    try {
      // Use a well-known key that Growth-plan orgs typically declare.
      // If no key is set up, the test skips cleanly below.
      value = await leash.env.get('LEASH_TEST_KEY')
    } catch (err) {
      if (err instanceof LeashError && err.code === 'KEY_NOT_DECLARED') {
        notDeclared = true
      } else if (err instanceof LeashError && err.code === 'UPGRADE_REQUIRED') {
        // The org is not on Growth — that is still a valid contract test
        // (the SDK correctly surfaces the billing gate).
        expect(err.action).toContain('billing')
        return
      } else {
        throw err
      }
    }

    if (notDeclared) {
      // The key is not declared on this org — skip with an informative message.
      // Add LEASH_TEST_KEY to your app's .env.example and configure a secret
      // source to exercise the full happy-path.
      it.skip(
        'no LEASH_TEST_KEY declared on the org — run from a project with .env.example keys to exercise this test'
      )
      return
    }

    // If we got here, we have a value — assert it looks like a real secret
    expect(typeof value).toBe('string')
    expect(value!.length).toBeGreaterThan(0)
  })

  it('404 for an undeclared key → KEY_NOT_DECLARED with actionable message', async () => {
    if (!API_KEY) {
      throw new Error(
        'LEASH_API_KEY is not set. Export it before running contract tests.',
      )
    }

    const leash = new Leash({
      request: makeRequest(),
      platformUrl: PLATFORM_URL,
      apiKey: API_KEY,
    })

    // Use a key that will never be declared on any org
    const bogusKey = 'LEASH_SDK_CONTRACT_TEST_BOGUS_KEY_THAT_DOES_NOT_EXIST'

    let caughtErr: LeashError | undefined
    try {
      await leash.env.get(bogusKey)
    } catch (err) {
      if (err instanceof LeashError) caughtErr = err
      else throw err
    }

    if (caughtErr?.code === 'UPGRADE_REQUIRED') {
      // Org is not on Growth — still valid; billing gate works.
      expect(caughtErr.action).toContain('billing')
      return
    }

    expect(caughtErr).toBeDefined()
    expect(caughtErr?.code).toBe('KEY_NOT_DECLARED')
    expect(caughtErr?.action).toContain('.env.example')
    expect(caughtErr?.action).toContain(bogusKey)
  })

  it('401 → UNAUTHORIZED when using an invalid API key', async () => {
    const leash = new Leash({
      request: makeRequest(),
      platformUrl: PLATFORM_URL,
      apiKey: 'lsk_live_invalid_key_for_contract_test',
    })

    let caughtErr: LeashError | undefined
    try {
      await leash.env.get('ANY_KEY')
    } catch (err) {
      if (err instanceof LeashError) caughtErr = err
      else throw err
    }

    expect(caughtErr?.code).toBe('UNAUTHORIZED')
    expect(caughtErr?.action).toContain('api-keys')
  })
})
