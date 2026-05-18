// Main entry point - exports client-side functionality
// For server-side, import from '@leash/sdk/server'

export {
  useLeashAuth,
  useLeashEnv,
  useLeashRedirectToLogin,
  LeashProvider,
  LeashContext,
} from './client/index.js'

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

// 0.4 unified class + error are NOT exported from the root barrel because
// the root entry is React-requiring (LeashProvider et al.). Pulling Leash
// from '@leash/sdk' would force React into non-React consumers. Import the
// 0.4 surface from '@leash/sdk/leash' instead:
//
//   import { Leash, LeashError } from '@leash/sdk/leash'
//
// When the React split lands in 0.4-rc (LeashProvider moves to
// '@leash/sdk/react'), the root barrel will re-export Leash here and the
// '@leash/sdk/leash' path becomes an alias.
