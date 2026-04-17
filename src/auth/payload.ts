import type { LeashUser, LeashJWTPayload } from '../types.js'

export function getLeashUserId(payload: LeashJWTPayload): string | null {
  return payload.userId || payload.sub || null
}

export function payloadToUser(payload: LeashJWTPayload): LeashUser {
  const id = getLeashUserId(payload)

  if (!id) {
    throw new Error('Token payload is missing a user identifier')
  }

  return {
    id,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  }
}
