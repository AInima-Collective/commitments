#!/usr/bin/env node
// Dump governance contract ABIs from forge artifacts into the indexer.
// Sandbox-safe alternative to wagmi-generate (which fails in this container
// due to esbuild platform mismatch — see feedback_sandbox_wagmi_generate).
//
// Usage: node scripts/dump-governance-abis.mjs
//        Run from the commitments/ root after `forge build`.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const contracts = [
  'GovernorFactory',
  'CommitmentsGovernor',
  'CommitmentsTimelock',
  'TokenWeightingVotesShim',
]

const lines = [
  '// Auto-generated from foundry artifacts. Re-run scripts/dump-governance-abis.mjs to refresh.',
  '',
]

for (const name of contracts) {
  const artifact = JSON.parse(
    readFileSync(join(repoRoot, 'out', `${name}.sol`, `${name}.json`), 'utf-8'),
  )
  const camel = name.charAt(0).toLowerCase() + name.slice(1) + 'Abi'
  lines.push(`export const ${camel} = ${JSON.stringify(artifact.abi, null, 2)} as const;`)
  lines.push('')
}

writeFileSync(join(repoRoot, 'indexer', 'src', 'governance-abis.ts'), lines.join('\n'))
console.log('wrote indexer/src/governance-abis.ts')

writeFileSync(join(repoRoot, 'frontend', 'src', 'abi', 'governance.ts'), lines.join('\n'))
console.log('wrote frontend/src/abi/governance.ts')
