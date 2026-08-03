import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

import { agentIdentityRegistryAbi } from './agent-abis.ts'
import {
  commitmentManagerAbi,
  commitmentsVaultAbi,
  fanInNodeAbi,
  fanOutNodeAbi,
  flatFeeAtCreateAbi,
  linkedMutualPolicyAbi,
  meshFactoryAbi,
  mutualRegistryAbi,
  operatorRegistryAbi,
  operatorServiceRegistryAbi,
  skimmingMockStrategyAbi,
  tokenWeightingAbi,
  vaultCoverConduitAbi,
  vaultFactoryAbi,
} from './abis.ts'
import { commitmentsGovernorAbi, governorFactoryAbi } from './governance-abis.ts'

type AbiItem = {
  type: string
  name?: string
  inputs?: readonly { name: string; indexed?: boolean }[]
}

const abis: Record<string, readonly AbiItem[]> = {
  AgentIdentityRegistry: agentIdentityRegistryAbi,
  CommitmentManager: commitmentManagerAbi,
  CommitmentsGovernor: commitmentsGovernorAbi,
  CommitmentsVault: commitmentsVaultAbi,
  FanInNode: fanInNodeAbi,
  FanOutNode: fanOutNodeAbi,
  FlatFeeAtCreate: flatFeeAtCreateAbi,
  GovernorFactory: governorFactoryAbi,
  LinkedMutualPolicy: linkedMutualPolicyAbi,
  MeshFactory: meshFactoryAbi,
  MutualRegistry: mutualRegistryAbi,
  OperatorRegistry: operatorRegistryAbi,
  OperatorServiceRegistry: operatorServiceRegistryAbi,
  SkimmingStrategy: skimmingMockStrategyAbi,
  TokenWeighting: tokenWeightingAbi,
  VaultCoverConduit: vaultCoverConduitAbi,
  VaultFactory: vaultFactoryAbi,
}

const here = dirname(fileURLToPath(import.meta.url))

type HandlerBinding = {
  file: string
  line: number
  column: number
  contract: string
  name: string
}

type HandlerDiscovery = {
  files: string[]
  bindings: HandlerBinding[]
}

const excludedDirectories = new Set(['node_modules', '__fixtures__', '__tests__'])

function productionTypeScriptFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name) && !entry.name.startsWith('.')) {
        files.push(...productionTypeScriptFiles(path))
      }
      continue
    }
    if (
      entry.isFile()
      && entry.name.endsWith('.ts')
      && !entry.name.endsWith('.test.ts')
      && !entry.name.endsWith('.spec.ts')
      && !entry.name.endsWith('.d.ts')
    ) {
      files.push(path)
    }
  }
  return files
}

function discoverHandlerBindings(root: string): HandlerDiscovery {
  const files: string[] = []
  const bindings: HandlerBinding[] = []

  for (const file of productionTypeScriptFiles(root)) {
    const source = readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    let containsHandler = false

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'ponder'
        && node.expression.name.text === 'on'
      ) {
        containsHandler = true
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        const location = `${relative(root, file)}:${position.line + 1}:${position.character + 1}`
        const binding = node.arguments[0]
        assert.ok(binding && ts.isStringLiteralLike(binding), `${location}: ponder.on event must be a string literal`)
        const parsed = /^([^:]+):([^:]+)$/.exec(binding.text)
        assert.ok(parsed, `${location}: ponder.on event must have the form Contract:Event`)
        bindings.push({
          file,
          line: position.line + 1,
          column: position.character + 1,
          contract: parsed[1],
          name: parsed[2],
        })
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    if (containsHandler) files.push(file)
  }

  return { files, bindings }
}

function event(contract: string, name: string, location?: string): AbiItem {
  const item = abis[contract]?.find((candidate) => candidate.type === 'event' && candidate.name === name)
  assert.ok(item, `${location ? `${location}: ` : ''}${contract}:${name} is absent from its configured ABI`)
  return item
}

function validateHandlerBindings(root: string): HandlerDiscovery {
  const discovery = discoverHandlerBindings(root)
  assert.ok(discovery.files.length > 0, `No production Ponder handler modules discovered under ${root}`)
  for (const binding of discovery.bindings) {
    event(
      binding.contract,
      binding.name,
      `${relative(root, binding.file)}:${binding.line}:${binding.column}`,
    )
  }
  return discovery
}

function assertEventInputs(contract: string, name: string, expected: readonly string[]): void {
  assert.deepEqual(event(contract, name).inputs?.map((input) => input.name), expected)
}

function assertIndexedInputs(contract: string, name: string, expected: readonly string[]): void {
  assert.deepEqual(
    event(contract, name).inputs?.filter((input) => input.indexed).map((input) => input.name),
    expected,
  )
}

test('every registered Ponder handler event exists in its configured ABI', () => {
  validateHandlerBindings(here)
})

test('handler discovery includes nested production modules and excludes tests and non-handlers', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'abi-handler-discovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const nested = join(root, 'handlers', 'nested')
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(root, 'utility.ts'), 'export const utility = true\n')
  writeFileSync(
    join(root, 'ignored.test.ts'),
    "ponder.on('CommitmentManager:DefinitelyNotAnEvent', () => {})\n",
  )
  writeFileSync(
    join(nested, 'newHandler.ts'),
    "ponder.on('CommitmentManager:CommitmentCreated', () => {})\n",
  )

  const discovery = validateHandlerBindings(root)
  assert.deepEqual(discovery.files.map((file) => relative(root, file)), ['handlers/nested/newHandler.ts'])
  assert.deepEqual(
    discovery.bindings.map(({ contract, name }) => `${contract}:${name}`),
    ['CommitmentManager:CommitmentCreated'],
  )
})

test('an unknown event in a discovered handler fails with its source location', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'abi-handler-unknown-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const nested = join(root, 'handlers', 'nested')
  mkdirSync(nested, { recursive: true })
  writeFileSync(
    join(nested, 'unknown.ts'),
    "ponder.on('CommitmentManager:DefinitelyNotAnEvent', () => {})\n",
  )

  assert.throws(
    () => validateHandlerBindings(root),
    /handlers\/nested\/unknown\.ts:1:1: CommitmentManager:DefinitelyNotAnEvent is absent from its configured ABI/,
  )
})

test('governance decoding bindings retain the handler-consumed event fields', () => {
  assertEventInputs('GovernorFactory', 'GovernorDeployed', [
    'governor', 'timelock', 'shim', 'source', 'name',
  ])
  assertEventInputs('CommitmentsGovernor', 'ProposalCreated', [
    'proposalId', 'proposer', 'targets', 'values', 'signatures', 'calldatas',
    'voteStart', 'voteEnd', 'description',
  ])
  assertEventInputs('CommitmentsGovernor', 'VoteCastWithParams', [
    'voter', 'proposalId', 'support', 'weight', 'reason', 'params',
  ])
})

test('Mutual handlers retain the manager, registry, and policy event fields', () => {
  assertEventInputs('CommitmentManager', 'MutualCreated', [
    'mutualId', 'arbiter', 'numeraire', 'beneficiary', 'valuationAuthority',
  ])
  assertEventInputs('CommitmentManager', 'MemberJoined', [
    'mutualId', 'commitmentId', 'committer', 'creditedValue', 'forfeitableUnits',
  ])
  assertEventInputs('CommitmentManager', 'MemberSettled', [
    'mutualId', 'commitmentId', 'owedUnits', 'cumulativeLoss',
  ])
  assertEventInputs('CommitmentManager', 'MemberExitRequested', [
    'mutualId', 'commitmentId', 'slashableUntil',
  ])
  assertIndexedInputs('CommitmentManager', 'MemberSettled', ['mutualId', 'commitmentId'])
  assertIndexedInputs('CommitmentManager', 'MemberExitRequested', ['mutualId', 'commitmentId'])
  assertEventInputs('CommitmentManager', 'MutualLossExecuted', [
    'mutualId', 'appliedNumeraire', 'cumulativeLoss',
  ])
  assertEventInputs('MutualRegistry', 'MutualRegistered', [
    'mutualId', 'creator', 'beneficiary', 'numeraire', 'targetCapacity', 'termEnd',
    'perilURI', 'perilHash',
  ])
  assertEventInputs('LinkedMutualPolicy', 'CoverBound', [
    'bindingId', 'mutualId', 'policyholder', 'notional', 'expiry', 'premiumPaid',
  ])
})

test('service delegation lifecycle bindings retain consistent indexed scope fields', () => {
  assertEventInputs('OperatorRegistry', 'DelegationForfeited', [
    'staker', 'operator', 'commitmentId', 'forfeitedAmount',
  ])
  assertIndexedInputs('OperatorRegistry', 'DelegationCreated', ['staker', 'operator', 'commitmentId'])
  assertIndexedInputs('OperatorRegistry', 'DelegationReleased', ['staker', 'operator', 'commitmentId'])
  assertIndexedInputs('OperatorRegistry', 'DelegationForfeited', ['staker', 'operator', 'commitmentId'])
})

test('vault-cover and agent identity bindings retain handler-consumed event fields', () => {
  assertEventInputs('SkimmingStrategy', 'YieldSkimmed', ['newGains', 'fee'])
  assertEventInputs('SkimmingStrategy', 'OperatorFeePaid', ['operator', 'amount'])
  assertEventInputs('SkimmingStrategy', 'PremiumRouted', ['premiumRecipient', 'amount'])
  assertEventInputs('VaultCoverConduit', 'PremiumFunded', ['mutualId', 'premium', 'duration'])
  assertEventInputs('AgentIdentityRegistry', 'Registered', ['agentId', 'agentURI', 'owner'])
  assertEventInputs('AgentIdentityRegistry', 'MetadataSet', [
    'agentId', 'indexedMetadataKey', 'metadataKey', 'metadataValue',
  ])
  assertEventInputs('AgentIdentityRegistry', 'Transfer', ['from', 'to', 'tokenId'])
})
