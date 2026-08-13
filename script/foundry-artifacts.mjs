import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

/** Strip Foundry's trailing compiler-profile qualifier from a contract name. */
export function baseName(name) {
  return name ? name.replace(/\.[A-Za-z0-9_-]+$/, '') : name
}

function linkedByteRanges(linkReferences) {
  return Object.values(linkReferences)
    .flatMap((contracts) => Object.values(contracts))
    .flat()
    .sort((a, b) => a.start - b.start)
}

/**
 * Match a CREATE input against Foundry artifact creation bytecode.
 *
 * Constructor arguments may follow the bytecode. Linked-library slots are
 * ignored because artifacts contain placeholders while broadcasts contain the
 * concrete library addresses inserted by forge.
 */
export function creationInputMatchesArtifact(
  creationInput,
  artifactBytecode,
  linkReferences = {},
) {
  const input = creationInput.replace(/^0x/, '').toLowerCase()
  const bytecode = artifactBytecode.replace(/^0x/, '').toLowerCase()
  if (!bytecode || bytecode.length % 2 !== 0 || input.length < bytecode.length) return false

  let cursor = 0
  for (const reference of linkedByteRanges(linkReferences)) {
    const start = reference.start * 2
    const end = start + reference.length * 2
    if (start < cursor || end > bytecode.length) return false
    if (input.slice(cursor, start) !== bytecode.slice(cursor, start)) return false
    cursor = end
  }
  return input.slice(cursor, bytecode.length) === bytecode.slice(cursor)
}

function artifactFiles(root) {
  const files = []
  const pending = [root]
  while (pending.length) {
    const dir = pending.pop()
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && entry.name.endsWith('.json')) files.push(path)
    }
  }
  return files
}

/** Load creation-bytecode matchers for the contract names a consumer needs. */
export function loadCreationMatchers(artifactDir, knownContractNames) {
  if (!existsSync(artifactDir)) return []

  const matchers = []
  const seen = new Set()
  for (const path of artifactFiles(artifactDir)) {
    const contractName = baseName(basename(path, '.json'))
    if (!knownContractNames.has(contractName)) continue

    try {
      const artifact = JSON.parse(readFileSync(path, 'utf8'))
      const bytecode = artifact.bytecode?.object
      if (!bytecode || bytecode === '0x') continue
      const signature = `${contractName}:${bytecode}`
      if (seen.has(signature)) continue
      seen.add(signature)
      matchers.push({
        contractName,
        bytecode,
        linkReferences: artifact.bytecode?.linkReferences ?? {},
      })
    } catch {
      // Ignore malformed unrelated or stale artifacts. A missing recovery is
      // safer than making the whole deployment-to-env sync fail.
    }
  }
  return matchers
}

/** Return a recovered name only when exactly one distinct contract matches. */
export function recoverContractName(creationInput, matchers) {
  if (!creationInput) return undefined
  const names = new Set(
    matchers
      .filter((matcher) =>
        creationInputMatchesArtifact(
          creationInput,
          matcher.bytecode,
          matcher.linkReferences,
        ),
      )
      .map((matcher) => matcher.contractName),
  )
  return names.size === 1 ? names.values().next().value : undefined
}
