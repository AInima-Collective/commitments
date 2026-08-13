import type { Address } from 'viem'

/** Canonical public route used by commitment detail and every Explorer surface. */
export function arbiterProfilePath(address: Address): string {
  return `/app/arbiters/${address}`
}

/** Canonical manager-scoped commitment route; manager disambiguates repeated ids. */
export function commitmentDetailPath(id: bigint, manager?: Address): string {
  const base = `/app/commitments/${id.toString()}`
  return manager ? `${base}?manager=${manager}` : base
}
