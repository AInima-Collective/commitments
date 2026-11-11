// Handler event names and argument fields are checked by `tsc` through Ponder's
// typed `ponder.on`. Which inputs are indexed is not visible in those types, so
// the topic layouts the indexer's queries rely on are pinned here.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { commitmentManagerAbi, operatorRegistryAbi } from './abis.ts'

type AbiItem = {
  type: string
  name?: string
  inputs?: readonly { name: string; indexed?: boolean }[]
}

function assertIndexedInputs(abi: readonly AbiItem[], name: string, expected: readonly string[]): void {
  const item = abi.find((candidate) => candidate.type === 'event' && candidate.name === name)
  assert.ok(item, `${name} is absent from its ABI`)
  assert.deepEqual(
    item.inputs?.filter((input) => input.indexed).map((input) => input.name),
    expected,
  )
}

test('mutual member events index the mutual and the commitment', () => {
  assertIndexedInputs(commitmentManagerAbi, 'MemberSettled', ['mutualId', 'commitmentId'])
  assertIndexedInputs(commitmentManagerAbi, 'MemberExitRequested', ['mutualId', 'commitmentId'])
})

test('service delegation lifecycle events index the same scope fields', () => {
  for (const name of ['DelegationCreated', 'DelegationReleased', 'DelegationForfeited']) {
    assertIndexedInputs(operatorRegistryAbi, name, ['staker', 'operator', 'commitmentId'])
  }
})
