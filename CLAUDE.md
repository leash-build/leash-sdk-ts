# Leash SDK

TypeScript SDK for the Leash platform. Provides authentication, environment variables, integrations, and MCP clients.

**Framework-agnostic.** Server auth works with Express, Koa, Hono, Fastify, Next.js, plain Node.js. React and Next.js are optional — only needed for their respective entry points.

## Entry Points

| Import path | What it exports | Requires |
|-------------|----------------|----------|
| `@leash/sdk` | `LeashProvider`, `useLeashAuth`, `useLeashEnv`, `LeashContext` | React |
| `@leash/sdk/server` | `getLeashUser`, `isAuthenticated` | Nothing |
| `@leash/sdk/middleware` | `leashMiddleware`, `createLeashMiddleware` | Next.js |
| `@leash/sdk/integrations` | `LeashIntegrations`, `getIntegrations`, MCP helpers, types | Nothing |
| `@leash/sdk/integrations/react` | `useIntegrations`, `useIntegrationStatus` | React |
| `@leash/sdk/integrations/mcp` | `getLeashMcpConfig`, `getLeashMcpUrl` | Nothing |

**Critical: entry point isolation.** Each entry point only imports what it needs. `@leash/sdk/server` does NOT import React or Next.js. `@leash/sdk/integrations` does NOT import React. This is intentional — mixing them breaks non-React/non-Next.js apps.

## Architecture

```
src/
├── client/                    # React-only (useLeashAuth, useLeashEnv, LeashProvider)
│   ├── hooks/
│   │   ├── useLeashAuth.ts
│   │   ├── useLeashEnv.ts
│   │   └── index.ts
│   └── context/
│       ├── LeashProvider.tsx
│       └── leashContext.ts
├── server/                    # Framework-agnostic
│   ├── auth.ts                # getLeashUser — reads cookie from ANY request
│   ├── middleware.ts          # leashMiddleware — Next.js only (NOT in server/index.ts)
│   └── index.ts               # exports auth.ts only
├── integrations/              # No React, no Next.js
│   ├── client.ts              # LeashIntegrations class
│   ├── server.ts              # getIntegrations() helper
│   ├── mcp.ts                 # MCP config
│   ├── hooks/                 # React hooks (NOT exported from index.ts)
│   │   ├── useIntegrations.ts
│   │   └── useIntegrationStatus.ts
│   ├── react.ts               # React hook exports (separate entry point)
│   ├── types.ts
│   └── index.ts               # Exports client, server, mcp, types — NO hooks
├── auth/
│   └── payload.ts             # JWT payload → LeashUser conversion
├── types.ts
├── constants.ts
└── index.ts                   # Re-exports from client/ (React entry)
```

## How Server Auth Works

`getLeashUser(req)` accepts ANY HTTP request object. It extracts the `leash-auth` cookie using three strategies in order:

1. `req.cookies.get(name)` — Next.js `NextRequest` / Web Request
2. `req.cookies[name]` — Express with `cookie-parser`
3. `req.headers.cookie` parsed manually — raw Node.js `IncomingMessage`, Koa, Hono, Fastify

Then decodes/verifies the JWT and returns a `LeashUser`.

**No `NextRequest` import.** No framework dependency. The `req` parameter is typed as `any` to accept all frameworks.

## Auth Flow

```
1. User visits deployed app on *.un.leash.build
2. Platform sets leash-auth cookie (JWT)
3. SDK reads cookie:
   - Client: LeashProvider reads from document.cookie, provides via React context
   - Server: getLeashUser reads from request headers/cookies
4. JWT decoded → LeashUser { id, email, name, picture }
```

## JWT Structure

```typescript
{
  userId: "uuid",
  email: "user@example.com",
  name: "John Doe",
  username: "johndoe",
  iat: 1234567890,
  exp: 1234567890 + (30 * 24 * 60 * 60)
}
```

## Types

```typescript
interface LeashUser {
  id: string
  email: string
  name: string
  picture?: string
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

Note: `LeashAuthContext` has `error`, not `isAuthenticated`. Check `user !== null` for auth status.

## Integrations Client

`LeashIntegrations` proxies calls through `leash.build/api/integrations/...`. Auth via:
- Browser: `leash-auth` cookie (credentials: 'include')
- Server: `LEASH_API_KEY` env var or `apiKey` constructor option
- Server: `authToken` constructor option (JWT)

Config auto-reads from env:
- `LEASH_PLATFORM_URL` (default: `https://leash.build`)
- `LEASH_API_KEY`

## Usage

### Express server

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

### Next.js App Router — React

```tsx
// app/providers.tsx
'use client'
import { LeashProvider } from '@leash/sdk'

export default function Providers({ children }: { children: React.ReactNode }) {
  return <LeashProvider>{children}</LeashProvider>
}

// app/page.tsx
'use client'
import { useLeashAuth } from '@leash/sdk'

export default function Page() {
  const { user, isLoading, error } = useLeashAuth()
  if (isLoading) return <div>Loading...</div>
  if (!user) return <div>Not authenticated</div>
  return <div>Hello {user.name}</div>
}
```

### Next.js middleware

```ts
// middleware.ts — import from @leash/sdk/middleware, NOT @leash/sdk/server
import { leashMiddleware } from '@leash/sdk/middleware'

export const middleware = leashMiddleware({
  publicRoutes: ['/login', '/about'],
  redirectTo: '/login'
})
```

### Integrations — server

```ts
import { LeashIntegrations } from '@leash/sdk/integrations'

const client = new LeashIntegrations({ apiKey: process.env.LEASH_API_KEY })
const messages = await client.gmail.listMessages({ maxResults: 5 })
```

### Integrations — React

```tsx
// Import from @leash/sdk/integrations/react, NOT @leash/sdk/integrations
import { useIntegrations, useIntegrationStatus } from '@leash/sdk/integrations/react'
```

## Build

```bash
npm run build    # tsc (CommonJS) then tsc -p tsconfig.esm.json (ESM overwrites)
npm test         # vitest
npm run clean    # rm -rf dist
```

Output is ESM (`"type": "module"` in package.json). All internal imports use `.js` extensions for Node ESM compatibility.

## Publishing

```bash
npm version patch
npm run build
npm publish --access public --otp=CODE
```

Current version: check `package.json`.

## Critical Rules

- **Never add React or Next.js imports to `server/auth.ts` or `integrations/client.ts`.** These must stay framework-agnostic.
- **Never re-export React hooks from `integrations/index.ts` or `server/index.ts`.** They contaminate the barrel and break Express/non-React apps.
- **`server/middleware.ts` is intentionally NOT exported from `server/index.ts`.** It imports `next/server` and would break non-Next.js apps. It's accessible via `@leash/sdk/middleware` only.
- **All `.js` extensions required in imports** for Node ESM resolution.
- **`peerDependencies` are optional** via `peerDependenciesMeta`. React and Next.js are only needed for their respective entry points.
