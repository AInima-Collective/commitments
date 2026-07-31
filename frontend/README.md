# @commitments/frontend

The dapp for the **Commitments Protocol** — a Vite + React 19 + wagmi v3 + viem
single-page app for funding the CommitmentManager, creating and resolving
commitments (release, two-phase forfeit, unbond), running bilateral agreements,
operating arbiters and the mesh/registry/governance layers, and browsing the
yield-bearing vault.

It is part of the monorepo pnpm workspace (`frontend/` + `indexer/`). Install
from the repo root with `pnpm install`; the indexer and Foundry contracts live
alongside it.

## Commands

```bash
pnpm dev        # wagmi generate + vite dev server
pnpm build      # wagmi generate + tsc -b + vite build
pnpm generate   # regenerate src/generated.ts from contract ABIs (wagmi codegen)
pnpm lint       # eslint
pnpm lint:css   # stylelint on src/**/*.css
pnpm test       # vitest
```

`pnpm dev` reads contract addresses from `.env.local`, which the repo's
`just dev-up` / `script/write-frontend-env.mjs` writes from the freshly-deployed
broadcast artifacts. TypeScript runs in `strict` mode (`tsc -b`).

## Architecture

The UI is built on a strict three-layer component architecture (enforced by
ESLint `no-restricted-imports`; a higher layer may import a lower one, never the
reverse):

```
src/components/
  ui/        primitives with NO protocol knowledge (Button, Modal, TokenAmount, …)
  protocol/  knows protocol vocabulary, not a specific page (StatusBadge, EncumbranceBar, …)
  <feature>/ page-shaped feature compositions (vault/, commitment/, agreement/, mesh/, …)
  shell/     RootLayout, Sidebar, TopBar, WalletWidget
```

- **`/design` is the source of truth for the UI vocabulary** — every `ui/`
  primitive must appear there. See `src/pages/Design.tsx` and
  `components/ui/CONTRIBUTING.md` for the six composition rules.
- **Design tokens** live once in `src/styles/tokens.css` (warm-mono, single
  accent, `--radius: 0`). Hex literals outside that file are an ESLint error;
  component CSS may only reference `var(--…)`.
- **Hooks** (`src/hooks/*`) wrap wagmi reads/writes for protocol concepts
  (`useCommitments`, `useAgreements`, `useVaultPosition`, …). Reach for these
  before adding a new fetch.
- **`src/generated.ts`** is wagmi codegen output — never hand-edit it; rerun
  `forge build` then `pnpm generate` after changing contract ABIs.
- **Docs viewer** at `/app/docs/*` renders current standards, protocol guides,
  and the `forge doc` contract reference via react-markdown + Shiki + Mermaid.

The long-form composition rules and rationale live in
`src/components/ui/CONTRIBUTING.md`.
