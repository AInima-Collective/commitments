import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEPLOYMENT_MANIFEST_SCHEMA_VERSION,
  loadDeployments,
  parseDeploymentManifest,
} from './loadDeployments.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, '../fixtures/deployments.v1.example.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>

function fixtureCopy(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>
}

function withDeploymentsJson<T>(path: string, fn: () => T): T {
  const previous = process.env.DEPLOYMENTS_JSON
  process.env.DEPLOYMENTS_JSON = path
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.DEPLOYMENTS_JSON
    else process.env.DEPLOYMENTS_JSON = previous
  }
}

test('the checked-in v1 fixture is accepted by the runtime loader', () => {
  const deployments = withDeploymentsJson(fixturePath, () => loadDeployments(31337))
  assert.deepEqual(deployments, fixture)
  assert.equal(deployments.schemaVersion, DEPLOYMENT_MANIFEST_SCHEMA_VERSION)
  assert.equal(deployments.chainId, 31337)
})

test('optional address arrays default to empty', () => {
  const manifest = fixtureCopy()
  delete manifest.flatFeeStrategies
  delete manifest.agentIdentityRegistries
  delete manifest.optimisticInsuranceArbiters
  delete manifest.twoTierArbiters
  delete manifest.attestationArbiters

  const deployments = parseDeploymentManifest(manifest, 31337)
  assert.deepEqual(deployments.flatFeeStrategies, [])
  assert.deepEqual(deployments.agentIdentityRegistries, [])
  assert.deepEqual(deployments.optimisticInsuranceArbiters, [])
  assert.deepEqual(deployments.twoTierArbiters, [])
  assert.deepEqual(deployments.attestationArbiters, [])
})

test('optional addresses and address arrays pass through', () => {
  const manifest = fixtureCopy()
  Object.assign(manifest, {
    governorFactory: '0x0000000000000000000000000000000000000011',
    mutualRegistry: '0x0000000000000000000000000000000000000012',
    optimisticMutualArbiter: '0x0000000000000000000000000000000000000013',
    linkedMutualPolicy: '0x0000000000000000000000000000000000000014',
    skimmingStrategy: '0x0000000000000000000000000000000000000015',
    vaultCoverConduit: '0x0000000000000000000000000000000000000016',
    flatFeeStrategies: ['0x0000000000000000000000000000000000000017'],
    agentIdentityRegistries: ['0x8004a169fb4a3325136eb29fa0ceb6d2e539a432'],
    optimisticInsuranceArbiters: ['0x0000000000000000000000000000000000000018'],
    twoTierArbiters: ['0x0000000000000000000000000000000000000019'],
    attestationArbiters: ['0x0000000000000000000000000000000000000020'],
  })

  const deployments = parseDeploymentManifest(manifest, 31337)
  assert.deepEqual(deployments.flatFeeStrategies, manifest.flatFeeStrategies)
  assert.deepEqual(deployments.agentIdentityRegistries, manifest.agentIdentityRegistries)
  assert.deepEqual(deployments.twoTierArbiters, manifest.twoTierArbiters)
  assert.equal(deployments.governorFactory, manifest.governorFactory)
  assert.equal(deployments.vaultCoverConduit, manifest.vaultCoverConduit)
})

test('the v1 parser rejects malformed structure, identities, blocks, and addresses', async (t) => {
  const cases: Array<{
    name: string
    change: (manifest: Record<string, unknown>) => void
    expected: RegExp
  }> = [
    {
      name: 'missing schema version',
      change: (manifest) => { delete manifest.schemaVersion },
      expected: /schemaVersion must be 1/,
    },
    {
      name: 'unsupported schema version',
      change: (manifest) => { manifest.schemaVersion = 2 },
      expected: /schemaVersion must be 1/,
    },
    {
      name: 'missing chain id',
      change: (manifest) => { delete manifest.chainId },
      expected: /chainId must be a positive safe integer/,
    },
    {
      name: 'non-integer chain id',
      change: (manifest) => { manifest.chainId = 31337.5 },
      expected: /chainId must be a positive safe integer/,
    },
    {
      name: 'wrong chain id',
      change: (manifest) => { manifest.chainId = 1 },
      expected: /chainId 1 does not match the expected chain 31337/,
    },
    {
      name: 'missing start block',
      change: (manifest) => { delete manifest.startBlock },
      expected: /startBlock must be a non-negative safe integer/,
    },
    {
      name: 'negative start block',
      change: (manifest) => { manifest.startBlock = -1 },
      expected: /startBlock must be a non-negative safe integer/,
    },
    {
      name: 'fractional start block',
      change: (manifest) => { manifest.startBlock = 1.5 },
      expected: /startBlock must be a non-negative safe integer/,
    },
    {
      name: 'string start block',
      change: (manifest) => { manifest.startBlock = '0' },
      expected: /startBlock must be a non-negative safe integer/,
    },
    {
      name: 'missing required address',
      change: (manifest) => { delete manifest.vaultFactory },
      expected: /vaultFactory must be a non-zero EVM address/,
    },
    {
      name: 'malformed required address',
      change: (manifest) => { manifest.stakeRegistry = '0x1234' },
      expected: /stakeRegistry must be a non-zero EVM address/,
    },
    {
      name: 'zero required address',
      change: (manifest) => { manifest.meshFactory = '0x0000000000000000000000000000000000000000' },
      expected: /meshFactory must be a non-zero EVM address/,
    },
    {
      name: 'missing required address collection',
      change: (manifest) => { delete manifest.commitmentManagers },
      expected: /commitmentManagers must be an array of EVM addresses/,
    },
    {
      name: 'required address collection is not an array',
      change: (manifest) => { manifest.commitmentManagers = '0x0000000000000000000000000000000000000001' },
      expected: /commitmentManagers must be an array of EVM addresses/,
    },
    {
      name: 'required address collection is empty',
      change: (manifest) => { manifest.operatorRegistries = [] },
      expected: /operatorRegistries must contain at least one address/,
    },
    {
      name: 'malformed address collection member',
      change: (manifest) => { manifest.commitmentManagers = ['not-an-address'] },
      expected: /commitmentManagers\[0\] must be a non-zero EVM address/,
    },
    {
      name: 'optional address is malformed',
      change: (manifest) => { manifest.governorFactory = 'not-an-address' },
      expected: /governorFactory must be a non-zero EVM address/,
    },
    {
      name: 'optional address collection is not an array',
      change: (manifest) => { manifest.flatFeeStrategies = 'not-an-array' },
      expected: /flatFeeStrategies must be an array of EVM addresses/,
    },
    {
      name: 'optional address collection is malformed',
      change: (manifest) => { manifest.agentIdentityRegistries = [7] },
      expected: /agentIdentityRegistries\[0\] must be a non-zero EVM address/,
    },
    {
      name: 'unknown field',
      change: (manifest) => { manifest.vaultFacotry = manifest.vaultFactory },
      expected: /unknown field "vaultFacotry"/,
    },
    {
      name: 'legacy singular manager field',
      change: (manifest) => { manifest.commitmentManager = manifest.commitmentManagers },
      expected: /legacy field "commitmentManager" is not supported in schema v1/,
    },
    {
      name: 'legacy singular registry field',
      change: (manifest) => { manifest.operatorRegistry = manifest.operatorRegistries },
      expected: /legacy field "operatorRegistry" is not supported in schema v1/,
    },
    {
      name: 'legacy vault instance field',
      change: (manifest) => { manifest.commitmentsVault = manifest.vaultFactory },
      expected: /legacy field "commitmentsVault" is not supported in schema v1/,
    },
  ]

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const manifest = fixtureCopy()
      entry.change(manifest)
      assert.throws(() => parseDeploymentManifest(manifest, 31337), entry.expected)
    })
  }

  await t.test('top-level array', () => {
    assert.throws(
      () => parseDeploymentManifest([], 31337),
      /top-level value must be a JSON object/,
    )
  })
})

test('a configured missing or unreadable manifest path fails', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'deployments-path-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const missing = join(dir, 'missing.json')
  assert.throws(
    () => withDeploymentsJson(missing, () => loadDeployments(31337)),
    (error: unknown) => {
      assert.match(String(error), new RegExp(`Failed to read DEPLOYMENTS_JSON at ${missing}`))
      return true
    },
  )

  const directoryPath = join(dir, 'not-a-file')
  mkdirSync(directoryPath)
  assert.throws(
    () => withDeploymentsJson(directoryPath, () => loadDeployments(31337)),
    /Failed to read DEPLOYMENTS_JSON/,
  )
})

test('configured malformed JSON and invalid manifests report their source path', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'deployments-invalid-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const malformedPath = join(dir, 'malformed.json')
  writeFileSync(malformedPath, '{')
  assert.throws(
    () => withDeploymentsJson(malformedPath, () => loadDeployments(31337)),
    new RegExp(`Failed to parse DEPLOYMENTS_JSON at ${malformedPath}`),
  )

  const invalidPath = join(dir, 'invalid.json')
  writeFileSync(invalidPath, JSON.stringify({ ...fixture, startBlock: -1 }))
  assert.throws(
    () => withDeploymentsJson(invalidPath, () => loadDeployments(31337)),
    new RegExp(`DEPLOYMENTS_JSON at ${invalidPath} is invalid: .*startBlock`),
  )
})

test('an explicitly empty DEPLOYMENTS_JSON value is rejected', () => {
  assert.throws(
    () => withDeploymentsJson('', () => loadDeployments(31337)),
    /DEPLOYMENTS_JSON is set but empty/,
  )
})

test('without DEPLOYMENTS_JSON, a missing generated manifest says to run just dev-up', () => {
  const previous = process.env.DEPLOYMENTS_JSON
  delete process.env.DEPLOYMENTS_JSON
  try {
    assert.throws(() => loadDeployments(424242), /deployments\.424242\.json\. Run `just dev-up`/)
  } finally {
    if (previous !== undefined) process.env.DEPLOYMENTS_JSON = previous
  }
})
