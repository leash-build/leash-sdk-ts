# Leash SDK

TypeScript SDK for the Leash platform.

This package currently covers two areas:

- app auth and environment helpers for Next.js apps
- integration and MCP clients for calling Leash-hosted provider actions

## Install

```bash
npm install @leash/sdk
```

## Main Exports

### App auth and env helpers

- `LeashProvider`
- `useLeashAuth()`
- `useLeashEnv()`
- `getLeashUser(req)`
- `isAuthenticated(req)`
- `leashMiddleware(...)`

### Integrations client

- `LeashIntegrations`
- `getIntegrations(req)`
- `getLeashMcpConfig(...)`
- `getLeashMcpUrl(...)`

## Quick Start

### Client auth

```tsx
import { LeashProvider, useLeashAuth } from '@leash/sdk'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <LeashProvider>{children}</LeashProvider>
      </body>
    </html>
  )
}

export function Profile() {
  const { user, isLoading, error } = useLeashAuth()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>{error.message}</div>
  if (!user) return <div>Not authenticated</div>

  return <div>{user.name}</div>
}
```

### Environment access

```tsx
import { useLeashEnv } from '@leash/sdk'

export function Settings() {
  const env = useLeashEnv()
  return <div>{env.LEASH_APP_ID}</div>
}
```

### Server auth

```ts
import { getLeashUser } from '@leash/sdk/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const user = getLeashUser(req)
  return NextResponse.json({ user })
}
```

### Integrations

```ts
import { LeashIntegrations } from '@leash/sdk/integrations'

const integrations = new LeashIntegrations({
  authToken: 'your-platform-jwt',
  apiKey: process.env.LEASH_API_KEY,
})

const messages = await integrations.gmail.listMessages({ maxResults: 5 })
const env = await integrations.getEnv()
```

## Authentication Notes

The platform user token shape uses the current Leash JWT payload, including `userId`.

This SDK supports the current payload and remains backward-compatible with older `sub`-based payloads where needed.

Server helpers expect:

- the `leash-auth` cookie for browser/session auth
- `LEASH_JWT_SECRET` for verification when verification is enabled

## Environment Variables

### Server-side

- `LEASH_JWT_SECRET`

### Common runtime values exposed by the platform

- `LEASH_USER_ID`
- `LEASH_USER_EMAIL`
- `LEASH_APP_ID`
- `SUPABASE_URL`
- `SUPABASE_KEY`

## Testing

Run the local SDK suite with:

```bash
npm test
```

This suite covers:

- auth payload compatibility
- integration request construction
- env fetch and cache behavior

## Build

```bash
npm run build
```

## License

Apache-2.0
