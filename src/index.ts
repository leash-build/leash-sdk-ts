// Main entry point - exports client-side functionality
// For server-side, import from '@leash/sdk/server'

export { useLeashAuth, useLeashEnv, LeashProvider, LeashContext } from './client'

// Export types
export type {
  LeashUser,
  LeashEnv,
  LeashAuthContext,
  LeashMiddlewareOptions,
  LeashJWTPayload,
} from './types'

// Export constants
export { LEASH_AUTH_COOKIE, DEFAULT_REDIRECT_PATH, LEASH_ENV_KEYS } from './constants'
