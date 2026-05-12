export type LeashErrorCode =
  | 'NO_API_KEY'
  | 'NO_REQUEST_SERVER_CONSTRUCT'
  | 'BROWSER_MODE_UNSUPPORTED'
  | 'UNAUTHORIZED'
  | 'INTEGRATION_NOT_ENABLED'
  | 'INTEGRATION_ERROR'
  | 'UPGRADE_REQUIRED'
  | 'NETWORK_ERROR'
  | 'UPGRADE_REQUIRED'
  | 'KEY_NOT_DECLARED'
  | 'SOURCE_RESYNC_FAILED'
  | 'ENV_FETCH_ERROR'

export interface LeashErrorOptions {
  code: LeashErrorCode
  message: string
  action?: string
  seeAlso?: string
}

export class LeashError extends Error {
  readonly code: LeashErrorCode
  readonly action?: string
  readonly seeAlso?: string

  constructor(opts: LeashErrorOptions) {
    super(opts.message)
    this.name = 'LeashError'
    this.code = opts.code
    this.action = opts.action
    this.seeAlso = opts.seeAlso
  }

  toString(): string {
    let s = `× ${this.message}`
    if (this.action) s += `\n  Fix: ${this.action}`
    if (this.seeAlso) s += `\n  See: ${this.seeAlso}`
    return s
  }
}
