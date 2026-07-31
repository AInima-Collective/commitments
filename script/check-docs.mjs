#!/usr/bin/env node
// Deterministic documentation integrity check. This validates the standards
// manifest, page lifecycle metadata, local Markdown links, literal Solidity
// paths, and generated-reference publication policy.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(ROOT, 'docs')
const MANIFEST_PATH = join(DOCS, 'standards', 'manifest.json')
const CONTRACT_REFERENCE = join(DOCS, 'protocol', 'reference', 'contracts')
const errors = []

const normalized = (path) => path.replaceAll('\\', '/')
const repositoryPath = (path) => normalized(relative(ROOT, path))

function walk(dir, predicate = () => true) {
  if (!existsSync(dir)) return []
  const paths = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) paths.push(...walk(path, predicate))
    else if (entry.isFile() && predicate(path)) paths.push(path)
  }
  return paths.sort()
}

function frontmatter(body) {
  if (!body.startsWith('---\n')) return null
  const end = body.indexOf('\n---\n', 4)
  if (end === -1) return null
  const values = {}
  for (const line of body.slice(4, end).split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!match) continue
    values[match[1]] = match[2].trim().replace(/^(?:"(.*)"|'(.*)')$/, '$1$2')
  }
  return values
}

function existingTarget(base) {
  const candidates = [base]
  if (!extname(base)) candidates.push(`${base}.md`, join(base, 'README.md'), join(base, '_index.md'))
  return candidates.find((candidate) => existsSync(candidate))
}

function localLinkTarget(sourceFile, href) {
  const withoutFragment = href.split('#')[0].split('?')[0]
  if (!withoutFragment) return null
  let decoded
  try {
    decoded = decodeURIComponent(withoutFragment)
  } catch {
    return { error: `invalid URL encoding in ${href}` }
  }

  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(decoded)) return null
  if (decoded.startsWith('/docs/')) return { path: join(ROOT, decoded.slice(1)) }
  if (decoded.startsWith('/')) return null
  return { path: resolve(dirname(sourceFile), decoded) }
}

function checkPage(file) {
  const path = repositoryPath(file)
  if (path.includes('/_book/')) return
  const body = readFileSync(file, 'utf8')
  const metadata = frontmatter(body)
  if (!metadata) {
    errors.push(`${path}: missing frontmatter`)
    return
  }

  const status = metadata.status
  if (!['current', 'draft', 'generated'].includes(status)) {
    errors.push(`${path}: status must be current, draft, or generated (found ${JSON.stringify(status)})`)
  }

  if (status === 'draft' && !path.startsWith('docs/design/') && !path.startsWith('docs/standards/')) {
    errors.push(`${path}: draft pages belong under docs/design/ or docs/standards/`)
  }
  if (status === 'generated' && metadata.generated !== 'true') {
    errors.push(`${path}: generated pages must declare generated: true`)
  }
  if (metadata.generated === 'true' && status !== 'generated') {
    errors.push(`${path}: generated: true requires status: generated`)
  }

  const generatedContract = path.startsWith('docs/protocol/reference/contracts/') && path !== 'docs/protocol/reference/contracts/_index.md'
  if (generatedContract) {
    if (status !== 'generated' || metadata.generated !== 'true') {
      errors.push(`${path}: contract reference pages must be generated`)
    }
    if (!metadata.source?.startsWith('src/') || !existsSync(join(ROOT, metadata.source))) {
      errors.push(`${path}: source must resolve to a final src/... file (found ${JSON.stringify(metadata.source)})`)
    }
  }

  const prose = body.replace(/^```[\s\S]*?^```\s*$/gm, '')
  const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
  for (const match of prose.matchAll(linkPattern)) {
    const target = localLinkTarget(file, match[1])
    if (!target) continue
    if (target.error) errors.push(`${path}: ${target.error}`)
    else if (!existingTarget(target.path)) errors.push(`${path}: broken local link ${match[1]}`)
  }

  if (status === 'current' || status === 'generated') {
    const literalPathPattern = /\b(?:src|test)\/[A-Za-z0-9_./-]+\.sol\b/g
    for (const match of new Set(body.match(literalPathPattern) ?? [])) {
      if (!existsSync(join(ROOT, match))) errors.push(`${path}: unresolved repository path ${match}`)
    }
  }
}

function topLevelDeclarations(source) {
  let body = readFileSync(source, 'utf8')
  body = body
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""')

  const declarations = []
  let depth = 0
  for (const line of body.split('\n')) {
    if (depth === 0) {
      const match = /^\s*(?:abstract\s+)?(contract|interface|library|struct|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line)
      if (match) declarations.push(match[2])
    }
    depth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length
  }
  return declarations
}

function checkManifest() {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  } catch (error) {
    errors.push(`docs/standards/manifest.json: invalid JSON (${error.message})`)
    return
  }
  if (manifest.schemaVersion !== 1) errors.push('docs/standards/manifest.json: schemaVersion must be 1')

  const ids = new Set()
  for (const standard of manifest.standards ?? []) {
    if (!standard.id || ids.has(standard.id)) errors.push(`manifest: duplicate or missing standard id ${standard.id}`)
    if (standard.id && !/^ERC-COMMITMENTS(?:-[A-Z]+)?$/.test(standard.id)) {
      errors.push(`manifest: invalid standard id ${standard.id}`)
    }
    ids.add(standard.id)
  }
  for (const standard of manifest.standards ?? []) {
    if (!['current', 'draft'].includes(standard.status)) {
      errors.push(`manifest ${standard.id}: status must be current or draft`)
    }
    for (const field of ['spec', 'interfaces', 'implementations', 'conformanceTests']) {
      const values = Array.isArray(standard[field]) ? standard[field] : [standard[field]].filter(Boolean)
      if (!values.length) errors.push(`manifest ${standard.id}: ${field} must not be empty`)
      for (const target of values) {
        if (!existsSync(join(ROOT, target))) errors.push(`manifest ${standard.id}: missing ${field} target ${target}`)
      }
    }
    if (existsSync(join(ROOT, standard.spec))) {
      const metadata = frontmatter(readFileSync(join(ROOT, standard.spec), 'utf8'))
      if (metadata?.status !== standard.status) {
        errors.push(`manifest ${standard.id}: spec status ${JSON.stringify(metadata?.status)} does not match ${standard.status}`)
      }
    }
    const dependencyIds = new Set()
    for (const dependency of standard.dependencies ?? []) {
      if (!dependency?.id || dependencyIds.has(dependency.id)) {
        errors.push(`manifest ${standard.id}: duplicate or missing dependency id ${dependency?.id}`)
      }
      dependencyIds.add(dependency?.id)
      if (dependency?.id === standard.id) errors.push(`manifest ${standard.id}: standard cannot depend on itself`)
      if (dependency.external && !/^(?:EIP|ERC)-[1-9][0-9]*$/.test(dependency.id)) {
        errors.push(`manifest ${standard.id}: invalid external dependency id ${dependency.id}`)
      }
      if (!dependency.external && !ids.has(dependency.id)) {
        errors.push(`manifest ${standard.id}: unknown internal dependency ${dependency.id}`)
      }
    }
  }

  const byId = new Map((manifest.standards ?? []).map((standard) => [standard.id, standard]))
  const visiting = new Set()
  const visited = new Set()
  function visit(id, trail = []) {
    if (visiting.has(id)) {
      errors.push(`manifest: internal dependency cycle ${[...trail, id].join(' -> ')}`)
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of byId.get(id)?.dependencies ?? []) {
      if (!dependency.external && byId.has(dependency.id)) visit(dependency.id, [...trail, id])
    }
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of ids) visit(id)

  const classified = new Map()
  const publicNameOwners = new Map()
  const classify = (entry, disposition) => {
    const source = join(ROOT, entry.source)
    if (!existsSync(source)) errors.push(`manifest publicReference.${disposition}: missing source ${entry.source}`)
    const actual = existsSync(source) ? new Set(topLevelDeclarations(source)) : new Set()
    if (disposition === 'exclude' && !entry.reason) {
      errors.push(`manifest publicReference.exclude: ${entry.source} needs a reason`)
    }
    for (const name of entry.declarations ?? []) {
      const key = `${entry.source}:${name}`
      if (classified.has(key)) errors.push(`manifest publicReference: ${key} classified more than once`)
      classified.set(key, disposition)
      if (disposition === 'include') {
        if (publicNameOwners.has(name)) {
          errors.push(`manifest publicReference.include: duplicate public name ${name} in ${publicNameOwners.get(name)} and ${entry.source}`)
        }
        publicNameOwners.set(name, entry.source)
      }
      if (!actual.has(name)) errors.push(`manifest publicReference.${disposition}: ${key} is not a top-level declaration`)
    }
  }
  for (const entry of manifest.publicReference?.include ?? []) classify(entry, 'include')
  for (const entry of manifest.publicReference?.exclude ?? []) classify(entry, 'exclude')

  for (const source of walk(join(ROOT, 'src'), (path) => path.endsWith('.sol'))) {
    const sourcePath = repositoryPath(source)
    for (const name of topLevelDeclarations(source)) {
      const key = `${sourcePath}:${name}`
      if (!classified.has(key)) errors.push(`manifest publicReference: unclassified declaration ${key}`)
    }
  }

  const expectedPages = new Set(['_index.md'])
  const generatedPages = walk(
    CONTRACT_REFERENCE,
    (path) => path.endsWith('.md') && !path.includes('/_book/'),
  )
  if (!generatedPages.some((path) => repositoryPath(path).endsWith('/_index.md'))) {
    errors.push('generated contract reference is partial: _index.md is missing')
  }
  for (const entry of manifest.publicReference?.include ?? []) {
    for (const name of entry.declarations ?? []) {
      const relativeSource = entry.source.slice('src/'.length)
      const page = normalized(join(dirname(relativeSource), `${name}.md`))
      expectedPages.add(page)
      const pagePath = join(CONTRACT_REFERENCE, page)
      if (!existsSync(pagePath)) {
        errors.push(`generated reference missing for ${entry.source}:${name} (${page})`)
      }
      else {
        if (existsSync(pagePath)) {
          const metadata = frontmatter(readFileSync(pagePath, 'utf8'))
          if (metadata?.source !== entry.source) {
            errors.push(`${repositoryPath(pagePath)}: source ${JSON.stringify(metadata?.source)} must equal ${entry.source}`)
          }
        }
      }
    }
  }
  for (const pagePath of generatedPages) {
    const page = normalized(relative(CONTRACT_REFERENCE, pagePath))
    if (!expectedPages.has(page)) errors.push(`generated reference is not public in manifest: ${page}`)
  }
}

for (const file of walk(DOCS, (path) => path.endsWith('.md'))) checkPage(file)
checkManifest()

const vocabulary = spawnSync(process.execPath, [join(ROOT, 'script', 'check-guide-vocab.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
})
if (vocabulary.status !== 0) {
  errors.push(`guide vocabulary check failed:\n${(vocabulary.stderr || vocabulary.stdout).trim()}`)
}

if (errors.length) {
  console.error(`documentation validation failed (${errors.length}):`)
  for (const error of [...new Set(errors)].sort()) console.error(`- ${error}`)
  process.exit(1)
}

const pageCount = walk(DOCS, (path) => path.endsWith('.md') && !path.includes('/_book/')).length
console.log(`documentation validation passed (${pageCount} pages, ${manifestSummary()})`)

function manifestSummary() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const publicCount = (manifest.publicReference?.include ?? []).reduce(
    (total, entry) => total + entry.declarations.length,
    0,
  )
  return `${manifest.standards.length} standards, ${publicCount} public declarations`
}
