// User type
export interface LeashUser {
  id: string
  email: string
  name: string
  picture?: string
}

// Environment type
export interface LeashEnv {
  [key: string]: string | undefined
  LEASH_USER_ID: string
  LEASH_USER_EMAIL: string
  LEASH_APP_ID: string
  SUPABASE_URL: string
  SUPABASE_KEY: string
}

// Auth context type
export interface LeashAuthContext {
  user: LeashUser | null
  isLoading: boolean
  error: Error | null
}

// Middleware options
export interface LeashMiddlewareOptions {
  publicRoutes?: string[]
  redirectTo?: string
}

// JWT payload structure from Leash platform
export interface LeashJWTPayload {
  sub: string // user ID
  email: string
  name: string
  picture?: string
  iat: number
  exp: number
}

// Window extension for Leash environment variables
declare global {
  interface Window {
    __LEASH_ENV__?: Record<string, string>
  }
}
