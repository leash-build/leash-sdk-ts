// Server-side exports — framework-agnostic, no Next.js dependency
export { getLeashUser, isAuthenticated } from './auth.js'

// Next.js middleware moved to '@leash/sdk/middleware'
// to avoid pulling in 'next/server' in non-Next.js environments
