import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Feature folders under src/components: everything except the ui and protocol layers.
const FEATURE_DIRS = [
  'admin',
  'agent',
  'agreement',
  'arbiter',
  'backing',
  'claim',
  'commitment',
  'dashboard',
  'docs',
  'explorer',
  'governance',
  'graph',
  'landing',
  'mesh',
  'metadata',
  'mutual',
  'shell',
  'vault',
]

function importRules() {
  const src = (glob) => `src/${glob}/**/*.{ts,tsx}`
  const UI = src('components/ui')
  const PROTOCOL = src('components/protocol')
  const FEATURES = [...FEATURE_DIRS.map((d) => src(`components/${d}`)), src('pages')]

  // Feature components and pages format token amounts via the design system.
  // lib/ and components/ui/TokenAmount.tsx are outside this set.
  const formatterBan = {
    name: 'viem',
    importNames: ['formatUnits', 'formatEther'],
    message:
      'Format token amounts via <TokenAmount /> (components/ui/TokenAmount) or formatTokenAmount (lib/format). Direct viem.formatUnits/formatEther in feature pages drifts from the design system.',
  }
  // Primitives come through the barrel. `**/ui/*` also catches sibling-relative
  // paths such as '../ui/Notice' from another components folder.
  const barrelOnly = {
    group: ['**/ui/*', '!**/ui/index'],
    message:
      "Import primitives from the barrel ('components/ui') instead of deep paths. Deep imports drift the public surface — see frontend/src/components/ui/CONTRIBUTING.md.",
  }
  // A sibling-relative path ('../mesh/X' from components/protocol) never spells
  // 'components/', so also match the folder one '..' up. Anchoring on a single
  // leading '../' leaves lib/graph, lib/mesh and src/docs ('../../docs') alone.
  const layerImports = (d) => [`**/components/${d}/**`, `../${d}`, `../${d}/**`]
  const featureImports = FEATURE_DIRS.flatMap(layerImports)
  const uiLayer = {
    group: [...layerImports('protocol'), ...featureImports],
    message:
      'components/ui/** is the primitive layer — it must not depend on protocol-aware or feature-folder components.',
  }
  const protocolLayer = {
    group: featureImports,
    message: 'components/protocol/** depends down the stack only — feature-folder imports invert layering.',
  }

  const rule = (options) => ({ 'no-restricted-imports': ['error', options] })
  return [
    { files: [UI], rules: rule({ patterns: [uiLayer] }) },
    { files: [PROTOCOL], rules: rule({ patterns: [protocolLayer, barrelOnly] }) },
    { files: FEATURES, rules: rule({ paths: [formatterBan], patterns: [barrelOnly] }) },
    {
      files: ['src/**/*.{ts,tsx}'],
      ignores: [UI, PROTOCOL, ...FEATURES],
      rules: rule({ patterns: [barrelOnly] }),
    },
  ]
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // Phase 28 (LCK-01) — `_`-prefixed identifiers are intentional placeholders
  // (unused arg in a callback signature, intentionally-unused destructured
  // value, planned-future variable). Standard TS convention. Adding the
  // ignore patterns here lets us keep the recommended `no-unused-vars` rule
  // active without forcing per-file disables on legitimate `_name` markers.
  // ───────────────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // Import rules, at 'error'. Flat config does not merge a rule's options
  // across blocks — the last matching block wins — so each file set below gets
  // exactly one `no-restricted-imports` carrying every restriction that
  // applies to it. The sets are disjoint.
  //
  //   ui/**        layering (no protocol or feature imports)
  //   protocol/**  layering (no feature imports) + barrel-only ui imports
  //   features,
  //   pages/**     viem formatter ban + barrel-only ui imports
  //   rest of src  barrel-only ui imports
  // ───────────────────────────────────────────────────────────────────────
  ...importRules(),

  // ───────────────────────────────────────────────────────────────────────
  // Phase 22 (Foundation) — FND-05 lint guardrails at 'warn'.
  // LCK-01 promotes these from 'warn' to 'error' once every page is migrated.
  // Until then, violations are visible without blocking PRs.
  // ───────────────────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────
  // Phase 28 (LCK-01) — Lock-in 2026-04-28: Phase 22 'warn' rules promoted
  // to 'error'. Test fixtures under `**/__tests__/**` legitimately use hex
  // literals to assert that `var(--*)` resolves to specific known colors via
  // `getComputedStyle()`. That is the OUTPUT of the palette resolver, not
  // the INPUT to a render path, so it does not violate the design system —
  // and we exempt the test trees from the rule rather than disable per-file.
  // ───────────────────────────────────────────────────────────────────────

  // Rule 3 (error) — Hex color literals are not permitted outside src/styles/tokens.css.
  // Catches both bare string literals (e.g. '#ff0000') and hex inside template strings.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message:
            "Hex color literals are not permitted outside src/styles/tokens.css. Reference a token via var(--*) or use a primitive that does. Locked in Phase 28 (LCK-01).",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
          message:
            "Hex color literals (including inside template strings) are not permitted outside src/styles/tokens.css. Reference a token via var(--*). Locked in Phase 28 (LCK-01).",
        },
      ],
    },
  },
])
