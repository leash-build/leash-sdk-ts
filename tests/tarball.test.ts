/**
 * Tarball Composition Tests (LEA-197)
 *
 * Verifies that `npm pack` only ships published artifacts — never tests,
 * scripts, worktrees, or other dev-only files. Regression test for the bug
 * where @leash/sdk@0.4.0 shipped with all the contents of tests/.
 *
 * The `files` field in package.json is the source of truth. If anyone later
 * adds a new top-level dev directory (e.g. `examples/`, `benchmarks/`), this
 * test will only pass if they also explicitly allow-list it in `files`.
 */

import { describe, expect, it } from 'vitest'
import { execSync } from 'child_process'
import { resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '..')

interface NpmPackEntry {
  path: string
  size?: number
  mode?: number
}

interface NpmPackOutput {
  files: NpmPackEntry[]
  name: string
  version: string
}

function getTarballFiles(): string[] {
  const out = execSync('npm pack --dry-run --json', {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  })
  const parsed = JSON.parse(out) as NpmPackOutput[]
  expect(parsed).toHaveLength(1)
  return parsed[0].files.map((f) => f.path)
}

describe('tarball composition (LEA-197)', () => {
  const files = getTarballFiles()

  it('does not include any test files', () => {
    const testFiles = files.filter((p) => /^tests\//.test(p))
    expect(testFiles).toEqual([])
  })

  it('does not include the scripts directory', () => {
    const scriptFiles = files.filter((p) => /^scripts\//.test(p))
    expect(scriptFiles).toEqual([])
  })

  it('does not include .worktrees', () => {
    const worktreeFiles = files.filter((p) => /\.worktrees/.test(p))
    expect(worktreeFiles).toEqual([])
  })

  it('does not include source files (src/)', () => {
    const srcFiles = files.filter((p) => /^src\//.test(p))
    expect(srcFiles).toEqual([])
  })

  it('does not include tsconfig files', () => {
    const tsconfigFiles = files.filter((p) => /^tsconfig.*\.json$/.test(p))
    expect(tsconfigFiles).toEqual([])
  })

  it('does not include CLAUDE.md or spec docs', () => {
    const docFiles = files.filter((p) => /^(CLAUDE\.md|leash_sdk_spec\.md)$/.test(p))
    expect(docFiles).toEqual([])
  })

  it('includes package.json', () => {
    expect(files).toContain('package.json')
  })

  it('includes README.md', () => {
    expect(files).toContain('README.md')
  })

  it('includes dist/index.js', () => {
    expect(files).toContain('dist/index.js')
  })

  it('only contains allow-listed top-level entries', () => {
    const allowedTopLevel = new Set(['dist', 'package.json', 'README.md', 'LICENSE'])
    const topLevel = new Set(files.map((p) => p.split('/')[0]))
    const unexpected = [...topLevel].filter((t) => !allowedTopLevel.has(t))
    expect(unexpected).toEqual([])
  })
})
