import type { ConfiguredArbiterMechanism } from '../config/arbiters'

export interface MechanismTerm {
  label: string
  value: string
}

export interface MechanismAdapterDefinition {
  id: ConfiguredArbiterMechanism
  name: string
  verification: 'trusted deployment configuration'
  process: string
  noCase: string
  caseIdentity: 'none' | 'claim' | 'mutual-loss' | 'attestation' | 'court-case'
  staticTerms: MechanismTerm[]
}

/**
 * Trusted mechanism recognition. Capability bits never participate in this
 * lookup: they describe manager authority, not how a decision is produced.
 */
export const MECHANISM_ADAPTERS: Record<ConfiguredArbiterMechanism, MechanismAdapterDefinition> = {
  direct: {
    id: 'direct',
    name: 'Direct-address arbitration',
    verification: 'trusted deployment configuration',
    process: 'The named address decides off chain and sends authorized manager transactions directly.',
    noCase: 'No generic on-chain case or contest action exists. Follow the address owner’s published policy, if any.',
    caseIdentity: 'none',
    staticTerms: [],
  },
  manual: {
    id: 'manual',
    name: 'Owner-controlled manual arbitration',
    verification: 'trusted deployment configuration',
    process: 'The contract owner reviews evidence under its published policy and dispatches manager actions.',
    noCase: 'No generic on-chain case is open. Follow the publisher-provided policy; the manager execution delay is not an appeal method.',
    caseIdentity: 'none',
    staticTerms: [{ label: 'controller model', value: 'Contract owner (EOA, multisig, or timelock)' }],
  },
  'optimistic-insurance': {
    id: 'optimistic-insurance',
    name: 'Optimistic bonded insurance claim',
    verification: 'trusted deployment configuration',
    process: 'Anyone may open a bonded claim. Counter-assertions require a larger bond and reset the answer deadline; the top assertion finalizes after timeout.',
    noCase: 'No claim is open. Anyone may propose a bonded claim against this commitment; a different asserter may dispute it before the answer deadline.',
    caseIdentity: 'claim',
    staticTerms: [
      { label: 'participants', value: 'Any proposer and any non-latest asserter' },
      { label: 'resolution', value: 'Top-of-stack assertion after the optimistic timeout' },
    ],
  },
  'optimistic-mutual': {
    id: 'optimistic-mutual',
    name: 'Optimistic mutual-loss declaration',
    verification: 'trusted deployment configuration',
    process: 'A bonded loss declaration waits through the mutual’s contest window and may be vetoed by the configured controller.',
    noCase: 'No commitment-scoped case exists for this adapter. Mutual-loss cases are keyed by mutual id and appear on the coverage and global Cases surfaces.',
    caseIdentity: 'mutual-loss',
    staticTerms: [{ label: 'scope', value: 'Mutual id, not commitment id' }],
  },
  attestation: {
    id: 'attestation',
    name: 'Operator-service attestation',
    verification: 'trusted deployment configuration',
    process: 'An ordered action envelope is executed only after the configured operator-service quorum signs it. Anyone may relay a valid envelope.',
    noCase: 'No envelope action is pending on chain. Contest evidence under the operator service’s signing policy before quorum signs; there is no generic appeal call.',
    caseIdentity: 'attestation',
    staticTerms: [
      { label: 'participants', value: 'Service operators sign; any address may relay' },
      { label: 'replay protection', value: 'Per-target ordering plus consumed envelope id' },
    ],
  },
  'two-tier': {
    id: 'two-tier',
    name: 'Two-tier arbitration and appeal',
    verification: 'trusted deployment configuration',
    process: 'The primary controller proposes a ruling. The committer or counterparty may appeal once, after which the appeal controller has final authority.',
    noCase: 'No court case is open. A primary ruling must be opened before either party can appeal.',
    caseIdentity: 'court-case',
    staticTerms: [
      { label: 'appeal rights', value: 'Committer or counterparty' },
      { label: 'appeal count', value: 'One escalation per ruling' },
    ],
  },
}

export function mechanismAdapter(
  id: ConfiguredArbiterMechanism | undefined,
): MechanismAdapterDefinition | undefined {
  return id ? MECHANISM_ADAPTERS[id] : undefined
}
