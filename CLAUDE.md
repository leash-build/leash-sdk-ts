# Leash SDK - Claude Context Guide

## Overview

The **Leash SDK** is a TypeScript library that Next.js applications install to get **authentication** and **environment variable** access. It's similar to how apps use `@clerk/nextjs` or `@auth0/nextjs-auth0`.

Developers install it in their apps to get instant authentication without building their own auth system.

## Architecture

```
leash_sdk/
├── src/
│   ├── client/           # Client-side code (React hooks, context)
│   │   ├── hooks/
│   │   │   ├── useLeashAuth.ts    # Get authenticated user
│   │   │   └── useLeashEnv.ts     # Get environment variables
│   │   └── context/
│   │       └── LeashProvider.tsx   # React context provider
│   ├── server/           # Server-side code (API routes, middleware)
│   │   ├── auth.ts       # getLeashUser() for API routes
│   │   └── middleware.ts # leashMiddleware() for route protection
│   ├── types.ts          # TypeScript type definitions
│   └── constants.ts      # Constants (cookie names, etc.)
├── dist/                 # Compiled output (after npm run build)
└── package.json
```

## Technology Stack

- **TypeScript** - Type safety
- **React 18** - React hooks and context
- **Next.js 15** - Server/client components
- **jsonwebtoken** - JWT decoding

## How It Works

### Authentication Flow

```
1. User visits deployed app: https://leash.build/username/appname
2. Platform sets cookie: leash-auth=<jwt-token>
3. SDK reads cookie in browser
4. SDK decodes JWT to get user info
5. SDK provides user to React components via useLeashAuth()
```

**No backend calls needed!** The JWT is self-contained.

### JWT Structure

```typescript
{
  userId: "uuid-abc-123",
  email: "user@example.com",
  name: "John Doe",
  username: "johndoe",
  iat: 1234567890,
  exp: 1234567890 + (30 * 24 * 60 * 60) // 30 days
}
```

### Cookie

```
Name: leash-auth
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
HttpOnly: false (so client-side can read it)
Secure: true (HTTPS only in production)
SameSite: Lax
Path: /
```

## Installation

```bash
npm install @leash/sdk
```

## Usage

### 1. Wrap App with LeashProvider

```tsx
// app/layout.tsx
import { LeashProvider } from '@leash/sdk'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <LeashProvider>
          {children}
        </LeashProvider>
      </body>
    </html>
  )
}
```

### 2. Use Authentication in Components

```tsx
// app/page.tsx
'use client'

import { useLeashAuth } from '@leash/sdk'

export default function HomePage() {
  const { user, isLoading, isAuthenticated } = useLeashAuth()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!isAuthenticated) {
    return <div>Please log in</div>
  }

  return (
    <div>
      <h1>Welcome, {user.name}!</h1>
      <p>Email: {user.email}</p>
      <p>Username: @{user.username}</p>
    </div>
  )
}
```

### 3. Use Environment Variables

```tsx
// app/page.tsx
'use client'

import { useLeashEnv } from '@leash/sdk'

export default function HomePage() {
  const env = useLeashEnv()

  return (
    <div>
      <p>API URL: {env.API_URL}</p>
      <p>Stripe Key: {env.STRIPE_PUBLIC_KEY}</p>
    </div>
  )
}
```

### 4. Protect API Routes

```typescript
// app/api/profile/route.ts
import { NextRequest } from 'next/server'
import { getLeashUser } from '@leash/sdk/server'

export async function GET(req: NextRequest) {
  const user = getLeashUser(req)

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  return Response.json({
    userId: user.userId,
    email: user.email,
    name: user.name,
  })
}
```

### 5. Protect Pages with Middleware

```typescript
// middleware.ts
import { NextRequest } from 'next/server'
import { leashMiddleware } from '@leash/sdk/server'

export function middleware(request: NextRequest) {
  // Protect all routes except /login and /register
  if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register') {
    return
  }

  return leashMiddleware(request, {
    redirectTo: '/login',
  })
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static
     * - _next/image
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

## API Reference

### Client-Side

#### `<LeashProvider>`

React context provider that wraps your app.

**Props:**
- `children` - React children

**Usage:**
```tsx
import { LeashProvider } from '@leash/sdk'

<LeashProvider>
  <App />
</LeashProvider>
```

**What it does:**
1. Reads `leash-auth` cookie
2. Decodes JWT
3. Provides user context to all children
4. Handles loading states

#### `useLeashAuth()`

React hook to get authenticated user.

**Returns:**
```typescript
{
  user: LeashUser | null,
  isLoading: boolean,
  isAuthenticated: boolean,
}
```

**LeashUser type:**
```typescript
interface LeashUser {
  userId: string
  email: string
  name: string
  username: string
  iat: number
  exp: number
}
```

**Usage:**
```tsx
const { user, isLoading, isAuthenticated } = useLeashAuth()

if (isLoading) return <Spinner />
if (!isAuthenticated) return <LoginPrompt />

return <div>Hello, {user.name}</div>
```

#### `useLeashEnv()`

React hook to get environment variables.

**Returns:**
```typescript
Record<string, string>
```

**Usage:**
```tsx
const env = useLeashEnv()

console.log(env.DATABASE_URL)
console.log(env.API_KEY)
```

**How it works:**
The platform injects env vars into the HTML:

```html
<script>
  window.__LEASH_ENV__ = {
    "API_URL": "https://api.example.com",
    "STRIPE_PUBLIC_KEY": "pk_test_..."
  }
</script>
```

The hook reads `window.__LEASH_ENV__`.

**Security Note:** Only inject **public** environment variables (ones that start with `NEXT_PUBLIC_` or are safe to expose).

### Server-Side

#### `getLeashUser(request)`

Extract and decode user from request (for API routes).

**Parameters:**
- `request: NextRequest` - Next.js request object

**Returns:**
```typescript
LeashUser | null
```

**Usage:**
```typescript
import { NextRequest } from 'next/server'
import { getLeashUser } from '@leash/sdk/server'

export async function GET(req: NextRequest) {
  const user = getLeashUser(req)

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Use user.userId, user.email, etc.
  return Response.json({ user })
}
```

**How it works:**
1. Reads `leash-auth` cookie from request
2. Decodes JWT (no verification needed - token is trusted)
3. Returns user object or null

#### `leashMiddleware(request, options?)`

Middleware to protect routes.

**Parameters:**
- `request: NextRequest`
- `options?`:
  - `redirectTo?: string` - Where to redirect if not authenticated
  - `publicPaths?: string[]` - Paths that don't require auth

**Returns:**
```typescript
NextResponse | undefined
```

**Usage:**
```typescript
import { leashMiddleware } from '@leash/sdk/server'

export function middleware(request: NextRequest) {
  return leashMiddleware(request, {
    redirectTo: '/login',
    publicPaths: ['/about', '/pricing'],
  })
}
```

**How it works:**
1. Checks if path is in `publicPaths` - if yes, allow
2. Reads `leash-auth` cookie
3. If missing or invalid, redirect to `redirectTo`
4. If valid, allow request

## Implementation Details

### LeashProvider Component

```typescript
// src/client/context/LeashProvider.tsx
'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import Cookies from 'js-cookie'
import jwt from 'jsonwebtoken'
import { LEASH_AUTH_COOKIE } from '../../constants'
import type { LeashUser } from '../../types'

interface LeashContextValue {
  user: LeashUser | null
  isLoading: boolean
  isAuthenticated: boolean
}

const LeashContext = createContext<LeashContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
})

export function LeashProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LeashUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Read cookie
    const token = Cookies.get(LEASH_AUTH_COOKIE)

    if (token) {
      try {
        // Decode JWT (no verification needed client-side)
        const decoded = jwt.decode(token) as LeashUser
        setUser(decoded)
      } catch (error) {
        console.error('Failed to decode Leash auth token:', error)
        setUser(null)
      }
    }

    setIsLoading(false)
  }, [])

  return (
    <LeashContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
      }}
    >
      {children}
    </LeashContext.Provider>
  )
}

export function useLeashContext() {
  return useContext(LeashContext)
}
```

### useLeashAuth Hook

```typescript
// src/client/hooks/useLeashAuth.ts
'use client'

import { useLeashContext } from '../context/LeashProvider'

export function useLeashAuth() {
  const context = useLeashContext()

  if (!context) {
    throw new Error('useLeashAuth must be used within LeashProvider')
  }

  return context
}
```

### useLeashEnv Hook

```typescript
// src/client/hooks/useLeashEnv.ts
'use client'

export function useLeashEnv(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {}
  }

  // Read injected env vars from window
  return (window as any).__LEASH_ENV__ || {}
}
```

### getLeashUser (Server)

```typescript
// src/server/auth.ts
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { LEASH_AUTH_COOKIE } from '../constants'
import type { LeashUser } from '../types'

export function getLeashUser(req: NextRequest): LeashUser | null {
  // Read cookie from request
  const token = req.cookies.get(LEASH_AUTH_COOKIE)?.value

  if (!token) {
    return null
  }

  try {
    // Decode JWT (no verification - we trust the platform)
    const decoded = jwt.decode(token) as LeashUser
    return decoded
  } catch (error) {
    console.error('Failed to decode Leash auth token:', error)
    return null
  }
}
```

### leashMiddleware (Server)

```typescript
// src/server/middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { getLeashUser } from './auth'

interface LeashMiddlewareOptions {
  redirectTo?: string
  publicPaths?: string[]
}

export function leashMiddleware(
  req: NextRequest,
  options?: LeashMiddlewareOptions
): NextResponse | undefined {
  const { redirectTo = '/login', publicPaths = [] } = options || {}

  // Check if path is public
  if (publicPaths.some((path) => req.nextUrl.pathname.startsWith(path))) {
    return
  }

  // Check authentication
  const user = getLeashUser(req)

  if (!user) {
    // Not authenticated - redirect
    const redirectUrl = new URL(redirectTo, req.url)
    redirectUrl.searchParams.set('from', req.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Authenticated - allow
  return
}
```

## Type Definitions

```typescript
// src/types.ts
export interface LeashUser {
  userId: string
  email: string
  name: string
  username: string
  iat: number // Issued at timestamp
  exp: number // Expiration timestamp
}

export interface LeashEnv {
  [key: string]: string
}
```

## Constants

```typescript
// src/constants.ts
export const LEASH_AUTH_COOKIE = 'leash-auth'
export const LEASH_ENV_GLOBAL = '__LEASH_ENV__'
```

## Building and Publishing

### Local Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Link globally for testing
npm link

# In your test app
cd ../my-nextjs-app
npm link @leash/sdk
```

### Publishing to npm

```bash
# Update version
npm version patch

# Build
npm run build

# Publish
npm publish --access public
```

### Package.json

```json
{
  "name": "@leash/sdk",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./server": {
      "import": "./dist/server/index.js",
      "require": "./dist/server/index.js",
      "types": "./dist/server/index.d.ts"
    }
  },
  "files": [
    "dist"
  ]
}
```

## Common Patterns

### Conditional Rendering Based on Auth

```tsx
export default function Dashboard() {
  const { user, isAuthenticated } = useLeashAuth()

  if (!isAuthenticated) {
    return <LoginPrompt />
  }

  return (
    <div>
      <h1>Dashboard - {user.name}</h1>
      <UserStats userId={user.userId} />
    </div>
  )
}
```

### Protecting API Routes

```typescript
// app/api/admin/route.ts
import { getLeashUser } from '@leash/sdk/server'

export async function GET(req: NextRequest) {
  const user = getLeashUser(req)

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Check if user is admin
  if (!user.email.endsWith('@company.com')) {
    return new Response('Forbidden', { status: 403 })
  }

  return Response.json({ secret: 'admin data' })
}
```

### Using Environment Variables

```tsx
export default function ApiExample() {
  const env = useLeashEnv()

  useEffect(() => {
    fetch(env.API_URL + '/data')
      .then(res => res.json())
      .then(data => console.log(data))
  }, [env.API_URL])

  return <div>API URL: {env.API_URL}</div>
}
```

## Security Considerations

### 1. JWT is Not Verified

The SDK **does not verify** the JWT signature because:
- The cookie is set by the platform (trusted source)
- Apps run on the platform's infrastructure
- No need for secret key distribution

**In production with custom domains**, you would need to verify the JWT.

### 2. Environment Variables

**Only inject public env vars** into `window.__LEASH_ENV__`:
- ✅ `NEXT_PUBLIC_API_URL`
- ✅ `NEXT_PUBLIC_STRIPE_KEY`
- ❌ `DATABASE_URL` (server-side only)
- ❌ `API_SECRET` (server-side only)

### 3. XSS Protection

The `leash-auth` cookie is **not HttpOnly** because:
- Client-side needs to read it
- Platform controls the domain
- Cookie is set with `Secure` and `SameSite=Lax`

**In production**, consider HttpOnly cookies and a separate endpoint to get user info.

## Troubleshooting

### User is null even when authenticated

**Check:**
1. Is `LeashProvider` wrapping your app?
2. Is the `leash-auth` cookie present? (Check DevTools → Application → Cookies)
3. Is the JWT valid? (Paste into jwt.io)

### Environment variables are undefined

**Check:**
1. Are env vars set in the platform? (`leash env:list`)
2. Are they injected into HTML? (View page source, search for `__LEASH_ENV__`)
3. Are you using `useLeashEnv()` in a client component?

### Middleware not protecting routes

**Check:**
1. Is middleware.ts in the root of your app?
2. Is the matcher config correct?
3. Are public paths configured correctly?

### TypeScript errors

**Check:**
1. Is `@leash/sdk` installed?
2. Is TypeScript configured correctly?
3. Are types being exported from the SDK?

```bash
npm install @leash/sdk
npm run build  # Rebuild SDK if developing locally
```

## Future Enhancements

- [ ] Session refresh (renew JWT before expiration)
- [ ] Logout functionality (clear cookie)
- [ ] Role-based access control (roles in JWT)
- [ ] Team/organization support
- [ ] Server-side JWT verification (for custom domains)
- [ ] OAuth integration (Google, GitHub, etc.)
- [ ] Two-factor authentication
- [ ] Session management (list active sessions, revoke)
- [ ] Webhooks for auth events

## Resources

- **React Context**: https://react.dev/reference/react/useContext
- **Next.js Middleware**: https://nextjs.org/docs/app/building-your-application/routing/middleware
- **JWT**: https://jwt.io
- **js-cookie**: https://github.com/js-cookie/js-cookie
