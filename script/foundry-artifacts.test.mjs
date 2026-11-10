import assert from 'node:assert/strict'
import test from 'node:test'

import {
  baseName,
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

// Foundry qualifies a CREATE's `contractName` with the compiler profile when a
// contract has artifacts under more than one profile. Profile names can contain
// a hyphen (`manager-size`); an earlier strip regex missed that and resolved
// every proxied singleton to its implementation.
test('baseName strips a plain or hyphenated profile qualifier', () => {
  assert.equal(baseName('OperatorRegistry'), 'OperatorRegistry')
  assert.equal(baseName('ERC1967Proxy.default'), 'ERC1967Proxy')
  assert.equal(baseName('OperatorRegistry.manager-size'), 'OperatorRegistry')
  assert.equal(baseName(null), null)
})
