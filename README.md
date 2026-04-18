# Leash SDK

TypeScript SDK for the Leash platform. Works with any JavaScript/TypeScript framework — Next.js, Express, Koa, Hono, Fastify, plain Node.js.

## Install

```bash
npm install @leash/sdk
```

## Entry Points

| Import | Use case | Requires |
|--------|----------|----------|
| `@leash/sdk` | React hooks (useLeashAuth, useLeashEnv, LeashProvider) | React |
| `@leash/sdk/server` | Server auth (getLeashUser, isAuthenticated) | Nothing — works with any framework |
| `@leash/sdk/middleware` | Next.js route protection (leashMiddleware) | Next.js |
| `@leash/sdk/integrations` | API client (LeashIntegrations, getIntegrations) | Nothing |
| `@leash/sdk/integrations/react` | React hooks for integrations (useIntegrations, useIntegrationStatus) | React |
| `@leash/sdk/integrations/mcp` | MCP server config helpers | Nothing |

## Quick Start

### React (Next.js) — client auth

```tsx
// app/providers.tsx
'use client'
import { LeashProvider } from '@leash/sdk'

export default function Providers({ children }: { children: React.ReactNode }) {
  return <LeashProvider>{children}</LeashProvider>
}

// app/layout.tsx
import Providers from './providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body><Providers>{children}</Providers></body></html>
}

// app/page.tsx
'use client'
import { useLeashAuth, useLeashEnv } from '@leash/sdk'

export default function Home() {
  const { user, isLoading, error } = useLeashAuth()
  const env = useLeashEnv()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>{error.message}</div>
  if (!user) return <div>Not authenticated</div>

  return <div>Welcome {user.name} — App: {env.LEASH_APP_ID}</div>
}
```

### Express — server auth

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

app.listen(process.env.PORT || 3000)
```

### Next.js API route — server auth

```ts
import { getLeashUser } from '@leash/sdk/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const user = getLeashUser(req)
  return NextResponse.json({ user })
}
```

### Next.js middleware — route protection

```ts
// middleware.ts
import { leashMiddleware } from '@leash/sdk/middleware'

export const middleware = leashMiddleware({
  publicRoutes: ['/login', '/about'],
  redirectTo: '/login'
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
```

### Integrations — server-side

```ts
import { LeashIntegrations } from '@leash/sdk/integrations'

const integrations = new LeashIntegrations({
  apiKey: process.env.LEASH_API_KEY,
})

const messages = await integrations.gmail.listMessages({ maxResults: 5 })
const env = await integrations.getEnv()
```

### Integrations — React hooks

```tsx
import { useIntegrations, useIntegrationStatus } from '@leash/sdk/integrations/react'

function Dashboard() {
  const integrations = useIntegrations()
  const { isConnected, getConnectUrl } = useIntegrationStatus()

  if (!isConnected('gmail')) {
    return <a href={getConnectUrl('gmail')}>Connect Gmail</a>
  }

  // Use integrations.gmail.listMessages(), etc.
}
```

## Server Auth — Framework Compatibility

`getLeashUser(req)` works with any request object that carries cookies:

- **Next.js** — `req.cookies.get()` (NextRequest)
- **Express** — `req.cookies` (with cookie-parser) or `req.headers.cookie`
- **Koa** — `ctx.cookies` or `ctx.headers.cookie`
- **Hono** — `req.headers.cookie`
- **Fastify** — `req.headers.cookie`
- **Plain Node.js** — `req.headers.cookie` (IncomingMessage)

No framework-specific dependencies. Just reads the `leash-auth` cookie from wherever it lives.

## Environment Variables

### Server-side (set in dashboard, injected at deploy)

- `LEASH_JWT_SECRET` — for JWT verification (optional, decodes without it)

### Runtime values (auto-injected by platform)

- `LEASH_USER_ID`
- `LEASH_USER_EMAIL`
- `LEASH_APP_ID`
- `SUPABASE_URL`
- `SUPABASE_KEY`

## Testing

```bash
npm test
```

## Build

```bash
npm run build
```

## License

Apache-2.0
