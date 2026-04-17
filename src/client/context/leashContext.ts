import { createContext } from 'react'
import type { LeashAuthContext } from '../../types.js'

// Create auth context with default values
export const LeashContext = createContext<LeashAuthContext>({
  user: null,
  isLoading: true,
  error: null,
})
