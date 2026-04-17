// Main entry point - exports client-side functionality
// For server-side, import from '@leash/sdk/server'

export { useLeashAuth, useLeashEnv, LeashProvider, LeashContext } from './client/index.js'

// Export types
export type {
  LeashUser,
  LeashEnv,
  LeashAuthContext,
  LeashMiddlewareOptions,
  LeashJWTPayload,
} from './types.js'

// Export constants
export { LEASH_AUTH_COOKIE, DEFAULT_REDIRECT_PATH, LEASH_ENV_KEYS } from './constants.js'
