#!/usr/bin/env node
// Drift-guard for the persona guides in docs/protocol/guides/.
//
// These guides drifted badly once before: they documented an earlier API shape
// (positional createCommitment args, percent penalties, a yield-share field that
// no longer exists, a zero-challenge-window "instant payout" the manager rejects,
// a vault-level withdrawal queue). This check fails CI if any of that retired
// vocabulary reappears, so a future edit can't silently reintroduce it.
//
// It is a vocabulary guard, not a compiler: the fences are snippets that lean on
// ambient bindings (`manager`, structs, addresses) and don't build standalone.
// Matching the exact tokens that changed is the honest, low-false-positive check.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const GUIDES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'protocol', 'guides')

// token → why it's wrong / what to use instead
const BANNED = {
  maxPenaltyPct: 'penalties are basis points — use maxPenaltyBps (0..10000)',
  penaltyPct: 'forfeit penalties are basis points — use penaltyBps',
  yieldShareBps: 'no such field — value flows go through bound distribution strategies',
  pendingYieldIncentive: 'removed — query pending(id, strategy, claimData)',
  requestWithdraw: 'the vault has instant ERC-4626 exits; committer capital uses requestUnbond',
  claimWithdrawal: 'the vault has instant ERC-4626 exits; committer capital uses finalizeUnbond',
  getWithdrawalRequest: 'no vault withdrawal queue — unbonding is per-commitment on the manager',
  freeShares: 'ledger lives on the manager — use freeBalance(token, user)',
  encumberedShares: 'ledger lives on the manager — use encumberedBalance(token, user)',
  '.depositor': 'the commitment party field is committer, not depositor',
  'setStrategy(': 'the vault setter is setYieldStrategy(...)',
  getUserMagnitude: 'renamed — use getUserExposure(token, user)',
  MagnitudeAllocationExceeded: 'renamed — the error is ExposureAllocationExceeded',
}

const files = readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.md'))
const violations = []

for (const file of files) {
  const lines = readFileSync(join(GUIDES_DIR, file), 'utf-8').split('\n')
  lines.forEach((line, i) => {
    for (const [token, reason] of Object.entries(BANNED)) {
      if (line.includes(token)) {
        violations.push(`  docs/protocol/guides/${file}:${i + 1}  "${token}" — ${reason}`)
      }
    }
  })
}

if (violations.length > 0) {
  console.error(`✗ Retired API vocabulary found in persona guides (${violations.length}):\n`)
  console.error(violations.join('\n'))
  console.error('\nThe persona guides must track the shipping API. Fix the above or update this guard.')
  process.exit(1)
}

console.log(`✓ Persona guides clean (${files.length} files, ${Object.keys(BANNED).length} retired tokens checked)`)
