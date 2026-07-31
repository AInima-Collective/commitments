/**
 * Deployment-environment selector — the single source of truth for "which chain
 * is this indexer pointed at?".
 *
 * Tri-state: LOCAL (anvil 31337) | SEPOLIA (11155111) | PROD (Ethereum mainnet 1),
 * driven by the `DEPLOY_ENV` env var. `ponder.config.ts`, the mutual handlers,
 * and the Hono API endpoints all read these constants so the chain key / id is
 * never re-derived (and never drifts) per module.
 */
export const DEPLOY_ENV = (process.env.DEPLOY_ENV ?? 'LOCAL').toUpperCase()
export const IS_PROD = DEPLOY_ENV === 'PROD'
export const IS_SEPOLIA = DEPLOY_ENV === 'SEPOLIA'

/**
 * Ponder chain key — MUST match a key in the `chains` map of `ponder.config.ts`,
 * because `publicClients[CHAIN_NAME]` is how the API endpoints resolve the
 * per-chain RPC client for live `readContract` calls.
 */
export const CHAIN_NAME = IS_PROD ? 'mainnet' : IS_SEPOLIA ? 'sepolia' : 'local'

/** Numeric EVM chain id for the active env (used to locate broadcast artifacts). */
export const CHAIN_ID = IS_PROD ? 1 : IS_SEPOLIA ? 11155111 : 31337
