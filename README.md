# Leash SDK

TypeScript SDK for building apps on the Leash platform. Provides seamless authentication and environment variable management for Next.js applications.

## Features

- **Client-side hooks**: `useLeashAuth` and `useLeashEnv` for React components
- **Server-side utilities**: `getLeashUser` for API routes and server components
- **Middleware**: Automatic route protection with `leashMiddleware`
- **TypeScript support**: Full type definitions included
- **Next.js App Router**: Built for Next.js 13+ with App Router

## Installation

```bash
npm install @leash/sdk
```

## Quick Start

### 1. Wrap your app with LeashProvider

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
```

### 2. Use authentication in components

```typescript
// app/page.tsx
'use client'

import { useLeashAuth } from '@leash/sdk'

export default function Home() {
  const { user, isLoading, error } = useLeashAuth()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!user) return <div>Not authenticated</div>

  return <div>Welcome {user.name}!</div>
}
```

### 3. Access environment variables

```typescript
'use client'

import { useLeashEnv } from '@leash/sdk'

export default function Settings() {
  const env = useLeashEnv()

  return (
    <div>
      <p>App ID: {env.LEASH_APP_ID}</p>
      <p>Supabase URL: {env.SUPABASE_URL}</p>
    </div>
  )
}
```

### 4. Protect API routes

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

### 5. Add middleware for route protection

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

## API Reference

### Client-Side

#### `useLeashAuth()`

Hook that returns authenticated user context.

**Returns:**
```typescript
{
  user: LeashUser | null
  isLoading: boolean
  error: Error | null
}
```

**LeashUser Type:**
```typescript
{
  id: string
  email: string
  name: string
  picture?: string
}
```

#### `useLeashEnv()`

Hook that returns Leash environment variables.

**Returns:**
```typescript
{
  LEASH_USER_ID: string
  LEASH_USER_EMAIL: string
  LEASH_APP_ID: string
  SUPABASE_URL: string
  SUPABASE_KEY: string
  [key: string]: string | undefined // Custom vars
}
```

#### `<LeashProvider>`

React context provider that manages authentication state.

**Props:**
- `children: React.ReactNode`

### Server-Side

#### `getLeashUser(req: NextRequest)`

Extracts and validates the authenticated user from a Next.js request.

**Parameters:**
- `req: NextRequest` - Next.js request object

**Returns:** `LeashUser`

**Throws:** `Error` if not authenticated or token is invalid

#### `isAuthenticated(req: NextRequest)`

Checks if a request has valid Leash authentication.

**Returns:** `boolean`

#### `leashMiddleware(options?)`

Creates Next.js middleware for route protection.

**Options:**
```typescript
{
  publicRoutes?: string[]  // Routes accessible without auth
  redirectTo?: string      // Where to redirect unauthenticated users
}
```

**Returns:** Next.js middleware function

## Environment Variables

### Required (Server-Side)

- `LEASH_JWT_SECRET` - Secret for JWT verification (provided by Leash platform)

### Auto-Injected by Leash Platform

- `LEASH_USER_ID` - Current user's ID
- `LEASH_USER_EMAIL` - Current user's email
- `LEASH_APP_ID` - Your app's ID
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase anon key

## Complete Example

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

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions. All types are exported from the main package:

```typescript
import type {
  LeashUser,
  LeashEnv,
  LeashAuthContext,
  LeashMiddlewareOptions
} from '@leash/sdk'
```

## Development

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Watch mode for development
npm run dev

# Clean build artifacts
npm run clean
```

## License

MIT
