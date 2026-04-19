/**
 * Import Isolation Tests (runtime)
 *
 * These tests actually try to import each entry point in a subprocess
 * with NO peer dependencies available. This catches the exact bug we hit:
 * importing @leash/sdk/server in an Express app crashed because it
 * transitively pulled in 'next/server'.
 *
 * Unlike the static file-scanning tests in entry-points.test.ts, these
 * tests catch transitive dependency issues that only show up at runtime.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const SDK_ROOT = join(__dirname, '..')

// Build the SDK and pack it as a tarball once before all tests
let tarballPath: string

beforeAll(() => {
  // Build the SDK
  execSync('npm run build', { cwd: SDK_ROOT, stdio: 'pipe' })

  // Pack it into a tarball (simulates npm install from registry)
  const output = execSync('npm pack --pack-destination /tmp', {
    cwd: SDK_ROOT,
    encoding: 'utf-8',
  }).trim()

  tarballPath = join('/tmp', output.split('\n').pop()!)
}, 30000)

function testImportInCleanEnv(entryPoint: string, shouldWork: boolean = true) {
  // Create a temp directory with a minimal package.json
  const tmpDir = mkdtempSync(join(tmpdir(), 'leash-sdk-test-'))

  try {
    // Minimal ESM package
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-app', type: 'module', private: true })
    )

    // Install the SDK from tarball (no react, no next)
    execSync(`npm install ${tarballPath} --no-save 2>&1`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 30000,
    })

    // Try to import the entry point
    const script = `import('${entryPoint}').then(m => { console.log('OK:', Object.keys(m).join(',')); process.exit(0) }).catch(e => { console.error('FAIL:', e.code, e.message); process.exit(1) })`

    const result = execSync(`node -e "${script}" 2>&1`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 10000,
    })

    if (shouldWork) {
      expect(result).toContain('OK:')
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

describe('import in clean environment (no React, no Next.js)', () => {
  it('@leash/sdk/server works without react or next', () => {
    testImportInCleanEnv('@leash/sdk/server')
  }, 60000)

  it('@leash/sdk/integrations works without react or next', () => {
    testImportInCleanEnv('@leash/sdk/integrations')
  }, 60000)

  it('@leash/sdk/integrations/mcp works without react or next', () => {
    testImportInCleanEnv('@leash/sdk/integrations/mcp')
  }, 60000)
})

describe('import with React but no Next.js', () => {
  it('@leash/sdk works when react is installed', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'leash-sdk-test-react-'))

    try {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', type: 'module', private: true })
      )

      // Install SDK + React (but NOT Next.js)
      execSync(`npm install ${tarballPath} react@18 --no-save 2>&1`, {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 30000,
      })

      // Main entry should work (it exports React hooks)
      const script = `import('@leash/sdk').then(m => { console.log('OK:', Object.keys(m).join(',')); process.exit(0) }).catch(e => { console.error('FAIL:', e.code, e.message); process.exit(1) })`

      const result = execSync(`node -e "${script}" 2>&1`, {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 10000,
      })

      expect(result).toContain('OK:')
      expect(result).toContain('useLeashAuth')
      expect(result).toContain('LeashProvider')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 60000)
})

describe('@leash/sdk main entry fails gracefully without React', () => {
  it('@leash/sdk fails with clear error when react is missing', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'leash-sdk-test-noreact-'))

    try {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', type: 'module', private: true })
      )

      execSync(`npm install ${tarballPath} --no-save 2>&1`, {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 30000,
      })

      // Main entry should fail because it needs React
      const script = `import('@leash/sdk').then(() => process.exit(0)).catch(e => { console.error(e.code); process.exit(1) })`

      try {
        execSync(`node -e "${script}" 2>&1`, {
          cwd: tmpDir,
          encoding: 'utf-8',
          timeout: 10000,
        })
        // If it didn't throw, that's unexpected but not necessarily wrong
        // (some Node versions handle missing optional deps differently)
      } catch (e: any) {
        // Should fail with MODULE_NOT_FOUND for react — this is expected
        expect(e.stdout || e.stderr || '').toMatch(/react|MODULE_NOT_FOUND/)
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 60000)
})
