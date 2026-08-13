import assert from 'node:assert/strict'
import test from 'node:test'

import {
  creationInputMatchesArtifact,
  recoverContractName,
} from './foundry-artifacts.mjs'

test('matches creation bytecode followed by constructor arguments', () => {
  assert.equal(creationInputMatchesArtifact('0x60016002deadbeef', '0x60016002'), true)
  assert.equal(creationInputMatchesArtifact('0x60016003deadbeef', '0x60016002'), false)
})

test('ignores linked-library address ranges', () => {
  const linkReferences = {
    'src/Math.sol': { Math: [{ start: 2, length: 2 }] },
  }
  assert.equal(
    creationInputMatchesArtifact('0x6001abcd6002', '0x600100006002', linkReferences),
    true,
  )
})

test('recovers only an unambiguous contract name', () => {
  const input = '0x60016002'
  const shared = { bytecode: input, linkReferences: {} }
  assert.equal(recoverContractName(input, [{ contractName: 'Adapter', ...shared }]), 'Adapter')
  assert.equal(
    recoverContractName(input, [
      { contractName: 'Adapter', ...shared },
      { contractName: 'Registry', ...shared },
    ]),
    undefined,
  )
})
