# Leash SDK — Specification

## Overview

The Leash SDK is a TypeScript library that provides authentication, environment variable access, and integrations for apps deployed on the Leash platform. It works with any JavaScript/TypeScript framework — not just Next.js.

## Entry Points

| Path | Purpose | Dependencies |
|------|---------|-------------|
| `@leash/sdk` | React hooks and context (useLeashAuth, useLeashEnv, LeashProvider) | React 18+ |
| `@leash/sdk/server` | Framework-agnostic server auth (getLeashUser, isAuthenticated) | None |
| `@leash/sdk/middleware` | Next.js route protection (leashMiddleware) | Next.js |
| `@leash/sdk/integrations` | API client for Leash-hosted provider actions | None |
| `@leash/sdk/integrations/react` | React hooks for integrations | React 18+ |
| `@leash/sdk/integrations/mcp` | MCP server config helpers | None |

React and Next.js are optional peer dependencies. Server and integrations work without them.

## Core Features

### 1. Authentication (`useLeashAuth`)
- React hook that returns authenticated user context
- User data includes: `id`, `email`, `name`, `picture`
- Client-side only (use in components with `'use client'`)

### 2. Environment Variables (`useLeashEnv`)
- Access Leash-provided environment variables
- Auto-injected vars: `LEASH_USER_ID`, `LEASH_USER_EMAIL`, `LEASH_APP_ID`, `SUPABASE_URL`, `SUPABASE_KEY`
- Custom vars set through Leash dashboard

### 3. Server Auth (`getLeashUser`)
- Extract and validate user from any HTTP request
- Works with Express, Koa, Hono, Fastify, Next.js, plain Node.js
- Reads `leash-auth` cookie from headers — no framework dependency

### 4. Next.js Middleware (`leashMiddleware`)
- Protect Next.js routes from unauthenticated access
- Requires Next.js (separate entry point to avoid contaminating non-Next.js apps)

### 5. Integrations Client (`LeashIntegrations`)
- Call Leash-hosted provider actions (Gmail, Calendar, Drive, BigQuery, etc.)
- Works server-side with API key auth or browser-side with cookie auth
- No React dependency

## Type Definitions

```typescript
interface LeashUser {
  id: string
  email: string
  name: string
  picture?: string
}

interface LeashEnv {
  [key: string]: string | undefined
  LEASH_USER_ID: string
  LEASH_USER_EMAIL: string
  LEASH_APP_ID: string
  SUPABASE_URL: string
  SUPABASE_KEY: string
}

interface LeashAuthContext {
  user: LeashUser | null
  isLoading: boolean
  error: Error | null
}

interface LeashMiddlewareOptions {
  publicRoutes?: string[]
  redirectTo?: string
}
```

## Package Structure

```
@leash/sdk/
├── src/
│   ├── client/                    # React hooks and context
│   │   ├── hooks/
│   │   │   ├── useLeashAuth.ts
│   │   │   ├── useLeashEnv.ts
│   │   │   └── index.ts
│   │   ├── context/
│   │   │   ├── LeashProvider.tsx
│   │   │   └── leashContext.ts
│   │   └── index.ts
│   ├── server/                    # Framework-agnostic server auth
│   │   ├── auth.ts                # getLeashUser() — works with any request
│   │   ├── middleware.ts          # leashMiddleware() — Next.js only
│   │   └── index.ts              # exports auth only (not middleware)
│   ├── integrations/              # Integrations client
│   │   ├── client.ts             # LeashIntegrations class
│   │   ├── server.ts             # getIntegrations() helper
│   │   ├── mcp.ts                # MCP config helpers
│   │   ├── hooks/                # React hooks (separate from barrel)
│   │   │   ├── useIntegrations.ts
│   │   │   └── useIntegrationStatus.ts
│   │   ├── react.ts              # React hook exports (opt-in)
│   │   ├── types.ts
│   │   └── index.ts              # No React imports
│   ├── auth/
│   │   └── payload.ts            # JWT payload parsing
│   ├── types.ts
│   ├── constants.ts
│   └── index.ts                  # React exports only
├── dist/
└── package.json
```

## Server Auth — How It Works

`getLeashUser(req)` extracts the `leash-auth` cookie from any HTTP request:

1. Checks `req.cookies.get(name)` (Next.js / Web Request)
2. Checks `req.cookies[name]` (Express with cookie-parser)
3. Falls back to parsing `req.headers.cookie` (raw header — works everywhere)
4. Decodes/verifies the JWT
5. Returns a `LeashUser` object or throws

No `NextRequest` import, no framework dependency.

## Usage Examples

### Express

```js
import express from 'express'
import { getLeashUser } from '@leash/sdk/server'

const app = express()

app.get('/me', (req, res) => {
  try {
    const user = getLeashUser(req)
    res.json({ user })
  } catch {
    res.status(401).json({ error: 'Not authenticated' })
  }
})
```

### Next.js API Route

```ts
import { getLeashUser } from '@leash/sdk/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const user = getLeashUser(req)
  return NextResponse.json({ user })
}
```

### Next.js Middleware

```ts
// middleware.ts
import { leashMiddleware } from '@leash/sdk/middleware'

export const middleware = leashMiddleware({
  publicRoutes: ['/login', '/about'],
  redirectTo: '/login'
})
```

### React Client

```tsx
'use client'
import { useLeashAuth } from '@leash/sdk'

export default function Page() {
  const { user, isLoading, error } = useLeashAuth()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!user) return <div>Not authenticated</div>

  return <div>Hello {user.name}</div>
}
```

### Integrations (server-side)

```ts
import { LeashIntegrations } from '@leash/sdk/integrations'

const client = new LeashIntegrations({ apiKey: process.env.LEASH_API_KEY })
const messages = await client.gmail.listMessages({ maxResults: 5 })
```

### Integrations (React hooks)

```tsx
import { useIntegrations } from '@leash/sdk/integrations/react'

function Dashboard() {
  const integrations = useIntegrations()
  // integrations.gmail.listMessages(), etc.
}
```

## Success Criteria

- [x] `useLeashAuth` returns user object when authenticated
- [x] `useLeashAuth` returns null when not authenticated
- [x] `useLeashEnv` returns environment variables
- [x] `getLeashUser` works with Express, Koa, Hono, Fastify, Next.js, plain Node
- [x] `getLeashUser` works without React or Next.js installed
- [x] `LeashIntegrations` works without React installed
- [x] Next.js middleware works via separate entry point
- [x] No TypeScript errors
- [x] Builds successfully to dist/
- [x] Published to npm as `@leash/sdk`

## License

Apache-2.0
