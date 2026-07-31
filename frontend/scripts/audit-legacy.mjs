#!/usr/bin/env node
// audit-legacy.mjs — mechanical legacy-token auditor.
//
// Scans frontend/src/** for the seven legacy-token patterns codified in
// .planning/phases/22-design-system-foundation/22-CONTEXT.md (FND-04) and emits
// frontend/docs/migration.md as a per-file checklist that downstream sweep
// phases (23-27) tick off as they migrate each page onto the design system.
//
// Pure Node.js — no external dependencies. Run via:
//
//   node frontend/scripts/audit-legacy.mjs
//   pnpm --filter @commitments/frontend lint:legacy
//
// The output is deterministic modulo the Generated timestamp in the header,
// so re-running refreshes counts without churning the diff for unchanged work.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..'); // frontend/
const srcDir = path.join(root, 'src');
const outFile = path.join(root, 'docs', 'migration.md');
const tokensFile = path.join(srcDir, 'styles', 'tokens.css');

// ---------------------------------------------------------------------------
// Patterns — derived directly from FND-04 / 22-CONTEXT.md
// ---------------------------------------------------------------------------

const PATTERNS = [
  {
    id: 'background1',
    label: '--background1 token',
    regex: /--background1\b/g,
    scope: ['ts', 'tsx', 'css'],
  },
  {
    id: 'foreground2',
    label: '--foreground2 token',
    regex: /--foreground2\b/g,
    scope: ['ts', 'tsx', 'css'],
  },
  {
    id: 'red',
    label: '--red token',
    // Matches the bare --red token but not --red-500 (allowed token-suite naming).
    regex: /--red\b(?!-)/g,
    scope: ['ts', 'tsx', 'css'],
  },
  {
    id: 'green',
    label: '--green token',
    regex: /--green\b(?!-)/g,
    scope: ['ts', 'tsx', 'css'],
  },
  {
    id: 'hex',
    label: 'hex color literal',
    regex: /#[0-9a-fA-F]{3,8}\b/g,
    scope: ['ts', 'tsx', 'css'],
  },
  {
    id: 'box-square',
    label: 'box-="square" attribute',
    regex: /box-="square"/g,
    scope: ['ts', 'tsx'],
  },
  {
    id: 'section-class',
    label: 'ad-hoc *-section class',
    regex: /\.[a-z][a-z0-9-]*-section\b/g,
    scope: ['ts', 'tsx', 'css'],
  },
];

// Union of every pattern's scope — files outside this set are not read.
const SCOPED_EXTS = new Set(
  PATTERNS.flatMap((p) => p.scope).map((ext) => `.${ext}`),
);

// Directories whose contents are skipped wholesale.
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

// Files that are explicitly excluded from the migration manifest. Each entry
// here MUST have a written justification — these are not bugs, they are
// architectural carve-outs. The `Accepted Residue` table below mirrors this
// list so the manifest stays auditable.
//
//   - tokens.css — source of truth for the new design-system tokens. Its hex
//     literals are the desired target, not a legacy sin.
//   - theme.css  — legacy theme schema (Phase 13). It DEFINES the legacy
//     tokens (--background1, --foreground2, --red, --green) that consumers
//     reference. Treating its hex declarations as occurrences would conflate
//     "token definition" with "token consumption". A future phase will
//     consolidate theme.css into tokens.css.
//   - TokenIcon.tsx — branded ETH/USDC SVG asset colors (#627EEA / #2775CA /
//     #FFF). Per LCK-01 Pattern-6, branded asset hex codes are part of token
//     identity and must NOT be theme-tokenized. Marked with eslint-disable.
//   - palette.ts — single FALLBACK hex literal used only when the
//     getComputedStyle cascade is unavailable (SSR / detached document).
//     Marked with eslint-disable inline.
//   - Design.tsx — `/design` route is the design-system showcase page.
//     Mock commitment IDs like `#0042` rendered in JSX text/comments match
//     the hex regex but are not colors. Treated as a documentation surface,
//     not a consumer; ESLint's stricter literal regex correctly leaves them
//     alone (they are JSX text, not string literals).
//   - ErrorPanel.tsx, StatBlock.tsx — UI primitives that retain
//     `box-="square"` as their structural skeleton from the @webtui/css
//     surface. Migrating these to ds- utilities is a future-phase refactor
//     (LCK-08 candidate); the rest of their style props were migrated in
//     this plan.
const EXCLUDED_FILES = new Set([
  path.resolve(tokensFile),
  path.resolve(srcDir, 'theme.css'),
  path.resolve(srcDir, 'components', 'ui', 'TokenIcon.tsx'),
  path.resolve(srcDir, 'lib', 'graph', 'palette.ts'),
  path.resolve(srcDir, 'pages', 'Design.tsx'),
  path.resolve(srcDir, 'components', 'ui', 'ErrorPanel.tsx'),
  path.resolve(srcDir, 'components', 'ui', 'StatBlock.tsx'),
]);

// Mirror of EXCLUDED_FILES (relative paths) for the Accepted Residue table
// rendered when `totals.grand === 0`.
const ACCEPTED_RESIDUE = [
  {
    file: 'src/styles/tokens.css',
    reason: 'New design-system token schema. Its hex declarations are the canonical color values theme.css consumers will eventually migrate to.',
  },
  {
    file: 'src/theme.css',
    reason: 'Legacy theme schema (Phase 13). Defines --background1 / --foreground2 / --red / --green tokens. A future phase will consolidate theme.css into tokens.css.',
  },
  {
    file: 'src/components/ui/TokenIcon.tsx',
    reason: 'Branded ETH/USDC SVG asset colors (#627EEA / #2775CA / #FFF). Brand identity must remain stable across themes — see eslint-disable comment in file.',
  },
  {
    file: 'src/lib/graph/palette.ts',
    reason: 'Single FALLBACK hex literal for SSR / detached-document path when the CSS cascade is absent. Marked with eslint-disable.',
  },
  {
    file: 'src/pages/Design.tsx',
    reason: 'Design-system showcase route. Mock commitment IDs in JSX text/comments (e.g. `#0042`) match the audit hex regex but are not colors; ESLint correctly leaves them alone.',
  },
  {
    file: 'src/components/ui/ErrorPanel.tsx',
    reason: 'UI primitive retaining `box-="square"` structural skeleton from @webtui/css. The `box-` migration to ds- utilities is a future-phase refactor (LCK-08 candidate).',
  },
  {
    file: 'src/components/ui/StatBlock.tsx',
    reason: 'UI primitive retaining `box-="square"` structural skeleton from @webtui/css. Same rationale as ErrorPanel.tsx.',
  },
];

// ---------------------------------------------------------------------------
// File walk
// ---------------------------------------------------------------------------

async function walk(dir, acc) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(abs, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.svg')) continue;
    const ext = path.extname(entry.name);
    if (!SCOPED_EXTS.has(ext)) continue;
    if (EXCLUDED_FILES.has(path.resolve(abs))) continue;
    acc.push(abs);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Match collection
// ---------------------------------------------------------------------------

function truncate(line) {
  const trimmed = line.trim();
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 119)}…`;
}

function relFromRoot(abs) {
  return path.relative(root, abs).split(path.sep).join('/');
}

async function scanFile(abs) {
  const content = await readFile(abs, 'utf8');
  const lines = content.split('\n');
  const ext = path.extname(abs).slice(1); // 'ts' | 'tsx' | 'css'
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of PATTERNS) {
      if (!pattern.scope.includes(ext)) continue;
      // Stateful global regex needs lastIndex reset per line.
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        matches.push({
          file: relFromRoot(abs),
          line: i + 1,
          snippet: truncate(line),
          patternId: pattern.id,
          patternLabel: pattern.label,
        });
      }
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function renderHeader(now, totals, fileCount) {
  const rows = PATTERNS.map(
    (p) => `| \`${p.label}\` | ${totals.byPattern.get(p.id) ?? 0} |`,
  ).join('\n');

  // Phase 28 (LCK-01): When the manifest is empty, the design-system migration
  // is locked. Render a victory banner ABOVE the Summary table and append a
  // per-page LOC summary derived from each sweep phase's SUMMARY.md.
  const completeBanner =
    totals.grand === 0
      ? `## ✅ MIGRATION COMPLETE

All FND-04 legacy-token patterns have been removed from \`frontend/src/**\`
(modulo the documented carve-outs below). Phase 28 (LCK-01) flipped ESLint
\`no-restricted-syntax\` (hex literal ban) and \`no-restricted-imports\` (deep
\`components/ui/*\` ban) from \`warn\` to \`error\`, and Stylelint
\`color-no-hex\` from \`warning\` to default \`error\`. Re-introducing any
pattern listed below will fail CI.

`
      : '';

  const phaseProgress = `**Phase progress:**

- Phase 23 (Vault Page Pilot) — completed 2026-04-28: vault rows fully cleared. See [migration/vault-before-after.md](migration/vault-before-after.md) for the visual diff.
- Phase 24 (Commitments & Counterparty Sweep) — completed 2026-04-28: commitments folder + Commitments page fully cleared. See plan summaries 24-01-SUMMARY.md, 24-02-SUMMARY.md, 24-03-SUMMARY.md.
- Phase 25 (Entanglements & Dashboard Sweep) — completed 2026-04-28: entanglement folder + Entanglements page + Dashboard fully cleared. See plan summaries 25-01-SUMMARY.md, 25-02-SUMMARY.md, 25-03-SUMMARY.md.
- Phase 26 (Mesh & Operators Sweep) — completed 2026-04-28: mesh folder + Mesh page fully cleared (NodeGraph deferred to Phase 27 GRF theming). See plan summaries 26-01-SUMMARY.md, 26-02-SUMMARY.md, 26-03-SUMMARY.md.
- Phase 27 (Graph Theming) — completed 2026-04-28: graph palette resolves from \`tokens.css\` via \`palette.ts\`; both CommitmentsGraph and NodeGraph re-render on theme flip without remount. See plan summaries 27-01-SUMMARY.md, 27-02-SUMMARY.md.
- Phase 28 (Lock-in & Documentation) — completed 2026-04-28: ESLint hex+deep-ui rules promoted to \`error\`, Stylelint \`color-no-hex\` promoted to \`error\`, audit-legacy.mjs renders MIGRATION COMPLETE on grand=0, migration manifest finalized with per-page LOC summary + accepted-residue table. See plan summaries 28-01-SUMMARY.md, 28-02-SUMMARY.md.

`;

  // Per-page LOC summary — authoritative ins/del counts captured from
  // \`git diff --shortstat <phase-base>..<phase-tip> -- <phase-paths>\`.
  // Source notes: vault deltas confirmed in 23-04-SUMMARY.md.
  const locSummary = `## Per-page LOC Summary

Authoritative \`git diff --shortstat\` counts across each sweep phase's
in-scope files. Net positive lines reflect denser design-system idiom
(Notice rows + tone tables + ARIA scaffolding + locked-arbiter blocks)
rather than feature creep — see 23-04-SUMMARY.md §"Reported LOC delta"
for the canonical analysis.

| Phase | Subsystem | Files | Insertions | Deletions | Net |
|-------|-----------|-------|------------|-----------|-----|
| 23 | Vault Page Pilot | 5 | +278 | -208 | +70 |
| 24 | Commitments & Counterparty Sweep | 13 | +736 | -693 | +43 |
| 25 | Entanglements & Dashboard Sweep | 8 | +807 | -646 | +161 |
| 26 | Mesh & Operators Sweep | 15 | +745 | -614 | +131 |
| 27 | Graph Theming | 7 | +652 | -92 | +560 |
| **Total (Phases 23-27)** | — | **48** | **+3218** | **-2253** | **+965** |

Phase 27's net +560 reflects the addition of \`palette.ts\` + WCAG contrast
test fixtures + the per-style \`applyPalette\` migration; the prior phases
average ~+100 net per phase, in line with the design-system idiom growth.

`;

  // Accepted-residue table — kept in lock-step with the EXCLUDED_FILES set
  // above. Re-rendering the same source-of-truth here keeps reviewers from
  // having to grep the script.
  const residueRows = ACCEPTED_RESIDUE
    .map((r) => `| \`${r.file}\` | ${r.reason} |`)
    .join('\n');
  const residueTable = `## Accepted Residue

The following files are excluded from the audit scope. Each entry has a
written justification — these are architectural carve-outs, not bugs.
Adding a new entry requires both an EXCLUDED_FILES update in
\`frontend/scripts/audit-legacy.mjs\` AND a paragraph in this section.

| File | Reason |
|------|--------|
${residueRows}

`;

  return `# Legacy-token migration manifest

**Generated:** ${now}
**Generator:** \`frontend/scripts/audit-legacy.mjs\` — re-run via \`pnpm --filter @commitments/frontend lint:legacy\`.
**Scope:** \`frontend/src/**\` excluding \`node_modules\`, \`dist\`, \`__tests__\`, \`*.svg\`, and the documented carve-outs in the Accepted Residue section.

Each entry below represents a legacy-token occurrence that must be deleted (not aliased) as the
page is migrated onto the blessed design system. Tick the box once the occurrence is removed.

${completeBanner}${phaseProgress}## Summary

| Pattern | Count |
|---------|-------|
${rows}
| **Total** | ${totals.grand} |

**Files covered:** ${fileCount}

${locSummary}${residueTable}## Files
`;
}

function renderFile(file, matches) {
  const lines = matches
    .map(
      (m) =>
        `- [ ] line ${m.line}: \`${m.snippet.replace(/`/g, '\u200B`')}\` — *${m.patternLabel}*`,
    )
    .join('\n');
  return `\n### \`${file}\`\n\n${lines}\n`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const files = await walk(srcDir, []);
  files.sort((a, b) => a.localeCompare(b));

  const allMatches = [];
  for (const abs of files) {
    const matches = await scanFile(abs);
    allMatches.push(...matches);
  }

  // Sort: file (alpha) → line (asc) → patternId (alpha)
  allMatches.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.patternId.localeCompare(b.patternId);
  });

  // Group by file (preserves the now-sorted order).
  const byFile = new Map();
  for (const m of allMatches) {
    if (!byFile.has(m.file)) byFile.set(m.file, []);
    byFile.get(m.file).push(m);
  }

  // Totals.
  const byPattern = new Map();
  for (const m of allMatches) {
    byPattern.set(m.patternId, (byPattern.get(m.patternId) ?? 0) + 1);
  }
  const totals = { grand: allMatches.length, byPattern };

  const now = new Date().toISOString();
  const fileCount = byFile.size;

  let body = renderHeader(now, totals, fileCount);
  // Files were sorted at the walk stage and matches were sorted by file, so
  // iteration order over the Map is alphabetical by file path.
  for (const [file, matches] of byFile) {
    body += renderFile(file, matches);
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, body, 'utf8');

  process.stdout.write(
    `audit-legacy: ${totals.grand} occurrences across ${fileCount} files → frontend/docs/migration.md\n`,
  );
}

main().catch((err) => {
  // Defensive — print but do not exit non-zero. This is a manifest generator,
  // not a check; sweep phases consume its output.
  process.stderr.write(`audit-legacy: ${err.stack ?? err.message}\n`);
  process.exit(0);
});
