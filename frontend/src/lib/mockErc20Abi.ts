/**
 * MockERC20.mint (test/helpers/MockERC20.sol): a permissionless, anvil-only
 * faucet the dev and admin flows use to top up an actor before a deposit or
 * donate. Simulate.s.sol seeds only enough to deposit once.
 */
export const MOCK_ERC20_MINT_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const
