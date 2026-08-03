import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourceRoot = path.join(root, 'src')

// Raw generic scales are permitted only at their canonical definitions. LAMBDA_ONE is
// deliberately separate: its name carries the mutual-loss invariant's domain meaning even
// though its numeric representation is one WAD. Every entry includes its rationale so an
// exception cannot be added without documenting why the shared generic unit is inappropriate.
const allowlist = [
  {
    file: 'src/shared/Constants.sol',
    token: '10_000',
    code: 'uint256 constant BPS_DENOMINATOR = 10_000;',
    reason: 'canonical generic basis-point denominator',
  },
  {
    file: 'src/shared/Constants.sol',
    token: '1e18',
    code: 'uint256 constant WAD = 1e18;',
    reason: 'canonical generic 18-decimal fixed-point unit',
  },
  {
    file: 'src/extensions/mutuals/MutualLib.sol',
    token: '1e18',
    code: 'uint256 internal constant LAMBDA_ONE = 1e18;',
    reason: 'domain-specific fully-attributed mutual-loss index',
  },
]

function solidityFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) return solidityFiles(absolute)
    return entry.isFile() && entry.name.endsWith('.sol') ? [absolute] : []
  })
}

function stripCommentsAndStrings(source) {
  let output = ''
  let state = 'code'

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    const next = source[i + 1]

    if (state === 'code') {
      if (char === '/' && next === '/') {
        output += '  '
        i += 1
        state = 'line-comment'
      } else if (char === '/' && next === '*') {
        output += '  '
        i += 1
        state = 'block-comment'
      } else if (char === '"' || char === "'") {
        output += ' '
        state = char === '"' ? 'double-string' : 'single-string'
      } else {
        output += char
      }
      continue
    }

    if (state === 'line-comment') {
      if (char === '\n') {
        output += '\n'
        state = 'code'
      } else {
        output += ' '
      }
      continue
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output += '  '
        i += 1
        state = 'code'
      } else {
        output += char === '\n' ? '\n' : ' '
      }
      continue
    }

    const quote = state === 'double-string' ? '"' : "'"
    if (char === '\\') {
      output += ' '
      if (i + 1 < source.length) {
        output += source[i + 1] === '\n' ? '\n' : ' '
        i += 1
      }
    } else if (char === quote) {
      output += ' '
      state = 'code'
    } else {
      output += char === '\n' ? '\n' : ' '
    }
  }

  return output
}

const targetScaleValues = new Set([10_000n, 1_000_000_000_000_000_000n])
const numericPattern =
  /(?<![A-Za-z0-9_])(?:0[xX][0-9a-fA-F][0-9a-fA-F_]*|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?)(?![A-Za-z0-9_])/g
const integerPowerPattern = /(?<![A-Za-z0-9_])(\d[\d_]*)\s*\*\*\s*(\d[\d_]*)(?![A-Za-z0-9_])/g

function numericValue(raw) {
  const normalized = raw.replaceAll('_', '').toLowerCase()
  if (normalized.startsWith('0x')) return BigInt(normalized)

  const match = normalized.match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/)
  if (!match) return null

  const fraction = match[2] ?? ''
  const digits = BigInt(`${match[1]}${fraction}`)
  const exponent = BigInt(match[3] ?? 0) - BigInt(fraction.length)

  // Both guarded units fit within 19 decimal digits. Larger positive powers cannot match;
  // this cap also prevents an accidental giant exponent from making the check expensive.
  if (exponent > 18n || exponent < -64n) return null
  if (exponent >= 0) return digits * 10n ** exponent

  const divisor = 10n ** -exponent
  return digits % divisor === 0n ? digits / divisor : null
}

function rawScaleMatches(line) {
  const matches = []

  for (const match of line.matchAll(numericPattern)) {
    const value = numericValue(match[0])
    if (value !== null && targetScaleValues.has(value)) matches.push(match)
  }

  // Normalize literal exponentiation too, so forms such as `10 ** 4`, `10**18`,
  // or underscore-separated integer operands cannot bypass the numeric-literal scan.
  for (const match of line.matchAll(integerPowerPattern)) {
    const base = BigInt(match[1].replaceAll('_', ''))
    const exponent = BigInt(match[2].replaceAll('_', ''))
    if (exponent <= 64n && targetScaleValues.has(base ** exponent)) matches.push(match)
  }

  return matches.sort((a, b) => a.index - b.index)
}

const guardedExamples = [
  '10_000',
  '1e4',
  '0x2710',
  '1_000_000_000_000_000_000',
  '1000000000000000000',
  '1E18',
  '0x0de0b6b3a7640000',
  '10 ** 4',
  '10**18',
]
for (const example of guardedExamples) {
  if (rawScaleMatches(example).length === 0) {
    throw new Error(`unit constants guard does not recognize fixture: ${example}`)
  }
}

const seenAllowlist = new Set()
const unexpected = []

for (const absolute of solidityFiles(sourceRoot).sort()) {
  const relative = path.relative(root, absolute).split(path.sep).join('/')
  const originalLines = fs.readFileSync(absolute, 'utf8').split('\n')
  const executableLines = stripCommentsAndStrings(fs.readFileSync(absolute, 'utf8')).split('\n')

  executableLines.forEach((line, index) => {
    for (const match of rawScaleMatches(line)) {
      const token = match[0]
      const allowedIndex = allowlist.findIndex(
        (entry) => entry.file === relative && entry.token === token && originalLines[index].trim() === entry.code,
      )
      if (allowedIndex >= 0) {
        seenAllowlist.add(allowedIndex)
      } else {
        unexpected.push(`${relative}:${index + 1}: unexpected executable scale ${token}`)
      }
    }
  })
}

const stale = allowlist
  .map((entry, index) => ({ entry, index }))
  .filter(({ index }) => !seenAllowlist.has(index))
  .map(({ entry }) => `${entry.file}: stale allowlist entry (${entry.reason}): ${entry.code}`)

if (unexpected.length > 0 || stale.length > 0) {
  console.error([...unexpected, ...stale].join('\n'))
  process.exit(1)
}

console.log(
  `unit constants validation passed (${solidityFiles(sourceRoot).length} Solidity files, ${allowlist.length} documented raw-scale definitions)`,
)
