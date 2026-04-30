#!/bin/bash
# LEA-126 regression smoke: confirm @leash/sdk/server is importable in a
# project that does NOT have `next` (or `react`) installed.
#
# Background: 0.3.2's dist/server/index.js had a static
# `export ... from './middleware.js'` line, and middleware.js does
# `import { NextResponse } from 'next/server'`. In a non-Next consumer
# (Express, Hono, plain Node) the static import resolves at module-load
# time and crashes the runtime before any user code runs. 0.3.3 fixed it
# by slimming server/index.js to only re-export auth.js.
#
# This script reproduces the failure mode by packing the current build,
# installing it into an empty project with zero other deps, and trying to
# import @leash/sdk/server. Run from the repo root via `npm run smoke:non-next`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d -t leash-sdk-smoke-XXXXXX)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "→ Packing SDK from $REPO_ROOT"
TARBALL="$(cd "$TMP_DIR" && npm pack "$REPO_ROOT" 2>&1 | tail -1)"

echo "→ Setting up empty consumer project at $TMP_DIR"
cd "$TMP_DIR"
cat > package.json <<EOF
{
  "name": "leash-sdk-smoke-consumer",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
EOF

echo "→ Installing local tarball into consumer (no other deps; no next, no react)"
npm install --no-audit --no-fund "./$TARBALL" 2>&1 | tail -3

echo "→ Importing @leash/sdk/server"
OUTPUT="$(node --input-type=module -e "
import('@leash/sdk/server').then(m => {
  const expected = ['getLeashUser', 'isAuthenticated']
  const missing = expected.filter(k => typeof m[k] !== 'function')
  if (missing.length > 0) {
    console.error('FAIL: missing exports:', missing.join(', '))
    process.exit(1)
  }
  console.log('OK: server entry imported with', Object.keys(m).join(', '))
}).catch(err => {
  console.error('FAIL: import threw:', err.message)
  process.exit(1)
})
" 2>&1)"
echo "$OUTPUT"

if echo "$OUTPUT" | grep -q '^FAIL'; then
  exit 1
fi

echo "→ Smoke passed."
