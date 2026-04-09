# Leash SDK - Build Specification

## Overview
The Leash SDK is a TypeScript library that provides developers with seamless authentication and environment variable management for apps deployed on the Leash platform.

## Core Features

### 1. Authentication (`useLeashAuth`)
- Hook that returns authenticated user context
- User data includes: `id`, `email`, `name`, `picture`
- Works client-side and server-side
- No additional OAuth setup needed

### 2. Environment Variables (`useLeashEnv`)
- Access Leash-provided environment variables
- Auto-injected vars: `LEASH_USER_ID`, `LEASH_USER_EMAIL`, `LEASH_APP_ID`, `SUPABASE_URL`, `SUPABASE_KEY`
- Custom vars set through Leash dashboard

### 3. Server-Side Middleware
- Validate Leash auth cookies
- Protect API routes
- Extract user context

## Target Framework
- **Next.js** (App Router)
- TypeScript
- React 18+

## Package Structure

```
@leash/sdk/
├── src/
│   ├── client/
│   │   ├── hooks/
│   │   │   ├── useLeashAuth.ts
│   │   │   ├── useLeashEnv.ts
│   │   │   └── index.ts
│   │   ├── context/
│   │   │   ├── LeashProvider.tsx
│   │   │   └── leashContext.ts
│   │   └── index.ts
│   ├── server/
│   │   ├── middleware.ts
│   │   ├── auth.ts
│   │   └── index.ts
│   ├── types.ts
│   ├── constants.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Type Definitions

```typescript
// User type
interface LeashUser {
  id: string
  email: string
  name: string
  picture?: string
}

// Environment type
interface LeashEnv {
  [key: string]: string | undefined
  LEASH_USER_ID: string
  LEASH_USER_EMAIL: string
  LEASH_APP_ID: string
  SUPABASE_URL: string
  SUPABASE_KEY: string
}

// Auth context type
interface LeashAuthContext {
  user: LeashUser | null
  isLoading: boolean
  error: Error | null
}

// Middleware options
interface LeashMiddlewareOptions {
  publicRoutes?: string[]
  redirectTo?: string
}
```

## Implementation Details

### Client-Side: useLeashAuth Hook

**Behavior:**
- Reads Leash auth cookie from browser
- Decodes and validates JWT
- Returns user object or null if not authenticated
- Handles loading state during initial check
- Client-side only (use in components)

**Usage:**
```typescript
import { useLeashAuth } from '@leash/sdk'

export default function Page() {
  const { user, isLoading, error } = useLeashAuth()
  
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!user) return <div>Not authenticated</div>
  
  return <div>Hello {user.name}</div>
}
```

**Implementation Notes:**
- Cookie name: `leash-auth` (look for this in document.cookie)
- JWT payload structure: `{ sub, email, name, picture, iat, exp }`
- Use `useEffect` to read cookie on mount
- Handle SSR: check if window is defined
- Cache user state to avoid re-fetching on every render

### Client-Side: useLeashEnv Hook

**Behavior:**
- Returns environment variables injected by Leash
- Includes auto-vars (LEASH_USER_ID, SUPABASE_URL, etc.)
- Includes custom vars set in Leash dashboard
- Static at runtime (no changes after app loads)

**Usage:**
```typescript
import { useLeashEnv } from '@leash/sdk'

export default function Page() {
  const env = useLeashEnv()
  
  return (
    <div>
      <p>App ID: {env.LEASH_APP_ID}</p>
      <p>Supabase URL: {env.SUPABASE_URL}</p>
      <p>Custom API Key: {env.API_KEY}</p>
    </div>
  )
}
```

**Implementation Notes:**
- Read from `window.__LEASH_ENV__` (injected by Leash platform into HTML)
- Falls back to `process.env` for development/non-Leash environments
- Return type: `LeashEnv` (with all standard keys)
- Throw or warn if running outside Leash and vars not set

### LeashProvider Context

**Behavior:**
- Wraps app to provide auth context globally
- Optionally handles redirect on auth failure
- Provides loading/error states

**Usage:**
```typescript
// app.tsx or _app.tsx
import { LeashProvider } from '@leash/sdk'

export default function RootLayout({ children }) {
  return (
    <LeashProvider>
      {children}
    </LeashProvider>
  )
}

// Later in any component
import { useLeashAuth } from '@leash/sdk'

export default function Component() {
  const { user } = useLeashAuth()
  return <div>{user?.name}</div>
}
```

**Implementation Notes:**
- Create React Context for LeashAuthContext
- Provider fetches user once on mount
- Memoize user object to prevent unnecessary re-renders
- Handle hydration mismatch (SSR safe)

### Server-Side: getLeashUser

**Behavior:**
- Extract user from request cookies (Next.js API route)
- Validate JWT signature
- Return user or throw error
- Use in `getServerSideProps` or API routes

**Usage:**
```typescript
// app/api/profile/route.ts
import { getLeashUser } from '@leash/sdk/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const user = getLeashUser(req)
    return NextResponse.json({ user })
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

**Implementation Notes:**
- Extract cookie from `req.cookies.get('leash-auth')`
- Verify JWT using Leash public key (hardcoded or fetched)
- For MVP, use simple JWT verification (HS256 with shared secret)
- Throw error if cookie missing or invalid
- Return decoded user object

### Server-Side: Middleware

**Behavior:**
- Protect routes from unauthenticated access
- Validate Leash auth on every request
- Redirect to login if unauthorized
- Allow public routes

**Usage:**
```typescript
// middleware.ts
import { leashMiddleware } from '@leash/sdk/server'

export const middleware = leashMiddleware({
  publicRoutes: ['/login', '/about'],
  redirectTo: '/login'
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
```

**Implementation Notes:**
- Use Next.js middleware pattern
- Check `leash-auth` cookie on each request
- If missing and route not public: redirect
- If present but invalid: redirect to redirectTo
- Pass user to request headers for downstream use

## Development Workflow

### Setup
1. Create new directory: `packages/sdk`
2. Initialize: `npm init -y`
3. Install deps: `npm install typescript react next @types/react @types/node`
4. Create `tsconfig.json`
5. Create `src/` directory structure

### Build
- Compile TypeScript to JavaScript
- Output to `dist/`
- Generate `.d.ts` files
- Package as CommonJS and ESM

### Testing (Phase 2)
- Unit tests for hooks
- Integration tests with Next.js app
- Mock Leash platform

## Key Implementation Decisions

### JWT Validation
- For MVP: Use simple HS256 signature verification
- Secret: `process.env.LEASH_JWT_SECRET`
- Later: Fetch public key from Leash platform

### Cookie Format
- Name: `leash-auth`
- Format: JWT string
- HttpOnly: No (read client-side)
- Secure: Yes (HTTPS only)
- SameSite: Lax

### Environment Variable Injection
- Client: Injected into `window.__LEASH_ENV__` as JSON
- Server: Available as `process.env`
- Fallback: Read from `.env.local` in development

### Error Handling
- Auth errors: Return null user, don't throw (graceful degradation)
- Env var errors: Warn in console, return empty object
- Middleware errors: Redirect to redirectTo or login

## Development Notes

### Assumptions About Leash Platform
1. Leash injects `leash-auth` cookie into all app requests
2. Leash injects `window.__LEASH_ENV__` into HTML
3. Leash provides JWT secret via environment variable
4. Leash ensures HTTPS only

### What's NOT in MVP
- Social login options (Google, GitHub, etc.) - that's done by Leash
- Session management/logout - handled by Leash
- Token refresh - Leash sends new cookies as needed
- Multi-tenant/organization support
- Custom claims in JWT

## Usage Example: Complete Next.js App

```typescript
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

// app/page.tsx
'use client'
import { useLeashAuth, useLeashEnv } from '@leash/sdk'

export default function Home() {
  const { user, isLoading } = useLeashAuth()
  const env = useLeashEnv()

  if (isLoading) return <div>Loading...</div>

  return (
    <div>
      <h1>Welcome {user?.name}</h1>
      <p>Your app is: {env.LEASH_APP_ID}</p>
      <p>Supabase URL: {env.SUPABASE_URL}</p>
    </div>
  )
}

// app/api/data/route.ts
import { getLeashUser } from '@leash/sdk/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const user = getLeashUser(req)
  return NextResponse.json({ 
    message: `Data for ${user.email}`,
    userId: user.id 
  })
}
```

## Deliverables

1. **TypeScript source code** in `src/`
2. **Compiled JavaScript** in `dist/`
3. **Type definitions** (.d.ts files)
4. **package.json** with exports
5. **README.md** with usage docs
6. **Example Next.js app** showing integration

## Success Criteria

- [x] `useLeashAuth` returns user object when authenticated
- [x] `useLeashAuth` returns null when not authenticated
- [x] `useLeashEnv` returns environment variables
- [x] `getLeashUser` extracts user from request
- [x] Server middleware protects routes
- [x] SDK works in Next.js App Router
- [x] No TypeScript errors
- [x] Builds successfully to dist/
- [x] Can be imported and used in a Next.js app

## Next Steps (After MVP)

1. Publish to npm as `@leash/sdk`
2. Add Supabase helpers
3. Add logging/analytics
4. Support other frameworks (Vue, Svelte, etc.)
5. Add refresh token handling
6. Add logout/session management
7. Add unit and integration tests
