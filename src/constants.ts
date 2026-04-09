// Cookie name used by Leash platform
export const LEASH_AUTH_COOKIE = 'leash-auth'

// Default redirect path for unauthorized users
export const DEFAULT_REDIRECT_PATH = '/login'

// Default platform URL for integration proxy calls
export const LEASH_PLATFORM_URL = 'https://leash.build'

// Standard Leash environment variable keys
export const LEASH_ENV_KEYS = {
  USER_ID: 'LEASH_USER_ID',
  USER_EMAIL: 'LEASH_USER_EMAIL',
  APP_ID: 'LEASH_APP_ID',
  SUPABASE_URL: 'SUPABASE_URL',
  SUPABASE_KEY: 'SUPABASE_KEY',
} as const
