#!/usr/bin/env node
// Generates docs/standards/generated/selectors.md from compiled ABIs and the
// standards manifest. The manifest owns grouping, including the declarations
// that remain aggregated on ICommitmentManager for compatibility.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = join(ROOT, 'docs', 'standards', 'manifest.json')
const OUTPUT_PATH = process.env.DOCS_SELECTORS_OUTPUT
  ? resolve(ROOT, process.env.DOCS_SELECTORS_OUTPUT)
  : join(ROOT, 'docs', 'standards', 'generated', 'selectors.md')
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))

const groups = [
  ...manifest.standards.map((standard) => ({
    title: `${standard.id} — ${standard.title}`,
    selectors: standard.selectors ?? [],
  })),
  ...(manifest.supplementalSelectorGroups ?? []),
]

const hashCache = new Map()
function keccak(value) {
  if (!hashCache.has(value)) {
    hashCache.set(value, execFileSync('cast', ['keccak', value], { encoding: 'utf8' }).trim())
  }
  return hashCache.get(value)
}

function canonicalType(input) {
  const tuple = /^tuple(.*)$/.exec(input.type)
  if (!tuple) return input.type
  return `(${(input.components ?? []).map(canonicalType).join(',')})${tuple[1]}`
}

const signature = (item) => `${item.name}(${(item.inputs ?? []).map(canonicalType).join(',')})`
const selector = (value) => keccak(value).slice(0, 10)
const topic0 = (value) => keccak(value)

const abiCache = new Map()
function loadAbi(name) {
  if (!abiCache.has(name)) {
    const artifact = join(ROOT, 'out', `${name}.sol`, `${name}.json`)
    abiCache.set(name, JSON.parse(readFileSync(artifact, 'utf8')).abi)
  }
  return abiCache.get(name)
}

function namesFor(spec, type) {
  return new Set(spec[`${type}s`] ?? [])
}

function reservedNames(artifact, type) {
  const names = new Set()
  for (const group of groups) {
    for (const spec of group.selectors ?? []) {
      if (spec.artifact !== artifact || spec.selection !== 'names') continue
      for (const name of namesFor(spec, type)) names.add(name)
    }
  }
  return names
}

function selectAbi(spec) {
  const abi = loadAbi(spec.artifact)
  if (spec.selection === 'all') return abi

  if (spec.selection === 'names') {
    const selected = abi.filter((item) => namesFor(spec, item.type).has(item.name))
    for (const type of ['function', 'event', 'error']) {
      const available = new Set(abi.filter((item) => item.type === type).map((item) => item.name))
      for (const name of namesFor(spec, type)) {
        if (!available.has(name)) throw new Error(`${spec.artifact}: unknown ${type} ${name} in manifest`)
      }
    }
    return selected
  }

  if (spec.selection === 'remainder') {
    return abi.filter(
      (item) =>
        !['function', 'event', 'error'].includes(item.type) ||
        !reservedNames(spec.artifact, item.type).has(item.name),
    )
  }

  throw new Error(`${spec.artifact}: unsupported selector selection ${JSON.stringify(spec.selection)}`)
}

// The aggregate manager is intentionally not decomposed in this reorganization.
// Its ABI entries must nevertheless have exactly one standards-family owner.
function validateAggregateManagerOwnership() {
  const owned = new Map()
  for (const group of groups) {
    for (const spec of group.selectors ?? []) {
      if (spec.artifact !== 'ICommitmentManager') continue
      for (const item of selectAbi(spec)) {
        if (!['function', 'event', 'error'].includes(item.type)) continue
        const key = `${item.type}:${signature(item)}`
        if (owned.has(key)) throw new Error(`${key} is owned by both ${owned.get(key)} and ${group.title}`)
        owned.set(key, group.title)
      }
    }
  }

  const expected = loadAbi('ICommitmentManager').filter((item) =>
    ['function', 'event', 'error'].includes(item.type),
  )
  const missing = expected.filter((item) => !owned.has(`${item.type}:${signature(item)}`))
  if (missing.length) {
    throw new Error(`unowned ICommitmentManager ABI entries: ${missing.map(signature).join(', ')}`)
  }
}

function interfaceId(abi) {
  const has165 = abi.some((item) => item.type === 'function' && item.name === 'supportsInterface')
  if (!has165) return null
  let value = 0
  for (const item of abi) {
    if (item.type !== 'function' || item.name === 'supportsInterface') continue
    value ^= Number.parseInt(selector(signature(item)).slice(2), 16)
  }
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`
}

function table(title, heading, rows, hash) {
  if (!rows.length) return ''
  let markdown = `#### ${title}\n\n| ${heading} | Signature |\n|---|---|\n`
  for (const value of rows) markdown += `| \`${hash(value)}\` | \`${value}\` |\n`
  return `${markdown}\n`
}

function artifactSection(spec) {
  const abi = selectAbi(spec)
  const functions = abi.filter((item) => item.type === 'function').map(signature).sort()
  const events = abi.filter((item) => item.type === 'event').map(signature).sort()
  const errors = abi.filter((item) => item.type === 'error').map(signature).sort()
  const iid = spec.selection === 'all' ? interfaceId(abi) : null

  let markdown = `### \`${spec.artifact}\`\n\n`
  if (iid) {
    markdown += `**ERC-165 interface id:** \`${iid}\` (\`type(${spec.artifact}).interfaceId\`)\n\n`
  }
  markdown += table('Function selectors', 'Selector', functions, selector)
  markdown += table('Event topic0', 'topic0', events, topic0)
  markdown += table('Error selectors', 'Selector', errors, selector)
  return markdown
}

validateAggregateManagerOwnership()

let output = `---
title: ERC-COMMITMENTS Selector and Topic0 Appendix
status: generated
generated: true
---

# ERC-COMMITMENTS — Selector & Topic0 Appendix

> **Generated file — do not edit by hand.** Produced by \`script/gen-selectors.mjs\`
> (\`just selectors\`) from the standards manifest and compiled ABIs under \`out/\`.
> Regenerate after any interface change.

This appendix pins the on-chain identifiers integrators build against: 4-byte
**function selectors**, 32-byte **event topic0** hashes, 4-byte **error
selectors**, and **ERC-165 interface ids**. Signatures are canonical (tuples
expanded, argument order as declared). Agreement and Mutual entries remain on
the aggregate \`ICommitmentManager\` ABI for compatibility, but are grouped under
the standards that specify them.

`

for (const group of groups) {
  if (!(group.selectors ?? []).length) continue
  output += `## ${group.title}\n\n`
  for (const spec of group.selectors) output += artifactSection(spec)
}

writeFileSync(OUTPUT_PATH, output)
console.error(`wrote ${OUTPUT_PATH} (${hashCache.size} unique signatures hashed)`)
