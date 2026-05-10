export interface LeashErrorOptions {
  code: string
  message: string
  action?: string
  seeAlso?: string
}

export class LeashError extends Error {
  readonly code: string
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
