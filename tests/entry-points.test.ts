/**
 * Entry Point Isolation Tests
 *
 * These tests verify that each SDK entry point can be imported without
 * pulling in unwanted dependencies. This prevents the bugs we hit:
 * - @leash/sdk/server importing 'next' (broke Express apps)
 * - @leash/sdk/integrations importing 'react' (broke Node.js apps)
 * - ESM directory imports failing on Node 23
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { execSync } from 'child_process'

const DIST = resolve(__dirname, '../dist')

describe('dist output exists', () => {
  const requiredFiles = [
    'index.js',
    'index.d.ts',
    'server/index.js',
    'server/index.d.ts',
    'server/auth.js',
    'server/middleware.js',
    'integrations/index.js',
    'integrations/index.d.ts',
    'integrations/client.js',
    'integrations/react.js',
    'integrations/mcp.js',
    'client/index.js',
    'client/hooks/index.js',
    'client/context/LeashProvider.js',
    'constants.js',
    'types.js',
  ]

  for (const file of requiredFiles) {
    it(`dist/${file} exists`, () => {
      expect(existsSync(join(DIST, file))).toBe(true)
    })
  }
})

describe('no directory imports in dist (Node ESM compatibility)', () => {
  it('all relative imports have explicit .js extensions', () => {
    const output = execSync(
      `grep -rn "from '\\./[^']*'" ${DIST} --include="*.js" || true`,
      { encoding: 'utf-8' }
    )

    const lines = output.trim().split('\n').filter(Boolean)
    const badImports: string[] = []

    for (const line of lines) {
      // Extract the import path
      const match = line.match(/from '(\.[^']*)'/)
      if (!match) continue
      const importPath = match[1]

      // Must end in .js
      if (!importPath.endsWith('.js')) {
        badImports.push(line)
      }
    }

    expect(badImports).toEqual([])
  })
})

describe('@leash/sdk/server does NOT import React or Next.js', () => {
  it('server/index.js has no react import', () => {
    const content = readFileSync(join(DIST, 'server/index.js'), 'utf-8')
    expect(content).not.toMatch(/from ['"]react['"]/)
    expect(content).not.toMatch(/require\(['"]react['"]\)/)
  })

  it('server/index.js has no next import', () => {
    const content = readFileSync(join(DIST, 'server/index.js'), 'utf-8')
    expect(content).not.toMatch(/from ['"]next/)
    expect(content).not.toMatch(/require\(['"]next/)
  })

  it('server/auth.js has no react import', () => {
    const content = readFileSync(join(DIST, 'server/auth.js'), 'utf-8')
    expect(content).not.toMatch(/from ['"]react['"]/)
  })

  it('server/auth.js has no next import', () => {
    const content = readFileSync(join(DIST, 'server/auth.js'), 'utf-8')
    expect(content).not.toMatch(/from ['"]next/)
  })
})

describe('@leash/sdk/integrations does NOT import React', () => {
  it('integrations/index.js has no react import', () => {
    const content = readFileSync(join(DIST, 'integrations/index.js'), 'utf-8')
    expect(content).not.toMatch(/from ['"]react['"]/)
  })

  it('integrations/client.js has no react import', () => {
    const content = readFileSync(join(DIST, 'integrations/client.js'), 'utf-8')
    expect(content).not.toMatch(/from ['"]react['"]/)
  })

  it('integrations/server.js has no react import', () => {
    const content = readFileSync(join(DIST, 'integrations/server.js'), 'utf-8')
    expect(content).not.toMatch(/from ['"]react['"]/)
  })

  it('integrations/index.js does NOT re-export hooks', () => {
    const content = readFileSync(join(DIST, 'integrations/index.js'), 'utf-8')
    expect(content).not.toMatch(/useIntegrations/)
    expect(content).not.toMatch(/useIntegrationStatus/)
  })
})

describe('@leash/sdk/integrations/react DOES import React (expected)', () => {
  it('integrations/react.js re-exports hooks', () => {
    const content = readFileSync(join(DIST, 'integrations/react.js'), 'utf-8')
    expect(content).toMatch(/useIntegrations/)
    expect(content).toMatch(/useIntegrationStatus/)
  })
})

describe('server/middleware.js is NOT exported from server/index.js', () => {
  it('server/index.js does not export middleware functions', () => {
    const content = readFileSync(join(DIST, 'server/index.js'), 'utf-8')
    // Comments mentioning middleware are fine — actual exports are not
    expect(content).not.toMatch(/export.*leashMiddleware/)
    expect(content).not.toMatch(/export.*createLeashMiddleware/)
    expect(content).not.toMatch(/from ['"].*middleware/)  // no import from middleware.js
  })

  it('server/middleware.js exists separately', () => {
    expect(existsSync(join(DIST, 'server/middleware.js'))).toBe(true)
  })
})

describe('package.json exports are correct', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))
  const exports = pkg.exports

  it('has . entry point', () => {
    expect(exports['.']).toBeDefined()
    expect(exports['.'].default).toBe('./dist/index.js')
  })

  it('has ./server entry point', () => {
    expect(exports['./server']).toBeDefined()
    expect(exports['./server'].default).toBe('./dist/server/index.js')
  })

  it('has ./middleware entry point', () => {
    expect(exports['./middleware']).toBeDefined()
    expect(exports['./middleware'].default).toBe('./dist/server/middleware.js')
  })

  it('has ./integrations entry point', () => {
    expect(exports['./integrations']).toBeDefined()
    expect(exports['./integrations'].default).toBe('./dist/integrations/index.js')
  })

  it('has ./integrations/react entry point', () => {
    expect(exports['./integrations/react']).toBeDefined()
    expect(exports['./integrations/react'].default).toBe('./dist/integrations/react.js')
  })

  it('has ./integrations/mcp entry point', () => {
    expect(exports['./integrations/mcp']).toBeDefined()
  })

  it('react and next are optional peer deps', () => {
    expect(pkg.peerDependenciesMeta?.react?.optional).toBe(true)
    expect(pkg.peerDependenciesMeta?.next?.optional).toBe(true)
  })
})
