import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { baseName, loadDeployments } from './loadDeployments.ts'

// Foundry qualifies a CREATE's `contractName` with the active compiler profile
// whenever a contract has artifacts under more than one profile. `baseName`
// strips that trailing `.<profile>` segment so the name matches the resolution
// maps. Regression coverage: the `manager-size` profile (which keeps
// CommitmentManager under EIP-170) contains a HYPHEN, and an earlier strip
// regex only allowed `[A-Za-z0-9_]` — so `OperatorRegistry.manager-size` and
// `ERC1967Proxy.manager-size` failed to strip, dropping the registry out of
// resolution and resolving every proxied singleton to its impl address.

test('baseName leaves an unqualified contract name untouched', () => {
  assert.equal(baseName('OperatorRegistry'), 'OperatorRegistry')
  assert.equal(baseName('ERC1967Proxy'), 'ERC1967Proxy')
})

test('baseName strips a simple profile qualifier', () => {
  assert.equal(baseName('ERC1967Proxy.default'), 'ERC1967Proxy')
  assert.equal(baseName('MockERC20.size'), 'MockERC20')
})

test('baseName strips a hyphenated profile qualifier (manager-size)', () => {
  assert.equal(baseName('OperatorRegistry.manager-size'), 'OperatorRegistry')
  assert.equal(baseName('ERC1967Proxy.manager-size'), 'ERC1967Proxy')
  assert.equal(baseName('CommitmentManager.manager-size'), 'CommitmentManager')
})

// The DEPLOYMENTS_JSON override path must carry the ERC-8004 agent identity
// registries (issue #33): pass-through when present, [] when absent — never
// undefined, since ponder.config.ts binds the contract unconditionally and
// hands the array straight to Ponder.
test('loadDeployments override defaults agentIdentityRegistries to [] and passes it through', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployments-'))
  const base = {
    commitmentManagers: ['0x0000000000000000000000000000000000000001'],
    operatorRegistries: ['0x0000000000000000000000000000000000000002'],
    vaultFactory: '0x0000000000000000000000000000000000000003',
    stakeRegistry: '0x0000000000000000000000000000000000000004',
    meshFactory: '0x0000000000000000000000000000000000000005',
  }
  const prev = process.env.DEPLOYMENTS_JSON
  try {
    const withoutPath = join(dir, 'without.json')
    writeFileSync(withoutPath, JSON.stringify(base))
    process.env.DEPLOYMENTS_JSON = withoutPath
    assert.deepEqual(loadDeployments(31337).agentIdentityRegistries, [])

    const withPath = join(dir, 'with.json')
    const agentRegistry = '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432'
    writeFileSync(withPath, JSON.stringify({ ...base, agentIdentityRegistries: [agentRegistry] }))
    process.env.DEPLOYMENTS_JSON = withPath
    assert.deepEqual(loadDeployments(31337).agentIdentityRegistries, [agentRegistry])
  } finally {
    if (prev === undefined) delete process.env.DEPLOYMENTS_JSON
    else process.env.DEPLOYMENTS_JSON = prev
  }
})
