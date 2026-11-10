import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

/**
 * Human copy for manager custom errors a user can plausibly hit from the app's
 * write surfaces (resolve flow, mutual flows). Keyed by the ABI error name
 * viem decodes out of the revert data. Errors not listed here still surface
 * legibly via the `Transaction reverted: <Name>.` fallback — add copy when a
 * flow makes one reachable.
 */
const FRIENDLY_REVERTS: Record<string, string> = {
  // Lifecycle / roles
  NotCommitter: 'Only the committer wallet can perform this action.',
  NotArbiter: 'Only the arbiter wallet can perform this action.',
  CommitmentInactive: 'This commitment is already closed.',
  CommitmentNotExpired: 'The commitment has not reached its expiry yet.',
  CommitmentHasNoExpiry: 'This commitment has no expiry date.',
  // Unbond
  CommitmentInMutual:
    'This commitment is member capital in a mutual — it can’t use the normal unbond. Exit from the mutual’s page instead (a deallocation window applies).',
  UnbondAlreadyRequested: 'An unbond has already been requested for this commitment.',
  NoUnbondPending: 'There is no unbond in progress on this commitment.',
  UnbondNotElapsed: 'The unbonding period has not finished yet.',
  UnbondBlockedByForfeit: 'An active forfeit proposal blocks finalizing this unbond.',
  UnbondPending: 'A pending unbond blocks this action — cancel it first.',
  // Forfeit
  ForfeitPending: 'A forfeit proposal is already pending on this commitment.',
  NoActiveForfeitProposal: 'There is no active forfeit proposal to act on.',
  ChallengeWindowActive: 'The pause-adjusted forfeit execution delay has not elapsed yet.',
  PenaltyExceedsMax: 'The penalty exceeds this commitment’s maximum.',
  ForfeitureIsPaused: 'Forfeits are currently paused by governance.',
  // Mutual membership / exit
  NotMutualMember: 'This commitment is not a member of a mutual.',
  MutualLossPending: 'A mutual loss declaration is pending — it must resolve before exiting.',
  MemberUnsettled: 'This member has an unsettled share of a mutual loss — settle it first.',
  DeallocationWindowActive: 'The mutual’s deallocation window has not elapsed yet.',
  ExitNotRequested: 'Request an exit from the mutual first to start the deallocation window.',
  // ClaimRouter (mutual payout collection)
  NotClaimant: 'Only this mutual’s designated claimant can collect the payout.',
}

/**
 * Turn a wagmi/viem write error into a sentence a user can act on.
 *
 * Walks the viem error chain for a decoded custom revert and maps known
 * manager errors to friendly copy; falls back to the decoded error name, the
 * string-revert reason, or viem's `shortMessage` — never a raw selector dump.
 */
export function legibleWriteError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return 'Transaction rejected in your wallet.'
    }
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName
      // `Error` is the solidity string-revert wrapper — prefer its reason text.
      if (name && name !== 'Error') {
        return FRIENDLY_REVERTS[name] ?? `Transaction reverted: ${name}.`
      }
      if (revert.reason) return `Transaction reverted: ${revert.reason}`
      if (revert.signature) {
        return `Transaction reverted with unrecognized error ${revert.signature}.`
      }
    }
    return error.shortMessage
  }
  if (error instanceof Error) return error.message
  return 'Unknown error.'
}
