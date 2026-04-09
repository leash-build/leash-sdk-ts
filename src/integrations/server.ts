import { LeashIntegrations } from './client'
import { LEASH_AUTH_COOKIE } from '../constants'

/**
 * Create a LeashIntegrations instance from a Next.js request.
 * Extracts the leash-auth cookie and forwards it as a Bearer token to the platform.
 *
 * Usage in an API route:
 * ```typescript
 * import { getIntegrations } from '@leash/sdk/integrations'
 *
 * export async function GET(req: NextRequest) {
 *   const integrations = getIntegrations(req)
 *   const messages = await integrations.gmail.listMessages({ maxResults: 10 })
 *   return NextResponse.json(messages)
 * }
 * ```
 */
export function getIntegrations(req: {
  cookies: { get: (name: string) => { value: string } | undefined }
}): LeashIntegrations {
  const cookie = req.cookies.get(LEASH_AUTH_COOKIE)?.value
  if (!cookie) {
    throw new Error('Not authenticated: missing leash-auth cookie')
  }

  return new LeashIntegrations({ authToken: cookie })
}
