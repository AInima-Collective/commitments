import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

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
  // Design-system Phase 5 (Lock): rules promoted to 'error' as of 2026-04-27.
  // Per frontend/docs/design-system.md §5 and §11. The 4 pre-existing mesh-hook
  // tsc errors were also fixed as part of Phase 5 — see commits in
  // 260427-rcc-SUMMARY.md.
  // ───────────────────────────────────────────────────────────────────────

  // Rule 1 — feature pages must format token amounts via the design system,
  // not by reaching for viem's raw formatters. Scoped to feature components
  // and pages; lib/, components/ui/TokenAmount.tsx, and tests are exempt.
  {
    files: [
      'src/components/vault/**/*.{ts,tsx}',
      'src/components/commitment/**/*.{ts,tsx}',
      'src/components/commitments/**/*.{ts,tsx}',
      'src/components/entanglement/**/*.{ts,tsx}',
      'src/components/entanglements/**/*.{ts,tsx}',
      'src/components/mesh/**/*.{ts,tsx}',
      'src/components/metadata/**/*.{ts,tsx}',
      'src/components/graph/**/*.{ts,tsx}',
      'src/pages/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'viem',
            importNames: ['formatUnits', 'formatEther'],
            message:
              "Format token amounts via <TokenAmount /> (components/ui/TokenAmount) or formatTokenAmount (lib/format). Direct viem.formatUnits/formatEther in feature pages drifts from the design system. Promoted from 'warn' to 'error' in Phase 5 (Lock).",
          },
        ],
      }],
    },
  },

  // Rule 2 — layering. Lower layers must not depend on higher layers.
  //   - components/ui/** (primitives): no protocol or feature imports.
  //   - components/protocol/** (domain): no feature-folder imports.
  // Pages/feature folders are unrestricted — they're the top of the graph.
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '**/components/protocol/**',
              '**/components/vault/**',
              '**/components/commitment/**',
              '**/components/commitments/**',
              '**/components/entanglement/**',
              '**/components/entanglements/**',
              '**/components/mesh/**',
              '**/components/metadata/**',
              '**/components/graph/**',
              '**/components/syndicate/**',
            ],
            message:
              "components/ui/** is the primitive layer — it must not depend on protocol-aware or feature-folder components. Promoted from 'warn' to 'error' in Phase 5 (Lock).",
          },
        ],
      }],
    },
  },
  {
    files: ['src/components/protocol/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '**/components/vault/**',
              '**/components/commitment/**',
              '**/components/commitments/**',
              '**/components/entanglement/**',
              '**/components/entanglements/**',
              '**/components/mesh/**',
              '**/components/metadata/**',
              '**/components/graph/**',
              '**/components/syndicate/**',
            ],
            message:
              "components/protocol/** depends down the stack only — feature-folder imports invert layering. Promoted from 'warn' to 'error' in Phase 5 (Lock).",
          },
        ],
      }],
    },
  },

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

  // Rule 4 (error) — Deep imports of components/ui/<Primitive> are forbidden;
  // consumers must go through the barrel ('@/components/ui' or '../components/ui').
  // The components/ui/** folder itself is exempt — siblings legitimately import each other.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '**/components/ui/*',
              '!**/components/ui',
              '!**/components/ui/index',
            ],
            message:
              "Import primitives from the barrel ('components/ui') instead of deep paths. Deep imports drift the public surface — see frontend/src/components/ui/CONTRIBUTING.md. Locked in Phase 28 (LCK-01).",
          },
        ],
      }],
    },
  },
])
