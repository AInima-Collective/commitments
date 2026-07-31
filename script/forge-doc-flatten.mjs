#!/usr/bin/env node
// Flattens `forge doc --build` output into the public contract reference.
// Publication is an explicit declaration-level allowlist in the standards
// manifest: internal/storage/helper/self-call/vendor declarations are omitted.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const MANIFEST = JSON.parse(await readFile(join(ROOT, 'docs/standards/manifest.json'), 'utf8'))
const DEFAULT_BOOK = join(ROOT, 'docs/protocol/reference/contracts/_book/src/src')
const DEFAULT_OUT = join(ROOT, 'docs/protocol/reference/contracts')
const BOOK_SRC = process.env.FORGE_DOC_BOOK_SRC
  ? resolve(ROOT, process.env.FORGE_DOC_BOOK_SRC)
  : DEFAULT_BOOK
const OUT_DIR = process.env.FORGE_DOC_OUT ? resolve(ROOT, process.env.FORGE_DOC_OUT) : DEFAULT_OUT
const FRONTEND_BASE = '/docs/protocol/reference/contracts'
const KIND_PATTERN = /^(contract|interface|library|struct|enum|abstract)\.([A-Za-z0-9_]+)\.md$/

const normalized = (path) => path.replaceAll('\\', '/')
const declarationKey = (source, name) => `${source}:${name}`
const included = new Map()
const publicNameOwners = new Map()
for (const entry of MANIFEST.publicReference.include) {
  for (const name of entry.declarations) {
    if (publicNameOwners.has(name)) {
      throw new Error(`public declaration name ${name} appears in both ${publicNameOwners.get(name)} and ${entry.source}`)
    }
    publicNameOwners.set(name, entry.source)
    included.set(declarationKey(entry.source, name), entry)
  }
}
const publicNames = new Set(publicNameOwners.keys())

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (entry.isFile()) yield path
  }
}

function sourceFor(srcPath) {
  const parts = normalized(relative(BOOK_SRC, srcPath)).split('/')
  parts.pop()
  const solidityFile = parts.pop()
  if (!solidityFile?.endsWith('.sol')) throw new Error(`unexpected forge doc path: ${srcPath}`)
  return ['src', ...parts, solidityFile].join('/')
}

function destinationFor(srcPath, name) {
  const source = sourceFor(srcPath)
  return join(dirname(source.slice('src/'.length)), `${name}.md`)
}

function rewriteLinks(body, currentDirParts) {
  return body.replace(
    /\[([^\]]+)\]\(((?:\/|\.\.?\/)?[^)\s]+?\.sol\/(?:contract|interface|library|struct|enum|abstract)\.([A-Za-z0-9_]+)\.md(?:#[^)]*)?)\)/g,
    (_match, label, href, name) => {
      // An included page may inherit or use an intentionally private helper.
      // Keep the type name readable without producing a broken public link.
      if (!publicNames.has(name)) return `\`${label}\``

      const anchor = href.match(/#[^)]*$/)?.[0] ?? ''
      let cleaned = href.replace(/(?:#.*)?$/, '').replace(/[^/]+\.sol\/[^/]+$/, '')
      cleaned = cleaned.replace(/\/$/, '')
      if (cleaned.startsWith('/src/')) cleaned = cleaned.slice('/src/'.length)
      else if (cleaned.startsWith('src/')) cleaned = cleaned.slice('src/'.length)
      else if (cleaned.startsWith('./')) cleaned = cleaned.slice(2)
      while (cleaned.startsWith('../')) cleaned = cleaned.slice(3)
      const targetDir = cleaned ? cleaned.split('/') : currentDirParts
      const target = [FRONTEND_BASE, ...targetDir, name].join('/').replace(/\/+/g, '/')
      return `[${label}](${target}${anchor})`
    },
  )
}

function frontmatter(name, sourcePath) {
  return [
    '---',
    `title: ${name}`,
    'status: generated',
    `source: ${sourcePath}`,
    'generated: true',
    '---',
    '',
  ].join('\n')
}

async function main() {
  if (normalized(BOOK_SRC).startsWith(`${normalized(OUT_DIR)}/`)) {
    const existing = await readdir(OUT_DIR).catch(() => [])
    for (const name of existing) {
      if (name === '_book') continue
      await rm(join(OUT_DIR, name), { recursive: true, force: true })
    }
  } else {
    await rm(OUT_DIR, { recursive: true, force: true })
  }
  await mkdir(OUT_DIR, { recursive: true })

  const emitted = new Set()
  let count = 0
  for await (const srcPath of walk(BOOK_SRC)) {
    if (!srcPath.endsWith('.md')) continue
    const file = srcPath.split('/').pop()
    if (file === 'README.md' || file === 'SUMMARY.md') continue
    const match = file.match(KIND_PATTERN)
    if (!match) continue

    const [, , name] = match
    const source = sourceFor(srcPath)
    const key = declarationKey(source, name)
    if (!included.has(key)) continue

    const destRel = destinationFor(srcPath, name)
    const dest = join(OUT_DIR, destRel)
    let body = await readFile(srcPath, 'utf8')
    body = body.replace(/^\[Git Source\]\([^)]+\)\n+/m, '')
    body = rewriteLinks(body, dirname(destRel).split('/').filter(Boolean))
    body = `${body.trimEnd()}\n`

    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, frontmatter(name, source) + body)
    emitted.add(key)
    count += 1
  }

  const missing = [...included.keys()].filter((key) => !emitted.has(key)).sort()
  if (missing.length) throw new Error(`forge doc did not emit public declarations:\n${missing.join('\n')}`)

  if (normalized(BOOK_SRC).startsWith(`${normalized(OUT_DIR)}/`)) {
    await rm(join(OUT_DIR, '_book'), { recursive: true, force: true })
  }

  const written = []
  for await (const path of walk(OUT_DIR)) {
    if (!path.endsWith('.md') || path.endsWith('/_index.md')) continue
    written.push(normalized(relative(OUT_DIR, path)))
  }
  written.sort()
  const indexBody =
    '---\ntitle: Generated Contracts\nstatus: generated\ngenerated: true\n---\n\n' +
    '# Generated Contract Reference\n\n' +
    'Auto-generated from Solidity NatSpec via `just docs-gen`. Edit the contracts to update these pages.\n\n' +
    written
      .map((path) => {
        const name = path.replace(/\.md$/, '').split('/').pop()
        return `- [${name}](${FRONTEND_BASE}/${path.replace(/\.md$/, '')}) — \`${path}\``
      })
      .join('\n') +
    '\n'
  await writeFile(join(OUT_DIR, '_index.md'), indexBody)

  const relativeOut = normalized(relative(ROOT, OUT_DIR))
  const displayOut = relativeOut.startsWith('../') ? normalized(OUT_DIR) : relativeOut
  console.log(`forge-doc-flatten: wrote ${count} pages to ${displayOut}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
