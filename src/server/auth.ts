import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { LEASH_AUTH_COOKIE } from '../constants.js'
import type { LeashUser, LeashJWTPayload } from '../types.js'
import { payloadToUser } from '../auth/payload.js'

/**
 * Extract and validate Leash user from Next.js request
 *
 * @param req - Next.js request object
 * @returns LeashUser object if authenticated
 * @throws Error if not authenticated or token is invalid
 *
 * @example
 * ```typescript
 * // In Next.js API route (app/api/profile/route.ts)
 * import { getLeashUser } from '@leash/sdk/server'
 * import { NextRequest, NextResponse } from 'next/server'
 *
 * export async function GET(req: NextRequest) {
 *   try {
 *     const user = getLeashUser(req)
 *     return NextResponse.json({ user })
 *   } catch (error) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 *   }
 * }
 * ```
 */
export function getLeashUser(req: NextRequest): LeashUser {
  // Extract cookie from request
  const cookie = req.cookies.get(LEASH_AUTH_COOKIE)

  if (!cookie || !cookie.value) {
    throw new Error('Not authenticated: Missing auth cookie')
  }

  const token = cookie.value

  try {
    // Get JWT secret from environment
    const secret = process.env.LEASH_JWT_SECRET

    if (!secret) {
      console.warn('LEASH_JWT_SECRET not set, skipping verification')
      // For MVP, decode without verification if secret not set
      return decodeTokenWithoutVerification(token)
    }

    // Verify and decode JWT
    const payload = jwt.verify(token, secret) as LeashJWTPayload

    // Convert payload to user object
    return payloadToUser(payload)
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Not authenticated: Invalid token')
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Not authenticated: Token expired')
    }
    throw new Error('Not authenticated: Failed to verify token')
  }
}

/**
 * Decode JWT without verification (fallback for development)
 * This should only be used when LEASH_JWT_SECRET is not available
 */
function decodeTokenWithoutVerification(token: string): LeashUser {
  try {
    const decoded = jwt.decode(token) as LeashJWTPayload | null

    if (!decoded) {
      throw new Error('Failed to decode token')
    }

    // Check if token is expired
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      throw new Error('Token expired')
    }

    return payloadToUser(decoded)
  } catch (error) {
    throw new Error('Not authenticated: Invalid token format')
  }
}

/**
 * Check if request has valid Leash authentication
 *
 * @param req - Next.js request object
 * @returns true if authenticated, false otherwise
 */
export function isAuthenticated(req: NextRequest): boolean {
  try {
    getLeashUser(req)
    return true
  } catch {
    return false
  }
}
