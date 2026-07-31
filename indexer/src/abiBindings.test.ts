import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

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
const handlerFiles = ['agents.ts', 'governance.ts', 'index.ts', 'mutual.ts', 'vaultCover.ts']

function event(contract: string, name: string): AbiItem {
  const item = abis[contract]?.find((candidate) => candidate.type === 'event' && candidate.name === name)
  assert.ok(item, `${contract}:${name} is absent from its configured ABI`)
  return item
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
  let checked = 0
  for (const file of handlerFiles) {
    const source = readFileSync(resolve(here, file), 'utf8')
    for (const match of source.matchAll(/ponder\.on\('([^:']+):([^']+)'/g)) {
      event(match[1], match[2])
      checked += 1
    }
  }
  assert.equal(checked, 95)
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
