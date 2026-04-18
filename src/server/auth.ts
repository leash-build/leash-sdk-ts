import jwt from 'jsonwebtoken'
import { LEASH_AUTH_COOKIE } from '../constants.js'
import type { LeashUser, LeashJWTPayload } from '../types.js'
import { payloadToUser } from '../auth/payload.js'

/**
 * Parse a cookie value from a raw Cookie header string.
 */
function parseCookie(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

/**
 * Extract the leash-auth token from any request object.
 * Works with Express, Next.js, Koa, Hono, plain IncomingMessage — anything
 * that has headers.cookie or cookies or a cookies.get method.
 */
function extractToken(req: any): string | undefined {
  // Next.js / Web Request style: req.cookies.get(name)
  if (req.cookies?.get && typeof req.cookies.get === 'function') {
    const cookie = req.cookies.get(LEASH_AUTH_COOKIE)
    return typeof cookie === 'string' ? cookie : cookie?.value
  }

  // Express / cookie-parser style: req.cookies[name]
  if (req.cookies && typeof req.cookies === 'object' && LEASH_AUTH_COOKIE in req.cookies) {
    return req.cookies[LEASH_AUTH_COOKIE]
  }

  // Raw header fallback: works with any HTTP framework
  const cookieHeader = req.headers?.cookie || req.headers?.get?.('cookie')
  if (cookieHeader) {
    return parseCookie(cookieHeader, LEASH_AUTH_COOKIE)
  }

  return undefined
}

/**
 * Extract and validate Leash user from any HTTP request.
 *
 * Works with Express, Next.js, Koa, Hono, Fastify, plain Node.js —
 * any request that carries cookies.
 *
 * @param req - Any HTTP request object with headers
 * @returns LeashUser object if authenticated
 * @throws Error if not authenticated or token is invalid
 *
 * @example
 * ```typescript
 * // Express
 * import { getLeashUser } from '@leash/sdk/server'
 * app.get('/me', (req, res) => {
 *   const user = getLeashUser(req)
 *   res.json({ user })
 * })
 *
 * // Next.js
 * import { getLeashUser } from '@leash/sdk/server'
 * export async function GET(req: NextRequest) {
 *   const user = getLeashUser(req)
 *   return NextResponse.json({ user })
 * }
 * ```
 */
export function getLeashUser(req: any): LeashUser {
  const token = extractToken(req)

  if (!token) {
    throw new Error('Not authenticated: Missing auth cookie')
  }

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
export function isAuthenticated(req: any): boolean {
  try {
    getLeashUser(req)
    return true
  } catch {
    return false
  }
}
