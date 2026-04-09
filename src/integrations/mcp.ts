const DEFAULT_PLATFORM_URL = 'https://leash.build'

export interface McpServerConfig {
  url: string
  transport: 'streamable-http'
  name: string
  provider: string
}

/**
 * Get MCP server configurations for Leash-hosted integration providers.
 * These configs can be used with any MCP client (Claude Desktop, LangChain, Vercel AI SDK, etc.)
 *
 * Usage:
 * ```typescript
 * import { getLeashMcpConfig } from '@leash/sdk/integrations/mcp'
 *
 * const servers = getLeashMcpConfig(['gmail'])
 * // [{ url: 'https://leash.build/mcp/gmail', transport: 'streamable-http', name: 'leash-gmail', provider: 'gmail' }]
 * ```
 */
export function getLeashMcpConfig(
  providers: string[],
  platformUrl?: string
): McpServerConfig[] {
  const base = platformUrl || process.env.LEASH_PLATFORM_URL || DEFAULT_PLATFORM_URL

  return providers.map((provider) => ({
    url: `${base}/mcp/${provider}`,
    transport: 'streamable-http' as const,
    name: `leash-${provider}`,
    provider,
  }))
}

/**
 * Get the MCP server URL for a specific provider.
 */
export function getLeashMcpUrl(provider: string, platformUrl?: string): string {
  const base = platformUrl || process.env.LEASH_PLATFORM_URL || DEFAULT_PLATFORM_URL
  return `${base}/mcp/${provider}`
}
