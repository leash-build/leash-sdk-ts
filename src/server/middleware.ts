import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthenticated } from './auth.js'
import { DEFAULT_REDIRECT_PATH } from '../constants.js'
import type { LeashMiddlewareOptions } from '../types.js'

/**
 * Create Leash authentication middleware for Next.js
 *
 * Protects routes from unauthenticated access and redirects to login
 *
 * @param options - Middleware configuration options
 * @returns Next.js middleware function
 *
 * @example
 * ```typescript
 * // middleware.ts
 * import { leashMiddleware } from '@leash/sdk/server'
 *
 * export const middleware = leashMiddleware({
 *   publicRoutes: ['/login', '/about', '/'],
 *   redirectTo: '/login'
 * })
 *
 * export const config = {
 *   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
 * }
 * ```
 */
export function leashMiddleware(options: LeashMiddlewareOptions = {}) {
  const {
    publicRoutes = [],
    redirectTo = DEFAULT_REDIRECT_PATH,
  } = options

  return function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl

    // Check if current path is a public route
    const isPublicRoute = publicRoutes.some(route => {
      // Exact match
      if (route === pathname) return true

      // Wildcard match (e.g., /api/*)
      if (route.endsWith('*')) {
        const baseRoute = route.slice(0, -1)
        return pathname.startsWith(baseRoute)
      }

      return false
    })

    // Allow public routes without authentication
    if (isPublicRoute) {
      return NextResponse.next()
    }

    // Check authentication
    if (!isAuthenticated(req)) {
      // Redirect to login page
      const url = req.nextUrl.clone()
      url.pathname = redirectTo
      // Preserve original URL as redirect query param
      url.searchParams.set('redirect', pathname)

      return NextResponse.redirect(url)
    }

    // User is authenticated, allow request to proceed
    return NextResponse.next()
  }
}

/**
 * Helper function to create a middleware with default public routes
 * Useful for quick setup with common public routes
 */
export function createLeashMiddleware(
  additionalPublicRoutes: string[] = []
) {
  const defaultPublicRoutes = ['/login', '/signup', '/']

  return leashMiddleware({
    publicRoutes: [...defaultPublicRoutes, ...additionalPublicRoutes],
  })
}
