import {
  createUseReadContract,
  createUseWriteContract,
  createUseSimulateContract,
  createUseWatchContractEvent,
} from 'wagmi/codegen'

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AttestationArbiter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const attestationArbiterAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'manager_', internalType: 'address', type: 'address' },
      { name: 'serviceManager_', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'envelope',
        internalType: 'struct IServiceHandler.Envelope',
        type: 'tuple',
        components: [
          { name: 'eventId', internalType: 'bytes20', type: 'bytes20' },
          { name: 'ordering', internalType: 'bytes12', type: 'bytes12' },
          { name: 'payload', internalType: 'bytes', type: 'bytes' },
        ],
      },
      {
        name: 'signatureData',
        internalType: 'struct IServiceHandler.SignatureData',
        type: 'tuple',
        components: [
          { name: 'signers', internalType: 'address[]', type: 'address[]' },
          { name: 'signatures', internalType: 'bytes[]', type: 'bytes[]' },
          { name: 'referenceBlock', internalType: 'uint32', type: 'uint32' },
        ],
      },
    ],
    name: 'act',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'agreementId', internalType: 'uint256', type: 'uint256' }],
    name: 'agreementOrdering',
    outputs: [{ name: '', internalType: 'uint96', type: 'uint96' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'arbiterCapabilities',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'arbiterMetadataURI',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'commitmentManager',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'commitmentOrdering',
    outputs: [{ name: '', internalType: 'uint96', type: 'uint96' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'eventId', internalType: 'bytes20', type: 'bytes20' }],
    name: 'isEnvelopeConsumed',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [
      {
        name: '',
        internalType: 'contract ICommitmentManager',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'mutualOrdering',
    outputs: [{ name: '', internalType: 'uint96', type: 'uint96' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'serviceManager',
    outputs: [
      { name: '', internalType: 'contract IServiceManager', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'pure',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'action',
        internalType: 'enum AttestationArbiter.Action',
        type: 'uint8',
        indexed: true,
      },
      { name: 'id', internalType: 'uint256', type: 'uint256', indexed: true },
      {
        name: 'penaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'deadline',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Acted',
  },
  {
    type: 'error',
    inputs: [
      { name: 'required', internalType: 'uint64', type: 'uint64' },
      { name: 'actual', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'ChallengeWindowTooShort',
  },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'CommitmentNotActive',
  },
  {
    type: 'error',
    inputs: [{ name: 'eventId', internalType: 'bytes20', type: 'bytes20' }],
    name: 'EnvelopeAlreadyConsumed',
  },
  {
    type: 'error',
    inputs: [
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'blockTimestamp', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ExpiredAttestation',
  },
  {
    type: 'error',
    inputs: [{ name: 'action', internalType: 'uint8', type: 'uint8' }],
    name: 'InvalidAction',
  },
  {
    type: 'error',
    inputs: [
      { name: 'expected', internalType: 'uint96', type: 'uint96' },
      { name: 'provided', internalType: 'uint96', type: 'uint96' },
    ],
    name: 'OrderingMismatch',
  },
  {
    type: 'error',
    inputs: [
      { name: 'expected', internalType: 'address', type: 'address' },
      { name: 'actual', internalType: 'address', type: 'address' },
    ],
    name: 'WrongArbiter',
  },
  {
    type: 'error',
    inputs: [
      { name: 'expected', internalType: 'address', type: 'address' },
      { name: 'actual', internalType: 'address', type: 'address' },
    ],
    name: 'WrongBoundArbiter',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ClaimRouter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const claimRouterAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'manager_', internalType: 'address', type: 'address' },
      { name: 'claimant_', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'claimant',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
    ],
    name: 'collect',
    outputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [
      {
        name: '',
        internalType: 'contract ICommitmentManager',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentIds', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
    ],
    name: 'settleAndCollect',
    outputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Collected',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'count',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'Settled',
  },
  { type: 'error', inputs: [], name: 'NotClaimant' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CommitmentManager
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const commitmentManagerAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [],
    name: 'CREATE_COMMITMENT_TYPEHASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FORFEIT_PROPOSAL_TTL',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'HOOK_GAS_CAP_FLOOR',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MAX_METADATA_URI_LENGTH',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MAX_PROPOSAL_DURATION',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MAX_STRATEGIES',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MIN_CHALLENGE_WINDOW',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PAUSER_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'UNPAUSER_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'UPGRADE_INTERFACE_VERSION',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'strategy', internalType: 'address', type: 'address' },
      { name: 'hook', internalType: 'uint8', type: 'uint8' },
    ],
    name: '__runStrategyHook',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'acceptAgreement',
    outputs: [
      { name: 'agreementId', internalType: 'uint256', type: 'uint256' },
      { name: 'commitmentIdA', internalType: 'uint256', type: 'uint256' },
      { name: 'commitmentIdB', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'acceptsContributions',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'activateMutual',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'agreementOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'agreementOfProposal',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'params',
        internalType: 'struct ICommitmentManager.CommitmentParams[]',
        type: 'tuple[]',
        components: [
          { name: 'arbiter', internalType: 'address', type: 'address' },
          { name: 'counterparty', internalType: 'address', type: 'address' },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'adapter', internalType: 'address', type: 'address' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          { name: 'expiresAt', internalType: 'uint64', type: 'uint64' },
          {
            name: 'strategies',
            internalType: 'struct StrategyBinding[]',
            type: 'tuple[]',
            components: [
              { name: 'strategy', internalType: 'address', type: 'address' },
              { name: 'params', internalType: 'bytes', type: 'bytes' },
            ],
          },
          { name: 'metadataURI', internalType: 'string', type: 'string' },
          { name: 'metadataHash', internalType: 'bytes32', type: 'bytes32' },
        ],
      },
    ],
    name: 'batchCreateCommitments',
    outputs: [
      { name: 'commitmentIds', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentIds', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    name: 'batchReleaseCommitments',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'cancelAgreementProposal',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'cancelForfeit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'cancelMutualLoss',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'cancelStaleForfeitProposal',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'cancelStaleMutualLoss',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'cancelUnbond',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'strategy', internalType: 'address', type: 'address' },
      { name: 'claimData', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'claimMemberPremium',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentIds', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    name: 'claimMembersPremium',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'closedAt',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'units', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'contributeEncumbered',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'depositAmount', internalType: 'uint256', type: 'uint256' },
      {
        name: 'params',
        internalType: 'struct ICommitmentManager.CommitmentParams',
        type: 'tuple',
        components: [
          { name: 'arbiter', internalType: 'address', type: 'address' },
          { name: 'counterparty', internalType: 'address', type: 'address' },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'adapter', internalType: 'address', type: 'address' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          { name: 'expiresAt', internalType: 'uint64', type: 'uint64' },
          {
            name: 'strategies',
            internalType: 'struct StrategyBinding[]',
            type: 'tuple[]',
            components: [
              { name: 'strategy', internalType: 'address', type: 'address' },
              { name: 'params', internalType: 'bytes', type: 'bytes' },
            ],
          },
          { name: 'metadataURI', internalType: 'string', type: 'string' },
          { name: 'metadataHash', internalType: 'bytes32', type: 'bytes32' },
        ],
      },
    ],
    name: 'createAndFund',
    outputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'params',
        internalType: 'struct ICommitmentManager.CommitmentParams',
        type: 'tuple',
        components: [
          { name: 'arbiter', internalType: 'address', type: 'address' },
          { name: 'counterparty', internalType: 'address', type: 'address' },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'adapter', internalType: 'address', type: 'address' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          { name: 'expiresAt', internalType: 'uint64', type: 'uint64' },
          {
            name: 'strategies',
            internalType: 'struct StrategyBinding[]',
            type: 'tuple[]',
            components: [
              { name: 'strategy', internalType: 'address', type: 'address' },
              { name: 'params', internalType: 'bytes', type: 'bytes' },
            ],
          },
          { name: 'metadataURI', internalType: 'string', type: 'string' },
          { name: 'metadataHash', internalType: 'bytes32', type: 'bytes32' },
        ],
      },
    ],
    name: 'createCommitment',
    outputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'committer', internalType: 'address', type: 'address' },
      {
        name: 'params',
        internalType: 'struct ICommitmentManager.CommitmentParams',
        type: 'tuple',
        components: [
          { name: 'arbiter', internalType: 'address', type: 'address' },
          { name: 'counterparty', internalType: 'address', type: 'address' },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'adapter', internalType: 'address', type: 'address' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          { name: 'expiresAt', internalType: 'uint64', type: 'uint64' },
          {
            name: 'strategies',
            internalType: 'struct StrategyBinding[]',
            type: 'tuple[]',
            components: [
              { name: 'strategy', internalType: 'address', type: 'address' },
              { name: 'params', internalType: 'bytes', type: 'bytes' },
            ],
          },
          { name: 'metadataURI', internalType: 'string', type: 'string' },
          { name: 'metadataHash', internalType: 'bytes32', type: 'bytes32' },
        ],
      },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'nonce', internalType: 'uint256', type: 'uint256' },
      { name: 'sig', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'createCommitmentFor',
    outputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'params',
        internalType: 'struct ICommitmentManager.MutualParams',
        type: 'tuple',
        components: [
          { name: 'arbiter', internalType: 'address', type: 'address' },
          { name: 'numeraire', internalType: 'address', type: 'address' },
          { name: 'beneficiary', internalType: 'address', type: 'address' },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          {
            name: 'deallocationWindow',
            internalType: 'uint64',
            type: 'uint64',
          },
        ],
      },
    ],
    name: 'createMutual',
    outputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'onBehalfOf', internalType: 'address', type: 'address' },
    ],
    name: 'depositFor',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'v', internalType: 'uint8', type: 'uint8' },
      { name: 'r', internalType: 'bytes32', type: 'bytes32' },
      { name: 's_', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'depositWithPermit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'strategy', internalType: 'address', type: 'address' },
    ],
    name: 'distribute',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'distributeAll',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'strategy', internalType: 'address', type: 'address' },
      { name: 'claimData', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'distributeAndClaim',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'eip712Domain',
    outputs: [
      { name: 'fields', internalType: 'bytes1', type: 'bytes1' },
      { name: 'name', internalType: 'string', type: 'string' },
      { name: 'version', internalType: 'string', type: 'string' },
      { name: 'chainId', internalType: 'uint256', type: 'uint256' },
      { name: 'verifyingContract', internalType: 'address', type: 'address' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'extensions', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'user', internalType: 'address', type: 'address' },
    ],
    name: 'encumberedBalance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'strategy', internalType: 'address', type: 'address' },
    ],
    name: 'escrowOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'executeForfeit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'executeMutualLoss',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'expireCommitment',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'strategy', internalType: 'address', type: 'address' },
    ],
    name: 'failedHook',
    outputs: [{ name: '', internalType: 'bytes4', type: 'bytes4' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'finalizeUnbond',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operatorRegistry_', internalType: 'address', type: 'address' },
    ],
    name: 'forceSetOperatorRegistry',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'agreementId', internalType: 'uint256', type: 'uint256' },
      { name: 'penaltyBps', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'forfeitAgreement',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'forfeitedUnitsOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'forfeiturePaused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'user', internalType: 'address', type: 'address' },
    ],
    name: 'freeBalance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'duration', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'fundMutualPremium',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'strategy', internalType: 'address', type: 'address' },
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'fundStrategy',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'agreementId', internalType: 'uint256', type: 'uint256' }],
    name: 'getAgreementPair',
    outputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'agreementId', internalType: 'uint256', type: 'uint256' }],
    name: 'getAgreementSettlement',
    outputs: [
      { name: 'maxPToA', internalType: 'uint128', type: 'uint128' },
      { name: 'maxAToP', internalType: 'uint128', type: 'uint128' },
      { name: 'cumulPToA', internalType: 'uint128', type: 'uint128' },
      { name: 'cumulAToP', internalType: 'uint128', type: 'uint128' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getCommitment',
    outputs: [
      {
        name: '',
        internalType: 'struct ICommitmentManager.Commitment',
        type: 'tuple',
        components: [
          { name: 'committer', internalType: 'address', type: 'address' },
          { name: 'arbiter', internalType: 'address', type: 'address' },
          { name: 'counterparty', internalType: 'address', type: 'address' },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'adapter', internalType: 'address', type: 'address' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          { name: 'createdAt', internalType: 'uint64', type: 'uint64' },
          { name: 'expiresAt', internalType: 'uint64', type: 'uint64' },
          { name: 'released', internalType: 'bool', type: 'bool' },
          { name: 'forfeited', internalType: 'bool', type: 'bool' },
          { name: 'metadataURI', internalType: 'string', type: 'string' },
          { name: 'metadataHash', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'cumulativePausedAtStart',
            internalType: 'uint64',
            type: 'uint64',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getForfeitProposal',
    outputs: [
      {
        name: '',
        internalType: 'struct ICommitmentManager.ForfeitProposal',
        type: 'tuple',
        components: [
          { name: 'penaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'initiatedAt', internalType: 'uint64', type: 'uint64' },
          { name: 'executed', internalType: 'bool', type: 'bool' },
          { name: 'cancelled', internalType: 'bool', type: 'bool' },
          {
            name: 'cumulativePausedAtStart',
            internalType: 'uint64',
            type: 'uint64',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getMembership',
    outputs: [
      {
        name: '',
        internalType: 'struct ICommitmentManager.Membership',
        type: 'tuple',
        components: [
          { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
          {
            name: 'forfeitableUnits',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'settledUnits', internalType: 'uint256', type: 'uint256' },
          { name: 'creditedValue', internalType: 'uint128', type: 'uint128' },
          { name: 'lossSnapshot', internalType: 'uint256', type: 'uint256' },
          { name: 'unbondRequestedAt', internalType: 'uint64', type: 'uint64' },
          { name: 'premiumSnapshot', internalType: 'uint256', type: 'uint256' },
          { name: 'rewardBank', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'getMutual',
    outputs: [
      {
        name: '',
        internalType: 'struct ICommitmentManager.Mutual',
        type: 'tuple',
        components: [
          { name: 'arbiter', internalType: 'address', type: 'address' },
          { name: 'numeraire', internalType: 'address', type: 'address' },
          { name: 'beneficiary', internalType: 'address', type: 'address' },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          {
            name: 'deallocationWindow',
            internalType: 'uint64',
            type: 'uint64',
          },
          { name: 'lastInitiatedAt', internalType: 'uint64', type: 'uint64' },
          { name: 'totalShares', internalType: 'uint128', type: 'uint128' },
          { name: 'cumulativeLoss', internalType: 'uint256', type: 'uint256' },
          { name: 'active', internalType: 'bool', type: 'bool' },
          { name: 'terminal', internalType: 'bool', type: 'bool' },
          {
            name: 'premiumPerShareStored',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'activeCover', internalType: 'uint128', type: 'uint128' },
          { name: 'settledTotal', internalType: 'uint256', type: 'uint256' },
          { name: 'rewardRate', internalType: 'uint128', type: 'uint128' },
          { name: 'lastUpdate', internalType: 'uint64', type: 'uint64' },
          { name: 'periodFinish', internalType: 'uint64', type: 'uint64' },
          {
            name: 'premiumRemainder',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'bankedTotal', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'getMutualLossProposal',
    outputs: [
      {
        name: '',
        internalType: 'struct ICommitmentManager.MutualLossProposal',
        type: 'tuple',
        components: [
          { name: 'lossNumeraire', internalType: 'uint256', type: 'uint256' },
          { name: 'initiatedAt', internalType: 'uint64', type: 'uint64' },
          { name: 'evidenceHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'proposer', internalType: 'address', type: 'address' },
          { name: 'executed', internalType: 'bool', type: 'bool' },
          { name: 'cancelled', internalType: 'bool', type: 'bool' },
          {
            name: 'cumulativePausedAtStart',
            internalType: 'uint64',
            type: 'uint64',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'getMutualPremiumState',
    outputs: [
      {
        name: 'premiumPerShareStored',
        internalType: 'uint256',
        type: 'uint256',
      },
      { name: 'activeCover', internalType: 'uint128', type: 'uint128' },
      { name: 'settledTotal', internalType: 'uint256', type: 'uint256' },
      { name: 'rewardRate', internalType: 'uint128', type: 'uint128' },
      { name: 'lastUpdate', internalType: 'uint64', type: 'uint64' },
      { name: 'periodFinish', internalType: 'uint64', type: 'uint64' },
      { name: 'premiumRemainder', internalType: 'uint256', type: 'uint256' },
      { name: 'bankedTotal', internalType: 'uint256', type: 'uint256' },
      { name: 'premiumPool', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'role', internalType: 'bytes32', type: 'bytes32' }],
    name: 'getRoleAdmin',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'user', internalType: 'address', type: 'address' }],
    name: 'getUserCommitmentIds',
    outputs: [{ name: '', internalType: 'uint256[]', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'user', internalType: 'address', type: 'address' },
    ],
    name: 'getUserExposure',
    outputs: [
      {
        name: '',
        internalType: 'struct ICommitmentManager.UserExposure',
        type: 'tuple',
        components: [
          { name: 'totalEncumbered', internalType: 'uint256', type: 'uint256' },
          {
            name: 'totalForfeitable',
            internalType: 'uint256',
            type: 'uint256',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'hasRole',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'hookGasCap',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'admin_', internalType: 'address', type: 'address' },
      { name: 'unbondingPeriod_', internalType: 'uint64', type: 'uint64' },
      { name: 'maxPauseDuration_', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'penaltyBps', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'initiateForfeit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      { name: 'lossNumeraire', internalType: 'uint256', type: 'uint256' },
      { name: 'evidenceHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'initiateMutualLoss',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'invalidateCreateAuthorization',
    outputs: [{ name: 'newNonce', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'params',
        internalType: 'struct ICommitmentManager.CommitmentParams',
        type: 'tuple',
        components: [
          { name: 'arbiter', internalType: 'address', type: 'address' },
          { name: 'counterparty', internalType: 'address', type: 'address' },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'adapter', internalType: 'address', type: 'address' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          { name: 'expiresAt', internalType: 'uint64', type: 'uint64' },
          {
            name: 'strategies',
            internalType: 'struct StrategyBinding[]',
            type: 'tuple[]',
            components: [
              { name: 'strategy', internalType: 'address', type: 'address' },
              { name: 'params', internalType: 'bytes', type: 'bytes' },
            ],
          },
          { name: 'metadataURI', internalType: 'string', type: 'string' },
          { name: 'metadataHash', internalType: 'bytes32', type: 'bytes32' },
        ],
      },
    ],
    name: 'joinMutual',
    outputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'ledgerTotals',
    outputs: [
      { name: 'totalFree', internalType: 'uint256', type: 'uint256' },
      { name: 'totalEncumbered', internalType: 'uint256', type: 'uint256' },
      { name: 'totalEscrow', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'committer', internalType: 'address', type: 'address' }],
    name: 'nonces',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'operatorRegistry',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pauseForfeiture',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pauseState',
    outputs: [
      { name: 'paused', internalType: 'bool', type: 'bool' },
      { name: 'pausedAt', internalType: 'uint64', type: 'uint64' },
      { name: 'cumulativePaused', internalType: 'uint64', type: 'uint64' },
      { name: 'maxPauseDuration', internalType: 'uint64', type: 'uint64' },
      { name: 'creditable', internalType: 'uint64', type: 'uint64' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'strategy', internalType: 'address', type: 'address' },
      { name: 'claimData', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'pending',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'pendingMemberLoss',
    outputs: [{ name: 'owedUnits', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'pendingMemberPremium',
    outputs: [{ name: 'claimable', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'params',
        internalType: 'struct ICommitmentManager.AgreementParams',
        type: 'tuple',
        components: [
          { name: 'arbiter', internalType: 'address', type: 'address' },
          { name: 'acceptor', internalType: 'address', type: 'address' },
          {
            name: 'proposerLeg',
            internalType: 'struct ICommitmentManager.LegTerms',
            type: 'tuple',
            components: [
              { name: 'token', internalType: 'address', type: 'address' },
              { name: 'adapter', internalType: 'address', type: 'address' },
              { name: 'amount', internalType: 'uint256', type: 'uint256' },
              { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
              {
                name: 'strategies',
                internalType: 'struct StrategyBinding[]',
                type: 'tuple[]',
                components: [
                  {
                    name: 'strategy',
                    internalType: 'address',
                    type: 'address',
                  },
                  { name: 'params', internalType: 'bytes', type: 'bytes' },
                ],
              },
            ],
          },
          {
            name: 'acceptorLeg',
            internalType: 'struct ICommitmentManager.LegTerms',
            type: 'tuple',
            components: [
              { name: 'token', internalType: 'address', type: 'address' },
              { name: 'adapter', internalType: 'address', type: 'address' },
              { name: 'amount', internalType: 'uint256', type: 'uint256' },
              { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
              {
                name: 'strategies',
                internalType: 'struct StrategyBinding[]',
                type: 'tuple[]',
                components: [
                  {
                    name: 'strategy',
                    internalType: 'address',
                    type: 'address',
                  },
                  { name: 'params', internalType: 'bytes', type: 'bytes' },
                ],
              },
            ],
          },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          { name: 'proposalDuration', internalType: 'uint64', type: 'uint64' },
          { name: 'metadataURI', internalType: 'string', type: 'string' },
          { name: 'metadataHash', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'maxFlowProposerToAcceptor',
            internalType: 'uint128',
            type: 'uint128',
          },
          {
            name: 'maxFlowAcceptorToProposer',
            internalType: 'uint128',
            type: 'uint128',
          },
        ],
      },
    ],
    name: 'proposeAgreement',
    outputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'proxiableUUID',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'reclaimPremium',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'agreementId', internalType: 'uint256', type: 'uint256' }],
    name: 'releaseAgreement',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'releaseCommitment',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'releaseMutualMember',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'callerConfirmation', internalType: 'address', type: 'address' },
    ],
    name: 'renounceRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'agreementId', internalType: 'uint256', type: 'uint256' }],
    name: 'requestAgreementUnbond',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'requestMutualExit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'requestUnbond',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'revokeRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newValue', internalType: 'uint64', type: 'uint64' }],
    name: 'setHookGasCap',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newValue', internalType: 'uint64', type: 'uint64' }],
    name: 'setMinChallengeWindow',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operatorRegistry_', internalType: 'address', type: 'address' },
    ],
    name: 'setOperatorRegistry',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newValue', internalType: 'uint64', type: 'uint64' }],
    name: 'setUnbondingPeriod',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'agreementId', internalType: 'uint256', type: 'uint256' },
      { name: 'fromProposer', internalType: 'bool', type: 'bool' },
      { name: 'units', internalType: 'uint256', type: 'uint256' },
      { name: 'evidenceHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'settleAgreement',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'settleAndClaim',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'settleMemberLoss',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentIds', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    name: 'settleMembers',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'strategiesOf',
    outputs: [{ name: '', internalType: 'address[]', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'strategy', internalType: 'address', type: 'address' },
    ],
    name: 'sweepFailedHook',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'unbondInitiatedAt',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'unbondingPeriod',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'unpauseForfeiture',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newImplementation', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'upgradeToAndCall',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'agreementId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentIdA',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'commitmentIdB',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'uri', internalType: 'string', type: 'string', indexed: false },
      {
        name: 'contentHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'AgreementAccepted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'agreementId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'AgreementForfeited',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'agreementId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'AgreementPartialForfeit',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'AgreementProposalCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'proposer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'AgreementProposalExpiredCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'proposer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'acceptor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'uri', internalType: 'string', type: 'string', indexed: false },
      {
        name: 'contentHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'AgreementProposed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'arbiter',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'proposerToken',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'proposerAdapter',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'proposerAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'proposerMaxPenaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'acceptorToken',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'acceptorAdapter',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'acceptorAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'acceptorMaxPenaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'challengeWindow',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'expiresAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'maxFlowProposerToAcceptor',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'maxFlowAcceptorToProposer',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
    ],
    name: 'AgreementProposedTerms',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'agreementId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'AgreementReleased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'agreementId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'fromProposer',
        internalType: 'bool',
        type: 'bool',
        indexed: false,
      },
      {
        name: 'units',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'cumulativeProposerToAcceptor',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'cumulativeAcceptorToProposer',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'evidenceHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'AgreementSettled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'agreementId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'AgreementUnbondRequested',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'strategy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'strategyParams',
        internalType: 'bytes',
        type: 'bytes',
        indexed: false,
      },
    ],
    name: 'CommitmentBoundToStrategy',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'counterparty',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'CommitmentCounterparty',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'committer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'arbiter',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'counterparty',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'adapter',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'maxPenaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'challengeWindow',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'expiresAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'metadataURI',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'metadataHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'CommitmentCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'committer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'CommitmentExpired',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'CommitmentFinalized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'arbiter',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'CommitmentReleased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'CommitmentUnbondCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'committer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'maturesAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'CommitmentUnbondRequested',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'committer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ContributionsEnabled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'committer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newNonce',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'CreateAuthorizationInvalidated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'user', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Deposited',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'strategy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'context',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'DistributionPaid',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EIP712DomainChanged' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'contributor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'receiver',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'units',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'EncumbranceContributed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'user', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'units',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'EncumbranceIncreased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'strategy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'units',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'EncumbranceMovedToEscrow',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'strategy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'units',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'EncumbrancePaidExternal',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      { name: 'user', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'units',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'EncumbranceReleased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'units',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'EncumbranceTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'ForfeitCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'ForfeitCancelledStale',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'unitsForfeited',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'counterparty',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ForfeitExecuted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'penaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'challengeWindow',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'ForfeitInitiated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'paused', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'ForfeiturePauseToggled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldValue',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'newValue',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'HookGasCapUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'version',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'Initialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'slashableUntil',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'MemberExitRequested',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'committer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'creditedValue',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'forfeitableUnits',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MemberJoined',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MemberPremiumClaimed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'MemberReleased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'owedUnits',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'cumulativeLoss',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MemberSettled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldValue',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'newValue',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'MinChallengeWindowUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'MutualActivated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'arbiter',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'numeraire',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'beneficiary',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'MutualCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      { name: 'stale', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'MutualLossCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'appliedNumeraire',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'cumulativeLoss',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MutualLossExecuted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'lossNumeraire',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'evidenceHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'proposer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'MutualLossInitiated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'shortfallNumeraire',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MutualLossShortfall',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'funder',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'received',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'rewardRate',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'periodFinish',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'MutualPremiumFunded',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MutualPremiumSwept',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'MutualTerminated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldRegistry',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newRegistry',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OperatorRegistryUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'unstreamed',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'PremiumReclaimed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'selector',
        internalType: 'bytes4',
        type: 'bytes4',
        indexed: true,
      },
    ],
    name: 'RegistryHookFailed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'previousAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'newAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'RoleAdminChanged',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleGranted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleRevoked',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'funder',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'strategy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'StrategyFunded',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'strategy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'hookSelector',
        internalType: 'bytes4',
        type: 'bytes4',
        indexed: false,
      },
    ],
    name: 'StrategyHookFailed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldValue',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'newValue',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'UnbondingPeriodUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'implementation',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Upgraded',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'user', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Withdrawn',
  },
  { type: 'error', inputs: [], name: 'AccessControlBadConfirmation' },
  {
    type: 'error',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'neededRole', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'AccessControlUnauthorizedAccount',
  },
  {
    type: 'error',
    inputs: [{ name: 'target', internalType: 'address', type: 'address' }],
    name: 'AddressEmptyCode',
  },
  { type: 'error', inputs: [], name: 'AgreementBothResolved' },
  { type: 'error', inputs: [], name: 'AgreementNotFound' },
  { type: 'error', inputs: [], name: 'AlreadyAccepted' },
  { type: 'error', inputs: [], name: 'ChallengeWindowActive' },
  { type: 'error', inputs: [], name: 'ChallengeWindowTooShort' },
  { type: 'error', inputs: [], name: 'CommitmentHasNoExpiry' },
  { type: 'error', inputs: [], name: 'CommitmentInMutual' },
  { type: 'error', inputs: [], name: 'CommitmentInactive' },
  { type: 'error', inputs: [], name: 'CommitmentNotExpired' },
  { type: 'error', inputs: [], name: 'ContributionsDisabled' },
  { type: 'error', inputs: [], name: 'DeallocationWindowActive' },
  { type: 'error', inputs: [], name: 'DeallocationWindowTooShort' },
  { type: 'error', inputs: [], name: 'DuplicateStrategy' },
  {
    type: 'error',
    inputs: [
      { name: 'implementation', internalType: 'address', type: 'address' },
    ],
    name: 'ERC1967InvalidImplementation',
  },
  { type: 'error', inputs: [], name: 'ERC1967NonPayable' },
  { type: 'error', inputs: [], name: 'EmptyBatch' },
  { type: 'error', inputs: [], name: 'ExitNotRequested' },
  { type: 'error', inputs: [], name: 'ExitRequestLapsed' },
  { type: 'error', inputs: [], name: 'ExposureAllocationExceeded' },
  { type: 'error', inputs: [], name: 'FailedCall' },
  { type: 'error', inputs: [], name: 'ForfeitPending' },
  { type: 'error', inputs: [], name: 'ForfeitureIsPaused' },
  {
    type: 'error',
    inputs: [
      { name: 'requested', internalType: 'uint256', type: 'uint256' },
      { name: 'available', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientCommitmentAmount',
  },
  {
    type: 'error',
    inputs: [
      { name: 'requested', internalType: 'uint256', type: 'uint256' },
      { name: 'available', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientEncumberedBalance',
  },
  {
    type: 'error',
    inputs: [
      { name: 'requested', internalType: 'uint256', type: 'uint256' },
      { name: 'available', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientEscrow',
  },
  {
    type: 'error',
    inputs: [
      { name: 'requested', internalType: 'uint256', type: 'uint256' },
      { name: 'available', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientFreeBalance',
  },
  { type: 'error', inputs: [], name: 'InsufficientGasForHook' },
  {
    type: 'error',
    inputs: [
      { name: 'requested', internalType: 'uint256', type: 'uint256' },
      { name: 'available', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientMutualPremium',
  },
  { type: 'error', inputs: [], name: 'InvalidCreditedValue' },
  { type: 'error', inputs: [], name: 'InvalidExpiry' },
  { type: 'error', inputs: [], name: 'InvalidInitialization' },
  { type: 'error', inputs: [], name: 'InvalidNonce' },
  { type: 'error', inputs: [], name: 'InvalidSignature' },
  { type: 'error', inputs: [], name: 'MemberStrategyForbidden' },
  { type: 'error', inputs: [], name: 'MemberUnsettled' },
  { type: 'error', inputs: [], name: 'MinChallengeWindowBelowFloor' },
  { type: 'error', inputs: [], name: 'MovementBlockedByForfeit' },
  {
    type: 'error',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'strategy', internalType: 'address', type: 'address' },
    ],
    name: 'MovementEscrowRecipientNotStrategy',
  },
  {
    type: 'error',
    inputs: [
      { name: 'units', internalType: 'uint256', type: 'uint256' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'MovementExceedsCommitment',
  },
  { type: 'error', inputs: [], name: 'MovementFromEscrowNotOnDistribute' },
  {
    type: 'error',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'committer', internalType: 'address', type: 'address' },
    ],
    name: 'MovementFromNotCommitter',
  },
  {
    type: 'error',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'strategy', internalType: 'address', type: 'address' },
    ],
    name: 'MovementFromNotStrategy',
  },
  {
    type: 'error',
    inputs: [{ name: 'to', internalType: 'address', type: 'address' }],
    name: 'MovementRecipientNotParty',
  },
  { type: 'error', inputs: [], name: 'MovementToEscrowNotAllowedOnClaim' },
  { type: 'error', inputs: [], name: 'MovementToExternalOnlyOnDistribute' },
  {
    type: 'error',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'expected', internalType: 'address', type: 'address' },
    ],
    name: 'MovementWrongToken',
  },
  { type: 'error', inputs: [], name: 'MovementZeroUnits' },
  { type: 'error', inputs: [], name: 'MutualArbiterMismatch' },
  { type: 'error', inputs: [], name: 'MutualBeneficiaryMismatch' },
  { type: 'error', inputs: [], name: 'MutualChallengeWindowActive' },
  { type: 'error', inputs: [], name: 'MutualChallengeWindowTooShort' },
  { type: 'error', inputs: [], name: 'MutualExhausted' },
  { type: 'error', inputs: [], name: 'MutualIsTerminal' },
  { type: 'error', inputs: [], name: 'MutualLossPending' },
  { type: 'error', inputs: [], name: 'MutualNotActive' },
  { type: 'error', inputs: [], name: 'MutualNotFound' },
  { type: 'error', inputs: [], name: 'NoActiveCover' },
  { type: 'error', inputs: [], name: 'NoActiveForfeitProposal' },
  { type: 'error', inputs: [], name: 'NoFailedHook' },
  { type: 'error', inputs: [], name: 'NoMutualLossPending' },
  { type: 'error', inputs: [], name: 'NoUnbondPending' },
  { type: 'error', inputs: [], name: 'NotAcceptor' },
  { type: 'error', inputs: [], name: 'NotArbiter' },
  { type: 'error', inputs: [], name: 'NotCommitter' },
  { type: 'error', inputs: [], name: 'NotInitializing' },
  { type: 'error', inputs: [], name: 'NotMutualArbiter' },
  { type: 'error', inputs: [], name: 'NotMutualMember' },
  { type: 'error', inputs: [], name: 'NotProposer' },
  { type: 'error', inputs: [], name: 'NumeraireMismatch' },
  {
    type: 'error',
    inputs: [
      { name: 'outgoingRegistry', internalType: 'address', type: 'address' },
    ],
    name: 'OperatorRegistrySwapBlocked',
  },
  { type: 'error', inputs: [], name: 'PenaltyExceedsMax' },
  { type: 'error', inputs: [], name: 'PremiumRateDecreased' },
  { type: 'error', inputs: [], name: 'PremiumStreamUnderfunded' },
  { type: 'error', inputs: [], name: 'ProposalDurationTooLong' },
  { type: 'error', inputs: [], name: 'ProposalExpired' },
  { type: 'error', inputs: [], name: 'ProposalNotFound' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  { type: 'error', inputs: [], name: 'ReinitTooSoon' },
  { type: 'error', inputs: [], name: 'RewardRateOverflow' },
  {
    type: 'error',
    inputs: [
      { name: 'requested', internalType: 'uint128', type: 'uint128' },
      { name: 'cap', internalType: 'uint128', type: 'uint128' },
    ],
    name: 'SettlementCapExceeded',
  },
  { type: 'error', inputs: [], name: 'SettlementCapZero' },
  { type: 'error', inputs: [], name: 'SignatureExpired' },
  { type: 'error', inputs: [], name: 'StreamDurationOutOfBounds' },
  { type: 'error', inputs: [], name: 'TooManyStrategies' },
  { type: 'error', inputs: [], name: 'TotalSharesOverflow' },
  { type: 'error', inputs: [], name: 'URITooLong' },
  { type: 'error', inputs: [], name: 'UUPSUnauthorizedCallContext' },
  {
    type: 'error',
    inputs: [{ name: 'slot', internalType: 'bytes32', type: 'bytes32' }],
    name: 'UUPSUnsupportedProxiableUUID',
  },
  { type: 'error', inputs: [], name: 'Unauthorized' },
  { type: 'error', inputs: [], name: 'UnbondAlreadyRequested' },
  { type: 'error', inputs: [], name: 'UnbondBlockedByForfeit' },
  {
    type: 'error',
    inputs: [{ name: 'maturesAt', internalType: 'uint64', type: 'uint64' }],
    name: 'UnbondNotElapsed',
  },
  { type: 'error', inputs: [], name: 'UnbondPending' },
  { type: 'error', inputs: [], name: 'UnknownStrategy' },
  { type: 'error', inputs: [], name: 'UseAgreementPath' },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
  { type: 'error', inputs: [], name: 'ZeroAmount' },
  { type: 'error', inputs: [], name: 'ZeroArbiter' },
  { type: 'error', inputs: [], name: 'ZeroCounterparty' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CommitmentsGovernor
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const commitmentsGovernorAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  { type: 'receive', stateMutability: 'payable' },
  {
    type: 'function',
    inputs: [],
    name: 'BALLOT_TYPEHASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'CLOCK_MODE',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'COUNTING_MODE',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'EXTENDED_BALLOT_TYPEHASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'UPGRADE_INTERFACE_VERSION',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'targets', internalType: 'address[]', type: 'address[]' },
      { name: 'values', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'calldatas', internalType: 'bytes[]', type: 'bytes[]' },
      { name: 'descriptionHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'cancel',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'proposalId', internalType: 'uint256', type: 'uint256' },
      { name: 'support', internalType: 'uint8', type: 'uint8' },
    ],
    name: 'castVote',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'proposalId', internalType: 'uint256', type: 'uint256' },
      { name: 'support', internalType: 'uint8', type: 'uint8' },
      { name: 'voter', internalType: 'address', type: 'address' },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'castVoteBySig',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'proposalId', internalType: 'uint256', type: 'uint256' },
      { name: 'support', internalType: 'uint8', type: 'uint8' },
      { name: 'reason', internalType: 'string', type: 'string' },
    ],
    name: 'castVoteWithReason',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'proposalId', internalType: 'uint256', type: 'uint256' },
      { name: 'support', internalType: 'uint8', type: 'uint8' },
      { name: 'reason', internalType: 'string', type: 'string' },
      { name: 'params', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'castVoteWithReasonAndParams',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'proposalId', internalType: 'uint256', type: 'uint256' },
      { name: 'support', internalType: 'uint8', type: 'uint8' },
      { name: 'voter', internalType: 'address', type: 'address' },
      { name: 'reason', internalType: 'string', type: 'string' },
      { name: 'params', internalType: 'bytes', type: 'bytes' },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'castVoteWithReasonAndParamsBySig',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'clock',
    outputs: [{ name: '', internalType: 'uint48', type: 'uint48' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'eip712Domain',
    outputs: [
      { name: 'fields', internalType: 'bytes1', type: 'bytes1' },
      { name: 'name', internalType: 'string', type: 'string' },
      { name: 'version', internalType: 'string', type: 'string' },
      { name: 'chainId', internalType: 'uint256', type: 'uint256' },
      { name: 'verifyingContract', internalType: 'address', type: 'address' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'extensions', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'targets', internalType: 'address[]', type: 'address[]' },
      { name: 'values', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'calldatas', internalType: 'bytes[]', type: 'bytes[]' },
      { name: 'descriptionHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'execute',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'targets', internalType: 'address[]', type: 'address[]' },
      { name: 'values', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'calldatas', internalType: 'bytes[]', type: 'bytes[]' },
      { name: 'descriptionHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'getProposalId',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'timepoint', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getVotes',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'timepoint', internalType: 'uint256', type: 'uint256' },
      { name: 'params', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'getVotesWithParams',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'proposalId', internalType: 'uint256', type: 'uint256' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'hasVoted',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'targets', internalType: 'address[]', type: 'address[]' },
      { name: 'values', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'calldatas', internalType: 'bytes[]', type: 'bytes[]' },
      { name: 'descriptionHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'hashProposal',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'name_', internalType: 'string', type: 'string' },
      { name: 'votesSource', internalType: 'contract IVotes', type: 'address' },
      {
        name: 'timelock_',
        internalType: 'contract TimelockControllerUpgradeable',
        type: 'address',
      },
      { name: 'votingDelay_', internalType: 'uint48', type: 'uint48' },
      { name: 'votingPeriod_', internalType: 'uint32', type: 'uint32' },
      { name: 'proposalThreshold_', internalType: 'uint256', type: 'uint256' },
      { name: 'quorumNumerator_', internalType: 'uint256', type: 'uint256' },
      { name: 'lateQuorumExtension_', internalType: 'uint48', type: 'uint48' },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'lateQuorumVoteExtension',
    outputs: [{ name: '', internalType: 'uint48', type: 'uint48' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'nonces',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'uint256[]', type: 'uint256[]' },
      { name: '', internalType: 'uint256[]', type: 'uint256[]' },
      { name: '', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'onERC1155BatchReceived',
    outputs: [{ name: '', internalType: 'bytes4', type: 'bytes4' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'onERC1155Received',
    outputs: [{ name: '', internalType: 'bytes4', type: 'bytes4' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'onERC721Received',
    outputs: [{ name: '', internalType: 'bytes4', type: 'bytes4' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'proposalDeadline',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'proposalEta',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'proposalNeedsQueuing',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'proposalProposer',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'proposalSnapshot',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'proposalThreshold',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'proposalVotes',
    outputs: [
      { name: 'againstVotes', internalType: 'uint256', type: 'uint256' },
      { name: 'forVotes', internalType: 'uint256', type: 'uint256' },
      { name: 'abstainVotes', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'targets', internalType: 'address[]', type: 'address[]' },
      { name: 'values', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'calldatas', internalType: 'bytes[]', type: 'bytes[]' },
      { name: 'description', internalType: 'string', type: 'string' },
    ],
    name: 'propose',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'proxiableUUID',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'targets', internalType: 'address[]', type: 'address[]' },
      { name: 'values', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'calldatas', internalType: 'bytes[]', type: 'bytes[]' },
      { name: 'descriptionHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'queue',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'timepoint', internalType: 'uint256', type: 'uint256' }],
    name: 'quorum',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'quorumDenominator',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'timepoint', internalType: 'uint256', type: 'uint256' }],
    name: 'quorumNumerator',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'quorumNumerator',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'target', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'relay',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newVoteExtension', internalType: 'uint48', type: 'uint48' },
    ],
    name: 'setLateQuorumVoteExtension',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'newProposalThreshold',
        internalType: 'uint256',
        type: 'uint256',
      },
    ],
    name: 'setProposalThreshold',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newVotingDelay', internalType: 'uint48', type: 'uint48' },
    ],
    name: 'setVotingDelay',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newVotingPeriod', internalType: 'uint32', type: 'uint32' },
    ],
    name: 'setVotingPeriod',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'state',
    outputs: [
      { name: '', internalType: 'enum IGovernor.ProposalState', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'timelock',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'token',
    outputs: [{ name: '', internalType: 'contract IERC5805', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newQuorumNumerator', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'updateQuorumNumerator',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'newTimelock',
        internalType: 'contract TimelockControllerUpgradeable',
        type: 'address',
      },
    ],
    name: 'updateTimelock',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newImplementation', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'upgradeToAndCall',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'version',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'votingDelay',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'votingPeriod',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EIP712DomainChanged' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'version',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'Initialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldVoteExtension',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'newVoteExtension',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'LateQuorumVoteExtensionSet',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ProposalCanceled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'proposer',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'targets',
        internalType: 'address[]',
        type: 'address[]',
        indexed: false,
      },
      {
        name: 'values',
        internalType: 'uint256[]',
        type: 'uint256[]',
        indexed: false,
      },
      {
        name: 'signatures',
        internalType: 'string[]',
        type: 'string[]',
        indexed: false,
      },
      {
        name: 'calldatas',
        internalType: 'bytes[]',
        type: 'bytes[]',
        indexed: false,
      },
      {
        name: 'voteStart',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'voteEnd',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'description',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
    ],
    name: 'ProposalCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ProposalExecuted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'extendedDeadline',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'ProposalExtended',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'etaSeconds',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ProposalQueued',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldProposalThreshold',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newProposalThreshold',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ProposalThresholdSet',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldQuorumNumerator',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newQuorumNumerator',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'QuorumNumeratorUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldTimelock',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'newTimelock',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'TimelockChange',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'implementation',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Upgraded',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'voter',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'support', internalType: 'uint8', type: 'uint8', indexed: false },
      {
        name: 'weight',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'reason',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
    ],
    name: 'VoteCast',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'voter',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'proposalId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'support', internalType: 'uint8', type: 'uint8', indexed: false },
      {
        name: 'weight',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'reason',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      { name: 'params', internalType: 'bytes', type: 'bytes', indexed: false },
    ],
    name: 'VoteCastWithParams',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldVotingDelay',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newVotingDelay',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'VotingDelaySet',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldVotingPeriod',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newVotingPeriod',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'VotingPeriodSet',
  },
  {
    type: 'error',
    inputs: [{ name: 'target', internalType: 'address', type: 'address' }],
    name: 'AddressEmptyCode',
  },
  { type: 'error', inputs: [], name: 'CheckpointUnorderedInsertion' },
  {
    type: 'error',
    inputs: [
      { name: 'implementation', internalType: 'address', type: 'address' },
    ],
    name: 'ERC1967InvalidImplementation',
  },
  { type: 'error', inputs: [], name: 'ERC1967NonPayable' },
  { type: 'error', inputs: [], name: 'FailedCall' },
  {
    type: 'error',
    inputs: [{ name: 'voter', internalType: 'address', type: 'address' }],
    name: 'GovernorAlreadyCastVote',
  },
  {
    type: 'error',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'GovernorAlreadyQueuedProposal',
  },
  { type: 'error', inputs: [], name: 'GovernorDisabledDeposit' },
  {
    type: 'error',
    inputs: [
      { name: 'proposer', internalType: 'address', type: 'address' },
      { name: 'votes', internalType: 'uint256', type: 'uint256' },
      { name: 'threshold', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'GovernorInsufficientProposerVotes',
  },
  {
    type: 'error',
    inputs: [
      { name: 'targets', internalType: 'uint256', type: 'uint256' },
      { name: 'calldatas', internalType: 'uint256', type: 'uint256' },
      { name: 'values', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'GovernorInvalidProposalLength',
  },
  {
    type: 'error',
    inputs: [
      { name: 'quorumNumerator', internalType: 'uint256', type: 'uint256' },
      { name: 'quorumDenominator', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'GovernorInvalidQuorumFraction',
  },
  {
    type: 'error',
    inputs: [{ name: 'voter', internalType: 'address', type: 'address' }],
    name: 'GovernorInvalidSignature',
  },
  { type: 'error', inputs: [], name: 'GovernorInvalidVoteParams' },
  { type: 'error', inputs: [], name: 'GovernorInvalidVoteType' },
  {
    type: 'error',
    inputs: [
      { name: 'votingPeriod', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'GovernorInvalidVotingPeriod',
  },
  {
    type: 'error',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'GovernorNonexistentProposal',
  },
  {
    type: 'error',
    inputs: [{ name: 'proposalId', internalType: 'uint256', type: 'uint256' }],
    name: 'GovernorNotQueuedProposal',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'GovernorOnlyExecutor',
  },
  { type: 'error', inputs: [], name: 'GovernorQueueNotImplemented' },
  {
    type: 'error',
    inputs: [{ name: 'proposer', internalType: 'address', type: 'address' }],
    name: 'GovernorRestrictedProposer',
  },
  {
    type: 'error',
    inputs: [
      { name: 'proposalId', internalType: 'uint256', type: 'uint256' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'GovernorUnableToCancel',
  },
  {
    type: 'error',
    inputs: [
      { name: 'proposalId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'current',
        internalType: 'enum IGovernor.ProposalState',
        type: 'uint8',
      },
      { name: 'expectedStates', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'GovernorUnexpectedProposalState',
  },
  {
    type: 'error',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'currentNonce', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InvalidAccountNonce',
  },
  { type: 'error', inputs: [], name: 'InvalidInitialization' },
  { type: 'error', inputs: [], name: 'NotInitializing' },
  {
    type: 'error',
    inputs: [
      { name: 'bits', internalType: 'uint8', type: 'uint8' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'SafeCastOverflowedUintDowncast',
  },
  { type: 'error', inputs: [], name: 'UUPSUnauthorizedCallContext' },
  {
    type: 'error',
    inputs: [{ name: 'slot', internalType: 'bytes32', type: 'bytes32' }],
    name: 'UUPSUnsupportedProxiableUUID',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CommitmentsTimelock
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const commitmentsTimelockAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  { type: 'receive', stateMutability: 'payable' },
  {
    type: 'function',
    inputs: [],
    name: 'CANCELLER_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'EXECUTOR_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PROPOSER_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'cancel',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'target', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'payload', internalType: 'bytes', type: 'bytes' },
      { name: 'predecessor', internalType: 'bytes32', type: 'bytes32' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'targets', internalType: 'address[]', type: 'address[]' },
      { name: 'values', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'payloads', internalType: 'bytes[]', type: 'bytes[]' },
      { name: 'predecessor', internalType: 'bytes32', type: 'bytes32' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeBatch',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getMinDelay',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'getOperationState',
    outputs: [
      {
        name: '',
        internalType: 'enum TimelockControllerUpgradeable.OperationState',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'role', internalType: 'bytes32', type: 'bytes32' }],
    name: 'getRoleAdmin',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'getTimestamp',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'hasRole',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'target', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
      { name: 'predecessor', internalType: 'bytes32', type: 'bytes32' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'hashOperation',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'targets', internalType: 'address[]', type: 'address[]' },
      { name: 'values', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'payloads', internalType: 'bytes[]', type: 'bytes[]' },
      { name: 'predecessor', internalType: 'bytes32', type: 'bytes32' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'hashOperationBatch',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'minDelay', internalType: 'uint256', type: 'uint256' },
      { name: 'proposers', internalType: 'address[]', type: 'address[]' },
      { name: 'executors', internalType: 'address[]', type: 'address[]' },
      { name: 'admin', internalType: 'address', type: 'address' },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'isOperation',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'isOperationDone',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'isOperationPending',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'isOperationReady',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'uint256[]', type: 'uint256[]' },
      { name: '', internalType: 'uint256[]', type: 'uint256[]' },
      { name: '', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'onERC1155BatchReceived',
    outputs: [{ name: '', internalType: 'bytes4', type: 'bytes4' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'onERC1155Received',
    outputs: [{ name: '', internalType: 'bytes4', type: 'bytes4' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'onERC721Received',
    outputs: [{ name: '', internalType: 'bytes4', type: 'bytes4' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'callerConfirmation', internalType: 'address', type: 'address' },
    ],
    name: 'renounceRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'revokeRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'target', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
      { name: 'predecessor', internalType: 'bytes32', type: 'bytes32' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'delay', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'schedule',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'targets', internalType: 'address[]', type: 'address[]' },
      { name: 'values', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'payloads', internalType: 'bytes[]', type: 'bytes[]' },
      { name: 'predecessor', internalType: 'bytes32', type: 'bytes32' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'delay', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'scheduleBatch',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'newDelay', internalType: 'uint256', type: 'uint256' }],
    name: 'updateDelay',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'id', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'index',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'target',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'data', internalType: 'bytes', type: 'bytes', indexed: false },
    ],
    name: 'CallExecuted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'id', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'salt',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'CallSalt',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'id', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'index',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'target',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'data', internalType: 'bytes', type: 'bytes', indexed: false },
      {
        name: 'predecessor',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'delay',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'CallScheduled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'id', internalType: 'bytes32', type: 'bytes32', indexed: true },
    ],
    name: 'Cancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'version',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'Initialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldDuration',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newDuration',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MinDelayChange',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'previousAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'newAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'RoleAdminChanged',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleGranted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleRevoked',
  },
  { type: 'error', inputs: [], name: 'AccessControlBadConfirmation' },
  {
    type: 'error',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'neededRole', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'AccessControlUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'FailedCall' },
  { type: 'error', inputs: [], name: 'InvalidInitialization' },
  { type: 'error', inputs: [], name: 'NotInitializing' },
  {
    type: 'error',
    inputs: [
      { name: 'delay', internalType: 'uint256', type: 'uint256' },
      { name: 'minDelay', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'TimelockInsufficientDelay',
  },
  {
    type: 'error',
    inputs: [
      { name: 'targets', internalType: 'uint256', type: 'uint256' },
      { name: 'payloads', internalType: 'uint256', type: 'uint256' },
      { name: 'values', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'TimelockInvalidOperationLength',
  },
  {
    type: 'error',
    inputs: [{ name: 'caller', internalType: 'address', type: 'address' }],
    name: 'TimelockUnauthorizedCaller',
  },
  {
    type: 'error',
    inputs: [
      { name: 'predecessorId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'TimelockUnexecutedPredecessor',
  },
  {
    type: 'error',
    inputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
      { name: 'expectedStates', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'TimelockUnexpectedOperationState',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CommitmentsVault
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const commitmentsVaultAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [],
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MAX_METADATA_URI_LENGTH',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PAUSER_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'UNPAUSER_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'UPGRADE_INTERFACE_VERSION',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'asset',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'shares', internalType: 'uint256', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'assets', internalType: 'uint256', type: 'uint256' }],
    name: 'convertToShares',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'assets', internalType: 'uint256', type: 'uint256' },
      { name: 'receiver', internalType: 'address', type: 'address' },
    ],
    name: 'deposit',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'depositsPaused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'assets', internalType: 'uint256', type: 'uint256' }],
    name: 'donate',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'factoryTypeId',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getMetadata',
    outputs: [
      {
        name: '',
        internalType: 'struct ICommitmentsVault.VaultMetadata',
        type: 'tuple',
        components: [
          { name: 'uri', internalType: 'string', type: 'string' },
          { name: 'contentHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'updatedAt', internalType: 'uint64', type: 'uint64' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'role', internalType: 'bytes32', type: 'bytes32' }],
    name: 'getRoleAdmin',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'hasRole',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'asset_', internalType: 'contract IERC20', type: 'address' },
      { name: 'name_', internalType: 'string', type: 'string' },
      { name: 'symbol_', internalType: 'string', type: 'string' },
      { name: 'admin_', internalType: 'address', type: 'address' },
      { name: 'yieldStrategy_', internalType: 'address', type: 'address' },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'maxDeposit',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'maxMint',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'maxRedeem',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'maxWithdraw',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'shares', internalType: 'uint256', type: 'uint256' },
      { name: 'receiver', internalType: 'address', type: 'address' },
    ],
    name: 'mint',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pauseDeposits',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'assets', internalType: 'uint256', type: 'uint256' }],
    name: 'previewDeposit',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'shares', internalType: 'uint256', type: 'uint256' }],
    name: 'previewMint',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'shares', internalType: 'uint256', type: 'uint256' }],
    name: 'previewRedeem',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'assets', internalType: 'uint256', type: 'uint256' }],
    name: 'previewWithdraw',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'proxiableUUID',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'shares', internalType: 'uint256', type: 'uint256' },
      { name: 'receiver', internalType: 'address', type: 'address' },
      { name: 'owner', internalType: 'address', type: 'address' },
    ],
    name: 'redeem',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'callerConfirmation', internalType: 'address', type: 'address' },
    ],
    name: 'renounceRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'revokeRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'uri', internalType: 'string', type: 'string' },
      { name: 'contentHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'setMetadata',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'yieldStrategy_', internalType: 'address', type: 'address' },
    ],
    name: 'setYieldStrategy',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalAssets',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'unpauseDeposits',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newImplementation', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'upgradeToAndCall',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'assets', internalType: 'uint256', type: 'uint256' },
      { name: 'receiver', internalType: 'address', type: 'address' },
      { name: 'owner', internalType: 'address', type: 'address' },
    ],
    name: 'withdraw',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'yieldStrategy',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'assets',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'shares',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Deposit',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'paused', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'DepositsPauseToggled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'donor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'assets',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Donation',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'version',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'Initialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'previousAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'newAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'RoleAdminChanged',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleGranted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleRevoked',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Transfer',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'implementation',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Upgraded',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'uri', internalType: 'string', type: 'string', indexed: false },
      {
        name: 'contentHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'timestamp',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'VaultMetadataUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'receiver',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'assets',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'shares',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Withdraw',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldStrategy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newStrategy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'YieldStrategyUpdated',
  },
  { type: 'error', inputs: [], name: 'AccessControlBadConfirmation' },
  {
    type: 'error',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'neededRole', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'AccessControlUnauthorizedAccount',
  },
  {
    type: 'error',
    inputs: [{ name: 'target', internalType: 'address', type: 'address' }],
    name: 'AddressEmptyCode',
  },
  {
    type: 'error',
    inputs: [
      { name: 'implementation', internalType: 'address', type: 'address' },
    ],
    name: 'ERC1967InvalidImplementation',
  },
  { type: 'error', inputs: [], name: 'ERC1967NonPayable' },
  {
    type: 'error',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'allowance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientAllowance',
  },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientBalance',
  },
  {
    type: 'error',
    inputs: [{ name: 'approver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidApprover',
  },
  {
    type: 'error',
    inputs: [{ name: 'receiver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidReceiver',
  },
  {
    type: 'error',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSender',
  },
  {
    type: 'error',
    inputs: [{ name: 'spender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSpender',
  },
  {
    type: 'error',
    inputs: [
      { name: 'receiver', internalType: 'address', type: 'address' },
      { name: 'assets', internalType: 'uint256', type: 'uint256' },
      { name: 'max', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC4626ExceededMaxDeposit',
  },
  {
    type: 'error',
    inputs: [
      { name: 'receiver', internalType: 'address', type: 'address' },
      { name: 'shares', internalType: 'uint256', type: 'uint256' },
      { name: 'max', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC4626ExceededMaxMint',
  },
  {
    type: 'error',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'shares', internalType: 'uint256', type: 'uint256' },
      { name: 'max', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC4626ExceededMaxRedeem',
  },
  {
    type: 'error',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'assets', internalType: 'uint256', type: 'uint256' },
      { name: 'max', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC4626ExceededMaxWithdraw',
  },
  { type: 'error', inputs: [], name: 'FailedCall' },
  { type: 'error', inputs: [], name: 'InvalidInitialization' },
  { type: 'error', inputs: [], name: 'NotInitializing' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  {
    type: 'error',
    inputs: [
      { name: 'strategy', internalType: 'address', type: 'address' },
      { name: 'assets', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'StrategyHasAssets',
  },
  { type: 'error', inputs: [], name: 'URITooLong' },
  { type: 'error', inputs: [], name: 'UUPSUnauthorizedCallContext' },
  {
    type: 'error',
    inputs: [{ name: 'slot', internalType: 'bytes32', type: 'bytes32' }],
    name: 'UUPSUnsupportedProxiableUUID',
  },
  { type: 'error', inputs: [], name: 'WrongStrategyAsset' },
  { type: 'error', inputs: [], name: 'WrongStrategyVault' },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
  { type: 'error', inputs: [], name: 'ZeroAmount' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ERC8004IdentityRegistryDev
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const erc8004IdentityRegistryDevAbi = [
  {
    type: 'function',
    inputs: [],
    name: 'UPGRADE_INTERFACE_VERSION',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'eip712Domain',
    outputs: [
      { name: 'fields', internalType: 'bytes1', type: 'bytes1' },
      { name: 'name', internalType: 'string', type: 'string' },
      { name: 'version', internalType: 'string', type: 'string' },
      { name: 'chainId', internalType: 'uint256', type: 'uint256' },
      { name: 'verifyingContract', internalType: 'address', type: 'address' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'extensions', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'agentId', internalType: 'uint256', type: 'uint256' }],
    name: 'getAgentWallet',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'tokenId', internalType: 'uint256', type: 'uint256' }],
    name: 'getApproved',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'agentId', internalType: 'uint256', type: 'uint256' },
      { name: 'metadataKey', internalType: 'string', type: 'string' },
    ],
    name: 'getMetadata',
    outputs: [{ name: '', internalType: 'bytes', type: 'bytes' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getVersion',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'owner_', internalType: 'address', type: 'address' }],
    name: 'initializeDev',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'operator', internalType: 'address', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'agentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'isAuthorizedOrOwner',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'tokenId', internalType: 'uint256', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'proxiableUUID',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'register',
    outputs: [{ name: 'agentId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'agentURI', internalType: 'string', type: 'string' },
      {
        name: 'metadata',
        internalType: 'struct IdentityRegistryUpgradeable.MetadataEntry[]',
        type: 'tuple[]',
        components: [
          { name: 'metadataKey', internalType: 'string', type: 'string' },
          { name: 'metadataValue', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    name: 'register',
    outputs: [{ name: 'agentId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'agentURI', internalType: 'string', type: 'string' }],
    name: 'register',
    outputs: [{ name: 'agentId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'safeTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'safeTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'agentId', internalType: 'uint256', type: 'uint256' },
      { name: 'newURI', internalType: 'string', type: 'string' },
    ],
    name: 'setAgentURI',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'agentId', internalType: 'uint256', type: 'uint256' },
      { name: 'newWallet', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'setAgentWallet',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operator', internalType: 'address', type: 'address' },
      { name: 'approved', internalType: 'bool', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'agentId', internalType: 'uint256', type: 'uint256' },
      { name: 'metadataKey', internalType: 'string', type: 'string' },
      { name: 'metadataValue', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'setMetadata',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'tokenId', internalType: 'uint256', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'agentId', internalType: 'uint256', type: 'uint256' }],
    name: 'unsetAgentWallet',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newImplementation', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'upgradeToAndCall',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'approved',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'tokenId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'approved', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'ApprovalForAll',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: '_fromTokenId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: '_toTokenId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'BatchMetadataUpdate',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EIP712DomainChanged' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'version',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'Initialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'agentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'indexedMetadataKey',
        internalType: 'string',
        type: 'string',
        indexed: true,
      },
      {
        name: 'metadataKey',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'metadataValue',
        internalType: 'bytes',
        type: 'bytes',
        indexed: false,
      },
    ],
    name: 'MetadataSet',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: '_tokenId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MetadataUpdate',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'agentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'agentURI',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Registered',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'tokenId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'Transfer',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'agentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'newURI',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'updatedBy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'URIUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'implementation',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Upgraded',
  },
  {
    type: 'error',
    inputs: [{ name: 'target', internalType: 'address', type: 'address' }],
    name: 'AddressEmptyCode',
  },
  {
    type: 'error',
    inputs: [
      { name: 'implementation', internalType: 'address', type: 'address' },
    ],
    name: 'ERC1967InvalidImplementation',
  },
  { type: 'error', inputs: [], name: 'ERC1967NonPayable' },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
      { name: 'owner', internalType: 'address', type: 'address' },
    ],
    name: 'ERC721IncorrectOwner',
  },
  {
    type: 'error',
    inputs: [
      { name: 'operator', internalType: 'address', type: 'address' },
      { name: 'tokenId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC721InsufficientApproval',
  },
  {
    type: 'error',
    inputs: [{ name: 'approver', internalType: 'address', type: 'address' }],
    name: 'ERC721InvalidApprover',
  },
  {
    type: 'error',
    inputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    name: 'ERC721InvalidOperator',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'ERC721InvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'receiver', internalType: 'address', type: 'address' }],
    name: 'ERC721InvalidReceiver',
  },
  {
    type: 'error',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'ERC721InvalidSender',
  },
  {
    type: 'error',
    inputs: [{ name: 'tokenId', internalType: 'uint256', type: 'uint256' }],
    name: 'ERC721NonexistentToken',
  },
  { type: 'error', inputs: [], name: 'FailedCall' },
  { type: 'error', inputs: [], name: 'InvalidInitialization' },
  { type: 'error', inputs: [], name: 'NotInitializing' },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'UUPSUnauthorizedCallContext' },
  {
    type: 'error',
    inputs: [{ name: 'slot', internalType: 'bytes32', type: 'bytes32' }],
    name: 'UUPSUnsupportedProxiableUUID',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FanInNode
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fanInNodeAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [],
    name: 'consumer',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'factoryTypeId',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'consumer_', internalType: 'address', type: 'address' },
      { name: 'manager_', internalType: 'address', type: 'address' },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'inputDenoms',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'outputSources',
    outputs: [
      { name: 'provider', internalType: 'address', type: 'address' },
      { name: 'denomIn', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'provider', internalType: 'address', type: 'address' },
      { name: 'denomIn', internalType: 'bytes32', type: 'bytes32' },
      { name: 'denomOut', internalType: 'bytes32', type: 'bytes32' },
      { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
      { name: 'unbondingPeriod', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'registerProvider',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'denomOut', internalType: 'bytes32', type: 'bytes32' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'releaseStake',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'security',
    outputs: [
      { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
      { name: 'unbondingPeriod', internalType: 'uint64', type: 'uint64' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'provider', internalType: 'address', type: 'address' },
      { name: 'denomIn', internalType: 'bytes32', type: 'bytes32' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'stake',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'totalStake',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'provider',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'denomIn',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'denomOut',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'maxPenaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'unbondingPeriod',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'ProviderRegistered',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'provider',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'denomOut',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'StakeReleased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'provider',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'denomIn',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'denomOut',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Staked',
  },
  { type: 'error', inputs: [], name: 'AlreadyInitialized' },
  { type: 'error', inputs: [], name: 'DenomOutCollision' },
  { type: 'error', inputs: [], name: 'InputAlreadyRegistered' },
  { type: 'error', inputs: [], name: 'InsufficientStake' },
  { type: 'error', inputs: [], name: 'OnlyConsumer' },
  { type: 'error', inputs: [], name: 'OnlyManager' },
  { type: 'error', inputs: [], name: 'UnregisteredProvider' },
  { type: 'error', inputs: [], name: 'ZeroAmount' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FanOutNode
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fanOutNodeAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [],
    name: 'MAX_REWARD_TOKENS',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'stakeDenom', internalType: 'bytes32', type: 'bytes32' },
      { name: 'rewardToken', internalType: 'address', type: 'address' },
    ],
    name: 'claimRewards',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'stakeDenom', internalType: 'bytes32', type: 'bytes32' },
      { name: 'rewardToken', internalType: 'address', type: 'address' },
      { name: 'rewardAmount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'distributeRewards',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'factoryTypeId',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'staker', internalType: 'address', type: 'address' },
      { name: 'denom', internalType: 'bytes32', type: 'bytes32' },
      { name: 'consumer', internalType: 'address', type: 'address' },
    ],
    name: 'getLien',
    outputs: [
      {
        name: '',
        internalType: 'struct FanOutLien',
        type: 'tuple',
        components: [
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'exposure', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'staker', internalType: 'address', type: 'address' },
      { name: 'denom', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'getOutflows',
    outputs: [
      {
        name: '',
        internalType: 'struct Outflow[]',
        type: 'tuple[]',
        components: [
          { name: 'consumer', internalType: 'address', type: 'address' },
          { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'portionBps', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'staker', internalType: 'address', type: 'address' },
      { name: 'denom', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'getUserInfo',
    outputs: [
      {
        name: '',
        internalType: 'struct UserInfo',
        type: 'tuple',
        components: [
          { name: 'locked', internalType: 'uint256', type: 'uint256' },
          {
            name: 'totalForfeitable',
            internalType: 'uint256',
            type: 'uint256',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'provider_', internalType: 'address', type: 'address' },
      { name: 'manager_', internalType: 'address', type: 'address' },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'provider_', internalType: 'address', type: 'address' },
      { name: 'manager_', internalType: 'address', type: 'address' },
      { name: 'inputMaxPenaltyBps_', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'initializeWithPenalty',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'inputMaxPenaltyBps',
    outputs: [{ name: '', internalType: 'uint16', type: 'uint16' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    name: 'pendingRewards',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'provider',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'staker', internalType: 'address', type: 'address' },
      { name: 'denom', internalType: 'bytes32', type: 'bytes32' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'releaseStake',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    name: 'rewardDebt',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'bytes32', type: 'bytes32' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    name: 'rewardsPerShare',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'denom', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'outflows',
        internalType: 'struct Outflow[]',
        type: 'tuple[]',
        components: [
          { name: 'consumer', internalType: 'address', type: 'address' },
          { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'portionBps', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    name: 'setOutflows',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'denom', internalType: 'bytes32', type: 'bytes32' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'stake',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'totalStake',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'provider',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'manager',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Initialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'staker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'denom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'numConsumers',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'OutflowsSet',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'staker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'stakeDenom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'rewardToken',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'RewardsClaimed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'stakeDenom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'rewardToken',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'rewardAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'RewardsDistributed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'staker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'denom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'consumer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'StakeReleased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'staker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'denom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Staked',
  },
  { type: 'error', inputs: [], name: 'AlreadyInitialized' },
  { type: 'error', inputs: [], name: 'DuplicateConsumer' },
  { type: 'error', inputs: [], name: 'ExposureAllocationExceeded' },
  { type: 'error', inputs: [], name: 'InsufficientLien' },
  { type: 'error', inputs: [], name: 'InvalidPortionSum' },
  { type: 'error', inputs: [], name: 'OnlyProvider' },
  { type: 'error', inputs: [], name: 'OnlyRegisteredConsumer' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  { type: 'error', inputs: [], name: 'RewardTokenLimit' },
  { type: 'error', inputs: [], name: 'RewardTooSmall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'ZeroAmount' },
  { type: 'error', inputs: [], name: 'ZeroTotalStake' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FlatFeeAtCreate
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const flatFeeAtCreateAbi = [
  {
    type: 'constructor',
    inputs: [{ name: 'manager_', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'ctx',
        internalType: 'struct ClaimContext',
        type: 'tuple',
        components: [
          {
            name: 'base',
            internalType: 'struct BaseContext',
            type: 'tuple',
            components: [
              {
                name: 'commitmentId',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'adapter', internalType: 'address', type: 'address' },
              { name: 'token', internalType: 'address', type: 'address' },
              { name: 'committer', internalType: 'address', type: 'address' },
              {
                name: 'counterparty',
                internalType: 'address',
                type: 'address',
              },
              {
                name: 'currentEncumbered',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'timestamp', internalType: 'uint64', type: 'uint64' },
            ],
          },
          { name: 'caller', internalType: 'address', type: 'address' },
          { name: 'closedAt', internalType: 'uint64', type: 'uint64' },
        ],
      },
      { name: '', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'claim',
    outputs: [
      {
        name: '',
        internalType: 'struct TokenMovement[]',
        type: 'tuple[]',
        components: [
          { name: 'kind', internalType: 'enum MovementKind', type: 'uint8' },
          { name: 'from', internalType: 'address', type: 'address' },
          { name: 'to', internalType: 'address', type: 'address' },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'units', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'committer', internalType: 'address', type: 'address' },
      { name: 'token', internalType: 'address', type: 'address' },
    ],
    name: 'creditOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: '',
        internalType: 'struct DistributeContext',
        type: 'tuple',
        components: [
          {
            name: 'base',
            internalType: 'struct BaseContext',
            type: 'tuple',
            components: [
              {
                name: 'commitmentId',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'adapter', internalType: 'address', type: 'address' },
              { name: 'token', internalType: 'address', type: 'address' },
              { name: 'committer', internalType: 'address', type: 'address' },
              {
                name: 'counterparty',
                internalType: 'address',
                type: 'address',
              },
              {
                name: 'currentEncumbered',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'timestamp', internalType: 'uint64', type: 'uint64' },
            ],
          },
          { name: 'caller', internalType: 'address', type: 'address' },
        ],
      },
    ],
    name: 'distribute',
    outputs: [
      {
        name: '',
        internalType: 'struct TokenMovement[]',
        type: 'tuple[]',
        components: [
          { name: 'kind', internalType: 'enum MovementKind', type: 'uint8' },
          { name: 'from', internalType: 'address', type: 'address' },
          { name: 'to', internalType: 'address', type: 'address' },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'units', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'feeOf',
    outputs: [
      { name: 'fee', internalType: 'uint256', type: 'uint256' },
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'collected', internalType: 'bool', type: 'bool' },
      { name: 'bound', internalType: 'bool', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'ctx',
        internalType: 'struct CreatedContext',
        type: 'tuple',
        components: [
          {
            name: 'base',
            internalType: 'struct BaseContext',
            type: 'tuple',
            components: [
              {
                name: 'commitmentId',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'adapter', internalType: 'address', type: 'address' },
              { name: 'token', internalType: 'address', type: 'address' },
              { name: 'committer', internalType: 'address', type: 'address' },
              {
                name: 'counterparty',
                internalType: 'address',
                type: 'address',
              },
              {
                name: 'currentEncumbered',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'timestamp', internalType: 'uint64', type: 'uint64' },
            ],
          },
          { name: 'originalAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'maxPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          { name: 'strategyParams', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    name: 'onCommitmentCreated',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: '',
        internalType: 'struct ForfeitContext',
        type: 'tuple',
        components: [
          {
            name: 'base',
            internalType: 'struct BaseContext',
            type: 'tuple',
            components: [
              {
                name: 'commitmentId',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'adapter', internalType: 'address', type: 'address' },
              { name: 'token', internalType: 'address', type: 'address' },
              { name: 'committer', internalType: 'address', type: 'address' },
              {
                name: 'counterparty',
                internalType: 'address',
                type: 'address',
              },
              {
                name: 'currentEncumbered',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'timestamp', internalType: 'uint64', type: 'uint64' },
            ],
          },
          { name: 'penaltyBps', internalType: 'uint16', type: 'uint16' },
          {
            name: 'forfeitRecipient',
            internalType: 'address',
            type: 'address',
          },
          { name: 'forfeitedUnits', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    name: 'onCommitmentForfeited',
    outputs: [
      {
        name: '',
        internalType: 'struct TokenMovement[]',
        type: 'tuple[]',
        components: [
          { name: 'kind', internalType: 'enum MovementKind', type: 'uint8' },
          { name: 'from', internalType: 'address', type: 'address' },
          { name: 'to', internalType: 'address', type: 'address' },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'units', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: '',
        internalType: 'struct LifecycleContext',
        type: 'tuple',
        components: [
          {
            name: 'base',
            internalType: 'struct BaseContext',
            type: 'tuple',
            components: [
              {
                name: 'commitmentId',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'adapter', internalType: 'address', type: 'address' },
              { name: 'token', internalType: 'address', type: 'address' },
              { name: 'committer', internalType: 'address', type: 'address' },
              {
                name: 'counterparty',
                internalType: 'address',
                type: 'address',
              },
              {
                name: 'currentEncumbered',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'timestamp', internalType: 'uint64', type: 'uint64' },
            ],
          },
        ],
      },
    ],
    name: 'onCommitmentReleased',
    outputs: [
      {
        name: '',
        internalType: 'struct TokenMovement[]',
        type: 'tuple[]',
        components: [
          { name: 'kind', internalType: 'enum MovementKind', type: 'uint8' },
          { name: 'from', internalType: 'address', type: 'address' },
          { name: 'to', internalType: 'address', type: 'address' },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'units', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'ctx',
        internalType: 'struct ClaimContext',
        type: 'tuple',
        components: [
          {
            name: 'base',
            internalType: 'struct BaseContext',
            type: 'tuple',
            components: [
              {
                name: 'commitmentId',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'adapter', internalType: 'address', type: 'address' },
              { name: 'token', internalType: 'address', type: 'address' },
              { name: 'committer', internalType: 'address', type: 'address' },
              {
                name: 'counterparty',
                internalType: 'address',
                type: 'address',
              },
              {
                name: 'currentEncumbered',
                internalType: 'uint256',
                type: 'uint256',
              },
              { name: 'timestamp', internalType: 'uint64', type: 'uint64' },
            ],
          },
          { name: 'caller', internalType: 'address', type: 'address' },
          { name: 'closedAt', internalType: 'uint64', type: 'uint64' },
        ],
      },
      { name: '', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'pending',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'committer', internalType: 'address', type: 'address' },
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'prefund',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'refundUnallocated',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'committer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'CreditRefunded',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'strategy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'context',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'DistributionPaid',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'funder',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'committer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Prefunded',
  },
  {
    type: 'error',
    inputs: [
      { name: 'required', internalType: 'uint256', type: 'uint256' },
      { name: 'available', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'FeeNotFunded',
  },
  {
    type: 'error',
    inputs: [
      { name: 'requested', internalType: 'uint256', type: 'uint256' },
      { name: 'available', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientCredit',
  },
  { type: 'error', inputs: [], name: 'NotAuthorized' },
  { type: 'error', inputs: [], name: 'NotBound' },
  { type: 'error', inputs: [], name: 'NothingToClaim' },
  { type: 'error', inputs: [], name: 'OnlyManager' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
  { type: 'error', inputs: [], name: 'ZeroAmount' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// GovernorFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const governorFactoryAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'governorImpl_', internalType: 'address', type: 'address' },
      { name: 'timelockImpl_', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'canonicalGovernor',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'cfg',
        internalType: 'struct GovernorFactory.DAOConfig',
        type: 'tuple',
        components: [
          { name: 'name', internalType: 'string', type: 'string' },
          {
            name: 'source',
            internalType: 'contract IVotingPowerSource',
            type: 'address',
          },
          {
            name: 'timelockMinDelay',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'votingDelay', internalType: 'uint48', type: 'uint48' },
          { name: 'votingPeriod', internalType: 'uint32', type: 'uint32' },
          {
            name: 'proposalThreshold',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'quorumNumerator', internalType: 'uint256', type: 'uint256' },
          {
            name: 'lateQuorumExtension',
            internalType: 'uint48',
            type: 'uint48',
          },
        ],
      },
    ],
    name: 'deploy',
    outputs: [
      {
        name: 'dao',
        internalType: 'struct GovernorFactory.DAODeployment',
        type: 'tuple',
        components: [
          { name: 'governor', internalType: 'address', type: 'address' },
          { name: 'timelock', internalType: 'address', type: 'address' },
          { name: 'shim', internalType: 'address', type: 'address' },
          { name: 'source', internalType: 'address', type: 'address' },
          { name: 'name', internalType: 'string', type: 'string' },
          { name: 'deployedAtBlock', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'deployer',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'governorImpl',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'governor', internalType: 'address', type: 'address' }],
    name: 'setCanonicalGovernor',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'timelockImpl',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'governor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'CanonicalGovernorSet',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'governor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'timelock',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'shim', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'source',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      { name: 'name', internalType: 'string', type: 'string', indexed: false },
    ],
    name: 'GovernorDeployed',
  },
  { type: 'error', inputs: [], name: 'CanonicalAlreadySet' },
  { type: 'error', inputs: [], name: 'FailedDeployment' },
  {
    type: 'error',
    inputs: [
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientBalance',
  },
  { type: 'error', inputs: [], name: 'NotDeployer' },
  { type: 'error', inputs: [], name: 'UnknownGovernor' },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LinkedMutualPolicy
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const linkedMutualPolicyAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'manager_', internalType: 'address', type: 'address' },
      { name: 'scheduler_', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      { name: 'notional', internalType: 'uint256', type: 'uint256' },
      { name: 'duration', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'bindCover',
    outputs: [{ name: 'bindingId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'bindingId', internalType: 'uint256', type: 'uint256' }],
    name: 'expireBinding',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      { name: 'duration', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'fundStandby',
    outputs: [{ name: 'premium', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'getActiveNotionalSold',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'bindingId', internalType: 'uint256', type: 'uint256' }],
    name: 'getCoverBinding',
    outputs: [
      {
        name: '',
        internalType: 'struct ILinkedMutualPolicy.CoverBinding',
        type: 'tuple',
        components: [
          { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
          { name: 'notional', internalType: 'uint256', type: 'uint256' },
          { name: 'expiry', internalType: 'uint64', type: 'uint64' },
          { name: 'policyholder', internalType: 'address', type: 'address' },
          { name: 'premiumPaid', internalType: 'uint256', type: 'uint256' },
          { name: 'active', internalType: 'bool', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [
      {
        name: '',
        internalType: 'contract ICommitmentManager',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'nextBindingId',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'scheduler',
    outputs: [
      { name: '', internalType: 'contract PremiumScheduler', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'bindingId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'notional',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'BindingExpired',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'bindingId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'policyholder',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'notional',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'expiry',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'premiumPaid',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'CoverBound',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'funder',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'premiumPaid',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'duration',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'StandbyFunded',
  },
  { type: 'error', inputs: [], name: 'BindingInactive' },
  { type: 'error', inputs: [], name: 'BindingNotExpired' },
  { type: 'error', inputs: [], name: 'NoStandbyCapacity' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'UnknownBinding' },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
  { type: 'error', inputs: [], name: 'ZeroNotional' },
  { type: 'error', inputs: [], name: 'ZeroPremiumQuote' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ManualArbiter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const manualArbiterAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'owner_', internalType: 'address', type: 'address' },
      { name: 'manager_', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'acceptOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'activateMutual',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'arbiterCapabilities',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'arbiterMetadataURI',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'cancelForfeit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'cancelMutualLoss',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'commitmentManager',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'agreementId', internalType: 'uint256', type: 'uint256' },
      { name: 'penaltyBps', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'forfeitAgreement',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'penaltyBps', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'initiateForfeit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      { name: 'lossNumeraire', internalType: 'uint256', type: 'uint256' },
      { name: 'evidenceHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'initiateMutualLoss',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [
      {
        name: '',
        internalType: 'contract ICommitmentManager',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingOwner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'release',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'agreementId', internalType: 'uint256', type: 'uint256' }],
    name: 'releaseAgreement',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'uri', internalType: 'string', type: 'string' }],
    name: 'setMetadataURI',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'agreementId', internalType: 'uint256', type: 'uint256' },
      { name: 'fromProposer', internalType: 'bool', type: 'bool' },
      { name: 'units', internalType: 'uint256', type: 'uint256' },
      { name: 'evidenceHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'settleAgreement',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'uri', internalType: 'string', type: 'string', indexed: false },
    ],
    name: 'MetadataURIUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferStarted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'error',
    inputs: [
      { name: 'required', internalType: 'uint64', type: 'uint64' },
      { name: 'actual', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'ChallengeWindowTooShort',
  },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'CommitmentNotActive',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  {
    type: 'error',
    inputs: [
      { name: 'expected', internalType: 'address', type: 'address' },
      { name: 'actual', internalType: 'address', type: 'address' },
    ],
    name: 'WrongArbiter',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MeshFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const meshFactoryAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_fanInImpl', internalType: 'address', type: 'address' },
      { name: '_fanOutImpl', internalType: 'address', type: 'address' },
      { name: '_tokenWeightingImpl', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'blacklist',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'consumer', internalType: 'address', type: 'address' },
      { name: 'manager', internalType: 'address', type: 'address' },
    ],
    name: 'deployFanIn',
    outputs: [{ name: 'clone', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'consumer', internalType: 'address', type: 'address' },
      { name: 'manager', internalType: 'address', type: 'address' },
    ],
    name: 'deployFanInAt',
    outputs: [{ name: 'clone', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'provider', internalType: 'address', type: 'address' },
      { name: 'manager', internalType: 'address', type: 'address' },
    ],
    name: 'deployFanOut',
    outputs: [{ name: 'clone', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'provider', internalType: 'address', type: 'address' },
      { name: 'manager', internalType: 'address', type: 'address' },
    ],
    name: 'deployFanOutAt',
    outputs: [{ name: 'clone', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'provider', internalType: 'address', type: 'address' },
      { name: 'governance', internalType: 'address', type: 'address' },
    ],
    name: 'deployTokenWeighting',
    outputs: [{ name: 'clone', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'provider', internalType: 'address', type: 'address' },
      { name: 'governance', internalType: 'address', type: 'address' },
    ],
    name: 'deployTokenWeightingAt',
    outputs: [{ name: 'clone', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'fanInImpl',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'fanOutImpl',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'implementationTypeId',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'isBlacklisted',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'isWhitelisted',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'data', internalType: 'bytes[]', type: 'bytes[]' }],
    name: 'multicall',
    outputs: [{ name: 'results', internalType: 'bytes[]', type: 'bytes[]' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'salt', internalType: 'bytes32', type: 'bytes32' }],
    name: 'predictFanInAddress',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'salt', internalType: 'bytes32', type: 'bytes32' }],
    name: 'predictFanOutAddress',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'salt', internalType: 'bytes32', type: 'bytes32' }],
    name: 'predictTokenWeightingAddress',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'tokenWeightingImpl',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'impl', internalType: 'address', type: 'address' },
      { name: 'expectedTypeId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'whitelistImplementation',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'impl', internalType: 'address', type: 'address', indexed: true },
    ],
    name: 'ImplementationBlacklisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'impl', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'typeId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'ImplementationWhitelisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'impl', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'clone',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'nodeType',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
    ],
    name: 'NodeDeployed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'error',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'AlreadyWhitelisted',
  },
  {
    type: 'error',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'Blacklisted',
  },
  { type: 'error', inputs: [], name: 'FailedDeployment' },
  {
    type: 'error',
    inputs: [
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientBalance',
  },
  {
    type: 'error',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'NotWhitelisted',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  {
    type: 'error',
    inputs: [
      { name: 'impl', internalType: 'address', type: 'address' },
      { name: 'expected', internalType: 'bytes32', type: 'bytes32' },
      { name: 'actual', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'TypeIdMismatch',
  },
  { type: 'error', inputs: [], name: 'ZeroImplementation' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MockStrategy
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const mockStrategyAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'asset_', internalType: 'address', type: 'address' },
      { name: 'vault_', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'asset',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'assets', internalType: 'uint256', type: 'uint256' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'maxDeposit',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'val', internalType: 'uint256', type: 'uint256' }],
    name: 'setMaxDeposit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    name: 'simulateLoss',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    name: 'simulateYield',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalAssets',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'vault',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'assets', internalType: 'uint256', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MutualRegistry
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const mutualRegistryAbi = [
  {
    type: 'constructor',
    inputs: [{ name: 'manager_', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MAX_PERIL_URI_LENGTH',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'allMutualIds',
    outputs: [{ name: '', internalType: 'uint256[]', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'capacity',
    outputs: [
      { name: 'filled', internalType: 'uint128', type: 'uint128' },
      { name: 'target', internalType: 'uint128', type: 'uint128' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'getMutualListing',
    outputs: [
      {
        name: 's',
        internalType: 'struct MutualRegistry.MutualListing',
        type: 'tuple',
        components: [
          { name: 'creator', internalType: 'address', type: 'address' },
          { name: 'targetCapacity', internalType: 'uint128', type: 'uint128' },
          { name: 'termEnd', internalType: 'uint64', type: 'uint64' },
          { name: 'perilURI', internalType: 'string', type: 'string' },
          { name: 'perilHash', internalType: 'bytes32', type: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'isFilled',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [
      {
        name: '',
        internalType: 'contract ICommitmentManager',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'mutualCount',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'params',
        internalType: 'struct ICommitmentManager.MutualParams',
        type: 'tuple',
        components: [
          { name: 'arbiter', internalType: 'address', type: 'address' },
          { name: 'numeraire', internalType: 'address', type: 'address' },
          { name: 'beneficiary', internalType: 'address', type: 'address' },
          { name: 'challengeWindow', internalType: 'uint64', type: 'uint64' },
          {
            name: 'deallocationWindow',
            internalType: 'uint64',
            type: 'uint64',
          },
        ],
      },
      { name: 'targetCapacity', internalType: 'uint128', type: 'uint128' },
      { name: 'termEnd', internalType: 'uint64', type: 'uint64' },
      { name: 'perilURI', internalType: 'string', type: 'string' },
      { name: 'perilHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'registerMutual',
    outputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'creator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'beneficiary',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'numeraire',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'targetCapacity',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'termEnd',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'perilURI',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'perilHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'MutualRegistered',
  },
  { type: 'error', inputs: [], name: 'AlreadyRegistered' },
  { type: 'error', inputs: [], name: 'URITooLong' },
  { type: 'error', inputs: [], name: 'UnknownMutual' },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// OperatorRegistry
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const operatorRegistryAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [],
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'DELEGATE_TYPEHASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MAX_METADATA_URI_LENGTH',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'REGISTER_TYPEHASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'UPGRADE_INTERFACE_VERSION',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'commitmentManager',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operator', internalType: 'address', type: 'address' },
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'delegate',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'staker', internalType: 'address', type: 'address' },
      { name: 'operator', internalType: 'address', type: 'address' },
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'nonce', internalType: 'uint256', type: 'uint256' },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'delegateWithSig',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'deregister',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'eip712Domain',
    outputs: [
      { name: 'fields', internalType: 'bytes1', type: 'bytes1' },
      { name: 'name', internalType: 'string', type: 'string' },
      { name: 'version', internalType: 'string', type: 'string' },
      { name: 'chainId', internalType: 'uint256', type: 'uint256' },
      { name: 'verifyingContract', internalType: 'address', type: 'address' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'extensions', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'index', internalType: 'uint256', type: 'uint256' }],
    name: 'entity',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getAcceptancePolicy',
    outputs: [
      { name: 'arbiter', internalType: 'address', type: 'address' },
      { name: 'floor', internalType: 'uint16', type: 'uint16' },
      { name: 'token', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    name: 'getOperator',
    outputs: [
      {
        name: '',
        internalType: 'struct IOperatorRegistry.Operator',
        type: 'tuple',
        components: [
          { name: 'operator', internalType: 'address', type: 'address' },
          { name: 'registeredAt', internalType: 'uint64', type: 'uint64' },
          { name: 'active', internalType: 'bool', type: 'bool' },
          {
            name: 'selfStakeCommitmentId',
            internalType: 'uint256',
            type: 'uint256',
          },
          {
            name: 'totalDelegatedStake',
            internalType: 'uint256',
            type: 'uint256',
          },
          {
            name: 'activeDelegationCount',
            internalType: 'uint32',
            type: 'uint32',
          },
          { name: 'selfStakeActive', internalType: 'bool', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getOperatorCount',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    name: 'getOperatorMetadata',
    outputs: [
      {
        name: '',
        internalType: 'struct IOperatorRegistry.OperatorMetadata',
        type: 'tuple',
        components: [
          { name: 'uri', internalType: 'string', type: 'string' },
          { name: 'contentHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'updatedAt', internalType: 'uint64', type: 'uint64' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getOperatorSet',
    outputs: [{ name: '', internalType: 'address[]', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'role', internalType: 'bytes32', type: 'bytes32' }],
    name: 'getRoleAdmin',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'hasRole',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'increaseNonce',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentManager_', internalType: 'address', type: 'address' },
      { name: 'minOperatorStake_', internalType: 'uint256', type: 'uint256' },
      {
        name: 'maxDelegationsPerOperator_',
        internalType: 'uint256',
        type: 'uint256',
      },
      { name: 'admin_', internalType: 'address', type: 'address' },
      { name: 'requiredArbiter_', internalType: 'address', type: 'address' },
      { name: 'minMaxPenaltyBps_', internalType: 'uint16', type: 'uint16' },
      { name: 'requiredToken_', internalType: 'address', type: 'address' },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'isEntity',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    name: 'isOperator',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'strategy', internalType: 'address', type: 'address' }],
    name: 'isStrategyAllowed',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'maxDelegationsPerOperator',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'minOperatorStake',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'data', internalType: 'bytes[]', type: 'bytes[]' }],
    name: 'multicall',
    outputs: [{ name: 'results', internalType: 'bytes[]', type: 'bytes[]' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'forfeitedAmount', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'onDelegationForfeited',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'onDelegationReleased',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    name: 'operatorFanIn',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'operatorForCommitment',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'proxiableUUID',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'reconcile',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'register',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operator', internalType: 'address', type: 'address' },
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'nonce', internalType: 'uint256', type: 'uint256' },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'registerWithSig',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'callerConfirmation', internalType: 'address', type: 'address' },
    ],
    name: 'renounceRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'revokeRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'max_', internalType: 'uint256', type: 'uint256' }],
    name: 'setMaxDelegationsPerOperator',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'tokenWeighting_', internalType: 'address', type: 'address' },
      { name: 'meshFactory_', internalType: 'address', type: 'address' },
    ],
    name: 'setMeshWiring',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'minStake_', internalType: 'uint256', type: 'uint256' }],
    name: 'setMinOperatorStake',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'uri', internalType: 'string', type: 'string' },
      { name: 'contentHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'setOperatorMetadata',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'strategy', internalType: 'address', type: 'address' },
      { name: 'allowed', internalType: 'bool', type: 'bool' },
    ],
    name: 'setStrategyAllowed',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'sigNonces',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'stakeDenom',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'payTo', internalType: 'address', type: 'address' },
    ],
    name: 'sweepForfeitProceeds',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newFloor', internalType: 'uint16', type: 'uint16' }],
    name: 'tightenPolicy',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'tokenWeighting',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalEntities',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'trackedCommitmentCount',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newImplementation', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'upgradeToAndCall',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldFloor',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'newFloor',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
    ],
    name: 'AcceptancePolicyTightened',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'staker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'DelegationCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'staker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'forfeitedAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'DelegationForfeited',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'staker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'DelegationReleased',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EIP712DomainChanged' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'forfeitedAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ForfeitRecipientPending',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'payTo',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ForfeitRecipientSwept',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'version',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'Initialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldValue',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newValue',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MaxDelegationsPerOperatorUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'tokenWeighting',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'meshFactory',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'MeshWired',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldValue',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newValue',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MinOperatorStakeUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newNonce',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'NonceIncreased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'currentStake',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'minStake',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'OperatorBelowMinStake',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OperatorDeregistered',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'fanIn',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'stakeDenom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'OperatorFanInDeployed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'uri', internalType: 'string', type: 'string', indexed: false },
      {
        name: 'contentHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'timestamp',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'OperatorMetadataUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'stake',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'OperatorRegistered',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'previousAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'newAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'RoleAdminChanged',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleGranted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleRevoked',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'strategy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'allowed', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'StrategyAllowlistUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'implementation',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Upgraded',
  },
  { type: 'error', inputs: [], name: 'AccessControlBadConfirmation' },
  {
    type: 'error',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'neededRole', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'AccessControlUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'ActiveDelegationsExist' },
  {
    type: 'error',
    inputs: [{ name: 'target', internalType: 'address', type: 'address' }],
    name: 'AddressEmptyCode',
  },
  { type: 'error', inputs: [], name: 'AlreadyRegistered' },
  { type: 'error', inputs: [], name: 'CommitmentAlreadyDelegated' },
  { type: 'error', inputs: [], name: 'CommitmentClosed' },
  { type: 'error', inputs: [], name: 'CommitmentNotTracked' },
  { type: 'error', inputs: [], name: 'CommitmentStillOpen' },
  {
    type: 'error',
    inputs: [
      { name: 'implementation', internalType: 'address', type: 'address' },
    ],
    name: 'ERC1967InvalidImplementation',
  },
  { type: 'error', inputs: [], name: 'ERC1967NonPayable' },
  { type: 'error', inputs: [], name: 'FailedCall' },
  {
    type: 'error',
    inputs: [
      { name: 'provided', internalType: 'uint256', type: 'uint256' },
      { name: 'minimum', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientStake',
  },
  { type: 'error', inputs: [], name: 'InvalidInitialization' },
  { type: 'error', inputs: [], name: 'InvalidNonce' },
  { type: 'error', inputs: [], name: 'InvalidSignature' },
  {
    type: 'error',
    inputs: [
      { name: 'current', internalType: 'uint256', type: 'uint256' },
      { name: 'max', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'MaxDelegationsExceeded',
  },
  { type: 'error', inputs: [], name: 'MeshAlreadyWired' },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'NotAnEntity',
  },
  { type: 'error', inputs: [], name: 'NotCommitmentOwner' },
  { type: 'error', inputs: [], name: 'NotInitializing' },
  { type: 'error', inputs: [], name: 'NotRegistered' },
  { type: 'error', inputs: [], name: 'OperatorNotActive' },
  { type: 'error', inputs: [], name: 'PenaltyExceedsMax' },
  {
    type: 'error',
    inputs: [
      { name: 'minRequired', internalType: 'uint16', type: 'uint16' },
      { name: 'actual', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'PenaltyTooLow',
  },
  {
    type: 'error',
    inputs: [
      { name: 'currentFloor', internalType: 'uint16', type: 'uint16' },
      { name: 'attempted', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'PolicyNotTightening',
  },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [
      { name: 'wiredRegistry', internalType: 'address', type: 'address' },
    ],
    name: 'RegistryNotWired',
  },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'SameBlockToggle' },
  { type: 'error', inputs: [], name: 'SignatureExpired' },
  { type: 'error', inputs: [], name: 'StrategiesNotAllowed' },
  { type: 'error', inputs: [], name: 'URITooLong' },
  { type: 'error', inputs: [], name: 'UUPSUnauthorizedCallContext' },
  {
    type: 'error',
    inputs: [{ name: 'slot', internalType: 'bytes32', type: 'bytes32' }],
    name: 'UUPSUnsupportedProxiableUUID',
  },
  { type: 'error', inputs: [], name: 'UnauthorizedCaller' },
  {
    type: 'error',
    inputs: [
      { name: 'expected', internalType: 'address', type: 'address' },
      { name: 'actual', internalType: 'address', type: 'address' },
    ],
    name: 'WrongArbiter',
  },
  { type: 'error', inputs: [], name: 'WrongCounterparty' },
  {
    type: 'error',
    inputs: [
      { name: 'expected', internalType: 'address', type: 'address' },
      { name: 'actual', internalType: 'address', type: 'address' },
    ],
    name: 'WrongToken',
  },
  { type: 'error', inputs: [], name: 'ZeroArbiter' },
  { type: 'error', inputs: [], name: 'ZeroMeshAddress' },
  { type: 'error', inputs: [], name: 'ZeroPayoutAddress' },
  { type: 'error', inputs: [], name: 'ZeroStrategy' },
  { type: 'error', inputs: [], name: 'ZeroToken' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// OperatorServiceRegistry
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const operatorServiceRegistryAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [],
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'DEFAULT_MAX_REFERENCE_BLOCK_AGE',
    outputs: [{ name: '', internalType: 'uint96', type: 'uint96' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ENVELOPE_TYPEHASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'UPGRADE_INTERFACE_VERSION',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'eip712Domain',
    outputs: [
      { name: 'fields', internalType: 'bytes1', type: 'bytes1' },
      { name: 'name', internalType: 'string', type: 'string' },
      { name: 'version', internalType: 'string', type: 'string' },
      { name: 'chainId', internalType: 'uint256', type: 'uint256' },
      { name: 'verifyingContract', internalType: 'address', type: 'address' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'extensions', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'enrollServiceOperator',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'signingKeyAddress', internalType: 'address', type: 'address' },
    ],
    name: 'getLatestOperatorForSigningKey',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    name: 'getLatestOperatorSigningKey',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operator', internalType: 'address', type: 'address' },
      { name: 'blockNumber', internalType: 'uint32', type: 'uint32' },
    ],
    name: 'getOperatorSigningKeyAtBlock',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    name: 'getOperatorWeight',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'role', internalType: 'bytes32', type: 'bytes32' }],
    name: 'getRoleAdmin',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getServiceURI',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getStakeRegistry',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getTotalPower',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'blockNumber', internalType: 'uint256', type: 'uint256' }],
    name: 'getTotalPowerAt',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    name: 'getVotingPower',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operator', internalType: 'address', type: 'address' },
      { name: 'blockNumber', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getVotingPowerAt',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'hasRole',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operatorRegistry_', internalType: 'address', type: 'address' },
      { name: 'votingPowerSource_', internalType: 'address', type: 'address' },
      { name: 'admin_', internalType: 'address', type: 'address' },
      { name: 'thresholdWeight_', internalType: 'uint256', type: 'uint256' },
      { name: 'quorumNumerator_', internalType: 'uint256', type: 'uint256' },
      { name: 'quorumDenominator_', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'digest', internalType: 'bytes32', type: 'bytes32' },
      { name: '_signatureData', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'isValidSignature',
    outputs: [{ name: '', internalType: 'bytes4', type: 'bytes4' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'maxReferenceBlockAge',
    outputs: [{ name: '', internalType: 'uint96', type: 'uint96' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    name: 'operatorRegistered',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'operatorRegistry',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'proxiableUUID',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'callerConfirmation', internalType: 'address', type: 'address' },
    ],
    name: 'renounceRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'revokeRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newValue', internalType: 'uint96', type: 'uint96' }],
    name: 'setMaxReferenceBlockAge',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '_serviceURI', internalType: 'string', type: 'string' }],
    name: 'setServiceURI',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newSource', internalType: 'address', type: 'address' }],
    name: 'setVotingPowerSource',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newSigningKey', internalType: 'address', type: 'address' },
      { name: 'signingKeySignature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'updateOperatorSigningKey',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'quorumNumerator', internalType: 'uint256', type: 'uint256' },
      { name: 'quorumDenominator', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'updateQuorum',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'thresholdWeight', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'updateStakeThreshold',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newImplementation', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'upgradeToAndCall',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'envelope',
        internalType: 'struct IServiceHandler.Envelope',
        type: 'tuple',
        components: [
          { name: 'eventId', internalType: 'bytes20', type: 'bytes20' },
          { name: 'ordering', internalType: 'bytes12', type: 'bytes12' },
          { name: 'payload', internalType: 'bytes', type: 'bytes' },
        ],
      },
      {
        name: 'signatureData',
        internalType: 'struct IServiceHandler.SignatureData',
        type: 'tuple',
        components: [
          { name: 'signers', internalType: 'address[]', type: 'address[]' },
          { name: 'signatures', internalType: 'bytes[]', type: 'bytes[]' },
          { name: 'referenceBlock', internalType: 'uint32', type: 'uint32' },
        ],
      },
    ],
    name: 'validate',
    outputs: [],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'votingPowerSource',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'operator', internalType: 'address', type: 'address' }],
    name: 'withdrawServiceOperator',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EIP712DomainChanged' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'version',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'Initialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldValue',
        internalType: 'uint96',
        type: 'uint96',
        indexed: false,
      },
      {
        name: 'newValue',
        internalType: 'uint96',
        type: 'uint96',
        indexed: false,
      },
    ],
    name: 'MaxReferenceBlockAgeUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OperatorDeregistered',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OperatorRegistered',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'oldKey',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newKey',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OperatorSigningKeyUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'numerator',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'denominator',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'QuorumThresholdUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'previousAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'newAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'RoleAdminChanged',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleGranted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleRevoked',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'serviceURI',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
    ],
    name: 'ServiceURIUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'newThreshold',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'StakeThresholdUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'implementation',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Upgraded',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldSource',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newSource',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'VotingPowerSourceUpdated',
  },
  { type: 'error', inputs: [], name: 'AccessControlBadConfirmation' },
  {
    type: 'error',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'neededRole', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'AccessControlUnauthorizedAccount',
  },
  {
    type: 'error',
    inputs: [{ name: 'target', internalType: 'address', type: 'address' }],
    name: 'AddressEmptyCode',
  },
  { type: 'error', inputs: [], name: 'AlreadyRegistered' },
  { type: 'error', inputs: [], name: 'CheckpointUnorderedInsertion' },
  {
    type: 'error',
    inputs: [
      { name: 'implementation', internalType: 'address', type: 'address' },
    ],
    name: 'ERC1967InvalidImplementation',
  },
  { type: 'error', inputs: [], name: 'ERC1967NonPayable' },
  { type: 'error', inputs: [], name: 'FailedCall' },
  {
    type: 'error',
    inputs: [
      { name: 'signerWeight', internalType: 'uint256', type: 'uint256' },
      { name: 'thresholdWeight', internalType: 'uint256', type: 'uint256' },
      { name: 'totalWeight', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientQuorum',
  },
  { type: 'error', inputs: [], name: 'InsufficientQuorumZero' },
  { type: 'error', inputs: [], name: 'InsufficientSignedStake' },
  { type: 'error', inputs: [], name: 'InvalidAdmin' },
  { type: 'error', inputs: [], name: 'InvalidInitialization' },
  { type: 'error', inputs: [], name: 'InvalidLength' },
  { type: 'error', inputs: [], name: 'InvalidOperatorRegistry' },
  { type: 'error', inputs: [], name: 'InvalidQuorumParameters' },
  { type: 'error', inputs: [], name: 'InvalidReferenceBlock' },
  { type: 'error', inputs: [], name: 'InvalidSignature' },
  { type: 'error', inputs: [], name: 'InvalidSigningKey' },
  { type: 'error', inputs: [], name: 'InvalidSigningKeySignature' },
  { type: 'error', inputs: [], name: 'InvalidThresholdWeight' },
  { type: 'error', inputs: [], name: 'InvalidVotingPowerSource' },
  { type: 'error', inputs: [], name: 'LengthMismatch' },
  { type: 'error', inputs: [], name: 'NotActiveOperator' },
  { type: 'error', inputs: [], name: 'NotAdminOrSelf' },
  { type: 'error', inputs: [], name: 'NotInitializing' },
  { type: 'error', inputs: [], name: 'NotRegistered' },
  { type: 'error', inputs: [], name: 'NotSorted' },
  { type: 'error', inputs: [], name: 'SignerNotRegistered' },
  { type: 'error', inputs: [], name: 'SigningKeyAlreadyAssigned' },
  {
    type: 'error',
    inputs: [
      { name: 'referenceBlock', internalType: 'uint32', type: 'uint32' },
      { name: 'maxAge', internalType: 'uint96', type: 'uint96' },
    ],
    name: 'StaleReferenceBlock',
  },
  { type: 'error', inputs: [], name: 'UUPSUnauthorizedCallContext' },
  {
    type: 'error',
    inputs: [{ name: 'slot', internalType: 'bytes32', type: 'bytes32' }],
    name: 'UUPSUnsupportedProxiableUUID',
  },
  { type: 'error', inputs: [], name: 'ZeroAmount' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// OptimisticInsuranceArbiter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const optimisticInsuranceArbiterAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'manager_', internalType: 'address', type: 'address' },
      { name: 'bondToken_', internalType: 'address', type: 'address' },
      { name: 'minBond_', internalType: 'uint256', type: 'uint256' },
      { name: 'bondBps_', internalType: 'uint16', type: 'uint16' },
      { name: 'answerTimeout_', internalType: 'uint64', type: 'uint64' },
      { name: 'winnerShareBps_', internalType: 'uint16', type: 'uint16' },
      { name: 'treasury_', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'CLAIM_STALE_TTL',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MAX_BOND_DOUBLINGS',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'activeClaimOf',
    outputs: [
      { name: 'activeClaimId', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'answerTimeout',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'arbiterCapabilities',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'arbiterMetadataURI',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'bondBps',
    outputs: [{ name: '', internalType: 'uint16', type: 'uint16' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'amountBps', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'bondFloor',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'bondToken',
    outputs: [{ name: '', internalType: 'contract IERC20', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'claimId', internalType: 'uint256', type: 'uint256' }],
    name: 'cancelClaim',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'claimId', internalType: 'uint256', type: 'uint256' }],
    name: 'cancelStaleClaim',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'commitmentManager',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'claimId', internalType: 'uint256', type: 'uint256' },
      { name: 'counterAmountBps', internalType: 'uint16', type: 'uint16' },
      { name: 'evidenceHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'bond', internalType: 'uint128', type: 'uint128' },
    ],
    name: 'disputeClaim',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'claimId', internalType: 'uint256', type: 'uint256' }],
    name: 'executeClaim',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'claimId', internalType: 'uint256', type: 'uint256' }],
    name: 'finalizeClaim',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'claimId', internalType: 'uint256', type: 'uint256' }],
    name: 'getBondStackTop',
    outputs: [
      { name: 'asserter', internalType: 'address', type: 'address' },
      { name: 'amountBps', internalType: 'uint16', type: 'uint16' },
      { name: 'bond', internalType: 'uint128', type: 'uint128' },
      { name: 'deadline', internalType: 'uint64', type: 'uint64' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'claimId', internalType: 'uint256', type: 'uint256' }],
    name: 'getClaim',
    outputs: [
      {
        name: '',
        internalType: 'struct OptimisticInsuranceArbiter.Claim',
        type: 'tuple',
        components: [
          { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
          { name: 'winningAmtBps', internalType: 'uint16', type: 'uint16' },
          { name: 'lastBondAt', internalType: 'uint64', type: 'uint64' },
          {
            name: 'state',
            internalType: 'enum OptimisticInsuranceArbiter.ClaimState',
            type: 'uint8',
          },
          { name: 'templateId', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'stack',
            internalType: 'struct OptimisticInsuranceArbiter.BondEntry[]',
            type: 'tuple[]',
            components: [
              { name: 'asserter', internalType: 'address', type: 'address' },
              { name: 'amountBps', internalType: 'uint16', type: 'uint16' },
              { name: 'bond', internalType: 'uint128', type: 'uint128' },
            ],
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [
      {
        name: '',
        internalType: 'contract ICommitmentManager',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'minBond',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'nextClaimId',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'amountBps', internalType: 'uint16', type: 'uint16' },
      { name: 'evidenceHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'templateId', internalType: 'bytes32', type: 'bytes32' },
      { name: 'bond', internalType: 'uint128', type: 'uint128' },
    ],
    name: 'proposeClaim',
    outputs: [{ name: 'claimId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'treasury',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'winnerShareBps',
    outputs: [{ name: '', internalType: 'uint16', type: 'uint16' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'claimId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'ClaimCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'claimId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'disputer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amountBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'bond',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'evidenceHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'ClaimDisputed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'claimId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'winningAmtBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
    ],
    name: 'ClaimFinalized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'claimId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'proposer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amountBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'bond',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'evidenceHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'templateId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'ClaimProposed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'claimId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'winningAmtBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
    ],
    name: 'ClaimRuled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'claimId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'winnerPayout',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'treasuryPayout',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'winningRefunds',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ClaimSettled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'claimId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'ClaimStaleCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'claimId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'ClaimUnwound',
  },
  { type: 'error', inputs: [], name: 'AlreadyDisputed' },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentMax', internalType: 'uint16', type: 'uint16' },
      { name: 'claimAmount', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'AmountAboveCommitmentMax',
  },
  {
    type: 'error',
    inputs: [
      { name: 'minimum', internalType: 'uint256', type: 'uint256' },
      { name: 'provided', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'BondBelowFloor',
  },
  {
    type: 'error',
    inputs: [
      { name: 'required', internalType: 'uint256', type: 'uint256' },
      { name: 'provided', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'BondNotDoubled',
  },
  {
    type: 'error',
    inputs: [
      { name: 'required', internalType: 'uint64', type: 'uint64' },
      { name: 'actual', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'ChallengeWindowTooShort',
  },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'existingClaimId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ClaimAlreadyActive',
  },
  {
    type: 'error',
    inputs: [{ name: 'claimId', internalType: 'uint256', type: 'uint256' }],
    name: 'ClaimAlreadyEnforced',
  },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'CommitmentNotActive',
  },
  {
    type: 'error',
    inputs: [{ name: 'amountBps', internalType: 'uint16', type: 'uint16' }],
    name: 'InvalidAmountBps',
  },
  { type: 'error', inputs: [], name: 'InvalidWinnerShareBps' },
  { type: 'error', inputs: [], name: 'LastAsserterCannotDispute' },
  { type: 'error', inputs: [], name: 'MaxDoublingsReached' },
  {
    type: 'error',
    inputs: [
      { name: 'proposer', internalType: 'address', type: 'address' },
      { name: 'caller', internalType: 'address', type: 'address' },
    ],
    name: 'NotProposer',
  },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  {
    type: 'error',
    inputs: [
      { name: 'readyAt', internalType: 'uint64', type: 'uint64' },
      { name: 'nowTs', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'StaleTtlNotElapsed',
  },
  {
    type: 'error',
    inputs: [
      { name: 'readyAt', internalType: 'uint64', type: 'uint64' },
      { name: 'nowTs', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'TimeoutNotElapsed',
  },
  { type: 'error', inputs: [], name: 'TreasuryRequired' },
  {
    type: 'error',
    inputs: [{ name: 'claimId', internalType: 'uint256', type: 'uint256' }],
    name: 'UnknownClaim',
  },
  {
    type: 'error',
    inputs: [
      { name: 'expected', internalType: 'address', type: 'address' },
      { name: 'actual', internalType: 'address', type: 'address' },
    ],
    name: 'WrongArbiter',
  },
  {
    type: 'error',
    inputs: [
      {
        name: 'expected',
        internalType: 'enum OptimisticInsuranceArbiter.ClaimState',
        type: 'uint8',
      },
      {
        name: 'actual',
        internalType: 'enum OptimisticInsuranceArbiter.ClaimState',
        type: 'uint8',
      },
    ],
    name: 'WrongClaimState',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
  { type: 'error', inputs: [], name: 'ZeroAnswerTimeout' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// OptimisticMutualArbiter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const optimisticMutualArbiterAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'manager_', internalType: 'address', type: 'address' },
      { name: 'bondToken_', internalType: 'address', type: 'address' },
      { name: 'minBond_', internalType: 'uint256', type: 'uint256' },
      { name: 'treasury_', internalType: 'address', type: 'address' },
      { name: 'owner_', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'acceptOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'activate',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'arbiterCapabilities',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'arbiterMetadataURI',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'bondToken',
    outputs: [{ name: '', internalType: 'contract IERC20', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'claims',
    outputs: [
      { name: 'proposer', internalType: 'address', type: 'address' },
      { name: 'proposedAt', internalType: 'uint64', type: 'uint64' },
      { name: 'resolved', internalType: 'bool', type: 'bool' },
      { name: 'bond', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'commitmentManager',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'coverPolicy',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [
      {
        name: '',
        internalType: 'contract ICommitmentManager',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'minBond',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingOwner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      { name: 'lossNumeraire', internalType: 'uint256', type: 'uint256' },
      { name: 'evidenceHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'bond', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'proposeLoss',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      { name: 'lossNumeraire', internalType: 'uint256', type: 'uint256' },
      { name: 'evidenceHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'bond', internalType: 'uint256', type: 'uint256' },
      { name: 'coverBindingId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'proposeLossFor',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'reclaimBond',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'reclaimOnCancelled',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'coverPolicy_', internalType: 'address', type: 'address' },
    ],
    name: 'setCoverPolicy',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'treasury_', internalType: 'address', type: 'address' }],
    name: 'setTreasury',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'treasury',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'veto',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'proposer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'bond',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'BondReclaimed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'coverBindingId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'notional',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'expiry',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'policyholder',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'CoverBindingSnapshotted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'coverPolicy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'CoverPolicyUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'proposer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'lossNumeraire',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'bond',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'LossProposed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'proposer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'slashedBond',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'LossVetoed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferStarted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'treasury',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'TreasuryUpdated',
  },
  { type: 'error', inputs: [], name: 'AlreadyResolved' },
  { type: 'error', inputs: [], name: 'BindingMutualMismatch' },
  { type: 'error', inputs: [], name: 'BondTooLow' },
  {
    type: 'error',
    inputs: [
      { name: 'required', internalType: 'uint64', type: 'uint64' },
      { name: 'actual', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'ChallengeWindowTooShort',
  },
  { type: 'error', inputs: [], name: 'ClaimActive' },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'CommitmentNotActive',
  },
  { type: 'error', inputs: [], name: 'CoverPolicyUnset' },
  { type: 'error', inputs: [], name: 'LossNotCancelled' },
  { type: 'error', inputs: [], name: 'LossNotExecuted' },
  { type: 'error', inputs: [], name: 'NoClaim' },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'VetoWindowClosed' },
  {
    type: 'error',
    inputs: [
      { name: 'expected', internalType: 'address', type: 'address' },
      { name: 'actual', internalType: 'address', type: 'address' },
    ],
    name: 'WrongArbiter',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PremiumScheduler
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const premiumSchedulerAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'manager_', internalType: 'address', type: 'address' },
      { name: 'owner_', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'acceptOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'mutualId', internalType: 'uint256', type: 'uint256' }],
    name: 'curveFor',
    outputs: [
      {
        name: '',
        internalType: 'struct PremiumScheduler.CurveParams',
        type: 'tuple',
        components: [
          { name: 'base', internalType: 'uint256', type: 'uint256' },
          { name: 'slope1', internalType: 'uint256', type: 'uint256' },
          { name: 'slope2', internalType: 'uint256', type: 'uint256' },
          { name: 'kink', internalType: 'uint256', type: 'uint256' },
          { name: 'maxLeverageBps', internalType: 'uint256', type: 'uint256' },
          { name: 'set', internalType: 'bool', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [
      {
        name: '',
        internalType: 'contract ICommitmentManager',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingOwner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'policy',
    outputs: [
      {
        name: '',
        internalType: 'contract ILinkedMutualPolicy',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      { name: 'notional', internalType: 'uint256', type: 'uint256' },
      { name: 'duration', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'quote',
    outputs: [
      { name: 'premiumAmount', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      { name: 'duration', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'quoteStandby',
    outputs: [
      { name: 'premiumAmount', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'base', internalType: 'uint256', type: 'uint256' },
      { name: 'slope1', internalType: 'uint256', type: 'uint256' },
      { name: 'slope2', internalType: 'uint256', type: 'uint256' },
      { name: 'kink', internalType: 'uint256', type: 'uint256' },
      { name: 'maxLeverageBps', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'setDefaultCurve',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'mutualId', internalType: 'uint256', type: 'uint256' },
      { name: 'base', internalType: 'uint256', type: 'uint256' },
      { name: 'slope1', internalType: 'uint256', type: 'uint256' },
      { name: 'slope2', internalType: 'uint256', type: 'uint256' },
      { name: 'kink', internalType: 'uint256', type: 'uint256' },
      { name: 'maxLeverageBps', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'setMutualCurve',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'policy_', internalType: 'address', type: 'address' }],
    name: 'setPolicy',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'base',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'slope1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'slope2',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'kink',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'maxLeverageBps',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'DefaultCurveSet',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'base',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'slope1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'slope2',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'kink',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'maxLeverageBps',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MutualCurveSet',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferStarted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'policy',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'PolicySet',
  },
  { type: 'error', inputs: [], name: 'InvalidCurve' },
  {
    type: 'error',
    inputs: [
      { name: 'wouldBeSold', internalType: 'uint256', type: 'uint256' },
      { name: 'cap', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'LeverageCapExceeded',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'PolicyUnset' },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SkimmingMockStrategy
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const skimmingMockStrategyAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'asset_', internalType: 'address', type: 'address' },
      { name: 'vault_', internalType: 'address', type: 'address' },
      { name: 'operator_', internalType: 'address', type: 'address' },
      { name: 'premiumRecipient_', internalType: 'address', type: 'address' },
      { name: 'skimBps_', internalType: 'uint16', type: 'uint16' },
      { name: 'operatorFeeBps_', internalType: 'uint16', type: 'uint16' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'asset',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'chargedGains',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'assets', internalType: 'uint256', type: 'uint256' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'maxDeposit',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'operator',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'operatorFeeBps',
    outputs: [{ name: '', internalType: 'uint16', type: 'uint16' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingSkim',
    outputs: [
      { name: 'newGains', internalType: 'uint256', type: 'uint256' },
      { name: 'operatorFee', internalType: 'uint256', type: 'uint256' },
      { name: 'premiumShare', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'premiumRecipient',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'principal',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'val', internalType: 'uint256', type: 'uint256' }],
    name: 'setMaxDeposit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    name: 'simulateBackedYield',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    name: 'simulateLoss',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    name: 'simulateYield',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'skim',
    outputs: [
      { name: 'operatorFee', internalType: 'uint256', type: 'uint256' },
      { name: 'premiumShare', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'skimBps',
    outputs: [{ name: '', internalType: 'uint16', type: 'uint16' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalAssets',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'vault',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'assets', internalType: 'uint256', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'OperatorFeePaid',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'premiumRecipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'PremiumRouted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'newGains',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'fee', internalType: 'uint256', type: 'uint256', indexed: false },
    ],
    name: 'YieldSkimmed',
  },
  { type: 'error', inputs: [], name: 'BpsExceedsMax' },
  { type: 'error', inputs: [], name: 'NothingToSkim' },
  { type: 'error', inputs: [], name: 'OnlyVault' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// TokenWeighting
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const tokenWeightingAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [],
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MAX_DENOMS',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MAX_REWARD_TOKENS',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'REWARDER_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'stakeDenom', internalType: 'bytes32', type: 'bytes32' },
      { name: 'rewardToken', internalType: 'address', type: 'address' },
    ],
    name: 'claimRewards',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'currentStake',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'denomCount',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'stakeDenom', internalType: 'bytes32', type: 'bytes32' },
      { name: 'rewardToken', internalType: 'address', type: 'address' },
      { name: 'rewardAmount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'distributeRewards',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'factoryTypeId',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'role', internalType: 'bytes32', type: 'bytes32' }],
    name: 'getRoleAdmin',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getTotalPower',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'blockNumber', internalType: 'uint256', type: 'uint256' }],
    name: 'getTotalPowerAt',
    outputs: [{ name: 'power', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'staker', internalType: 'address', type: 'address' }],
    name: 'getVotingPower',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'staker', internalType: 'address', type: 'address' },
      { name: 'blockNumber', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getVotingPowerAt',
    outputs: [{ name: 'power', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'governance',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'hasRole',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'provider_', internalType: 'address', type: 'address' },
      { name: 'governance_', internalType: 'address', type: 'address' },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'denom', internalType: 'bytes32', type: 'bytes32' }],
    name: 'isDenomRetired',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    name: 'pendingRewards',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'provider',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'staker', internalType: 'address', type: 'address' },
      { name: 'denom', internalType: 'bytes32', type: 'bytes32' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'releaseStake',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'callerConfirmation', internalType: 'address', type: 'address' },
    ],
    name: 'renounceRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'denom', internalType: 'bytes32', type: 'bytes32' }],
    name: 'retireDenom',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'revokeRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    name: 'rewardDebt',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'bytes32', type: 'bytes32' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    name: 'rewardsPerShare',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'staker', internalType: 'address', type: 'address' },
      { name: 'denom', internalType: 'bytes32', type: 'bytes32' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'stake',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'totalStake',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newGovernance', internalType: 'address', type: 'address' },
    ],
    name: 'transferGovernance',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'denom', internalType: 'bytes32', type: 'bytes32' },
      { name: 'weightBps', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'updateWeight',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'weights',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'denom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'DenomPurged',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'denom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'previousWeightBps',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'DenomRetired',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldGovernance',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newGovernance',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'GovernanceTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'provider',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'governance',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Initialized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'staker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'stakeDenom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'rewardToken',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'RewardsClaimed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'stakeDenom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'rewardToken',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'rewardAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'RewardsDistributed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'previousAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'newAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'RoleAdminChanged',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleGranted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleRevoked',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'staker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'denom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'StakeReleased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'staker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'denom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Staked',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'denom',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'oldWeightBps',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newWeightBps',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'WeightUpdated',
  },
  { type: 'error', inputs: [], name: 'AccessControlBadConfirmation' },
  {
    type: 'error',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'neededRole', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'AccessControlUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'AlreadyInitialized' },
  { type: 'error', inputs: [], name: 'AlreadyRetired' },
  { type: 'error', inputs: [], name: 'CheckpointUnorderedInsertion' },
  { type: 'error', inputs: [], name: 'DenomCapReached' },
  { type: 'error', inputs: [], name: 'DenomIsRetired' },
  { type: 'error', inputs: [], name: 'InsufficientStake' },
  { type: 'error', inputs: [], name: 'OnlyGovernance' },
  { type: 'error', inputs: [], name: 'OnlyProvider' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  { type: 'error', inputs: [], name: 'RewardTokenLimit' },
  { type: 'error', inputs: [], name: 'RewardTooSmall' },
  {
    type: 'error',
    inputs: [
      { name: 'bits', internalType: 'uint8', type: 'uint8' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'SafeCastOverflowedUintDowncast',
  },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'UnregisteredDenom' },
  { type: 'error', inputs: [], name: 'ZeroAmount' },
  { type: 'error', inputs: [], name: 'ZeroGovernance' },
  { type: 'error', inputs: [], name: 'ZeroTotalStake' },
  { type: 'error', inputs: [], name: 'ZeroWeightBps' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// TokenWeightingVotesShim
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const tokenWeightingVotesShimAbi = [
  {
    type: 'constructor',
    inputs: [
      {
        name: 'source_',
        internalType: 'contract IVotingPowerSource',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'CLOCK_MODE',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'clock',
    outputs: [{ name: '', internalType: 'uint48', type: 'uint48' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'delegate',
    outputs: [],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint8', type: 'uint8' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'delegateBySig',
    outputs: [],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'delegates',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'timepoint', internalType: 'uint256', type: 'uint256' }],
    name: 'getPastTotalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'timepoint', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getPastVotes',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'getVotes',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'source',
    outputs: [
      {
        name: '',
        internalType: 'contract IVotingPowerSource',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'delegator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'fromDelegate',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'toDelegate',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'DelegateChanged',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'delegate',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'previousVotes',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newVotes',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'DelegateVotesChanged',
  },
  { type: 'error', inputs: [], name: 'DelegationNotSupported' },
  {
    type: 'error',
    inputs: [{ name: 'expiry', internalType: 'uint256', type: 'uint256' }],
    name: 'VotesExpiredSignature',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// TwoTierArbiter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const twoTierArbiterAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'manager_', internalType: 'address', type: 'address' },
      { name: 'primaryController_', internalType: 'address', type: 'address' },
      { name: 'appealController_', internalType: 'address', type: 'address' },
      { name: 'appealWindow_', internalType: 'uint64', type: 'uint64' },
      { name: 'humanResponseWindow_', internalType: 'uint64', type: 'uint64' },
      { name: 'executionBuffer_', internalType: 'uint64', type: 'uint64' },
      { name: 'courtPolicyURI_', internalType: 'string', type: 'string' },
      { name: 'courtPolicyHash_', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'activeCaseOf',
    outputs: [{ name: 'caseId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'caseId', internalType: 'uint256', type: 'uint256' },
      { name: 'appealHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'appeal',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'appealController',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'appealWindow',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'arbiterCapabilities',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'arbiterMetadataURI',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'commitmentManager',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'courtPolicyHash',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'caseId', internalType: 'uint256', type: 'uint256' }],
    name: 'executeRuling',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'executionBuffer',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'caseId', internalType: 'uint256', type: 'uint256' }],
    name: 'getCase',
    outputs: [
      {
        name: 'courtCase',
        internalType: 'struct TwoTierArbiter.Case',
        type: 'tuple',
        components: [
          { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
          { name: 'primaryPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'finalPenaltyBps', internalType: 'uint16', type: 'uint16' },
          { name: 'openedAt', internalType: 'uint64', type: 'uint64' },
          { name: 'appealDeadline', internalType: 'uint64', type: 'uint64' },
          { name: 'appealedAt', internalType: 'uint64', type: 'uint64' },
          { name: 'humanDeadline', internalType: 'uint64', type: 'uint64' },
          {
            name: 'state',
            internalType: 'enum TwoTierArbiter.CaseState',
            type: 'uint8',
          },
          {
            name: 'primaryDecisionHash',
            internalType: 'bytes32',
            type: 'bytes32',
          },
          { name: 'appealHash', internalType: 'bytes32', type: 'bytes32' },
          {
            name: 'humanDecisionHash',
            internalType: 'bytes32',
            type: 'bytes32',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'humanResponseWindow',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'caseId', internalType: 'uint256', type: 'uint256' }],
    name: 'lapseAppeal',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [
      {
        name: '',
        internalType: 'contract ICommitmentManager',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'nextCaseId',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'primaryController',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'penaltyBps', internalType: 'uint16', type: 'uint16' },
      { name: 'decisionHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'proposeRuling',
    outputs: [{ name: 'caseId', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'requiredChallengeWindow',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'caseId', internalType: 'uint256', type: 'uint256' },
      { name: 'finalPenaltyBps', internalType: 'uint16', type: 'uint16' },
      { name: 'decisionHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'resolveAppeal',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'caseId', internalType: 'uint256', type: 'uint256' }],
    name: 'syncCase',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'caseId', internalType: 'uint256', type: 'uint256' },
      { name: 'reasonHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'withdrawRuling',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'caseId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'actor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'primaryPenaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'humanDeadline',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'AppealLapsed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'caseId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'actor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'finalPenaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'ruledAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'humanDeadline',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'managerInitiatedAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'decisionHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'AppealResolved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'caseId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'actor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'terminalState',
        internalType: 'enum TwoTierArbiter.CaseState',
        type: 'uint8',
        indexed: false,
      },
      {
        name: 'penaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'managerInitiatedAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'synchronizedAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'decisionHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'appealHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'CaseSynchronized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'caseId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'actor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'primaryPenaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'appealedAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'humanDeadline',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'managerInitiatedAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'appealHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'RulingAppealed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'caseId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'actor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'penaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'managerInitiatedAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'executedAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'decisionHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'RulingExecuted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'caseId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'actor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'penaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'openedAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'appealDeadline',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'managerInitiatedAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'decisionHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'RulingProposed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'caseId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'commitmentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'actor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'penaltyBps',
        internalType: 'uint16',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'withdrawnAt',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'appealDeadline',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
      {
        name: 'reasonHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'RulingWithdrawn',
  },
  {
    type: 'error',
    inputs: [
      { name: 'deadline', internalType: 'uint64', type: 'uint64' },
      { name: 'nowTs', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'AppealWindowElapsed',
  },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
      { name: 'caseId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'CaseAlreadyActive',
  },
  {
    type: 'error',
    inputs: [
      { name: 'caseId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'actual',
        internalType: 'enum TwoTierArbiter.CaseState',
        type: 'uint8',
      },
    ],
    name: 'CaseNotLive',
  },
  {
    type: 'error',
    inputs: [
      { name: 'required', internalType: 'uint64', type: 'uint64' },
      { name: 'actual', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'ChallengeWindowTooShort',
  },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'CommitmentNotActive',
  },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'CommitmentNotFound',
  },
  { type: 'error', inputs: [], name: 'ControllersMustDiffer' },
  {
    type: 'error',
    inputs: [
      { name: 'deadline', internalType: 'uint64', type: 'uint64' },
      { name: 'nowTs', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'HumanResponseWindowActive',
  },
  {
    type: 'error',
    inputs: [
      { name: 'deadline', internalType: 'uint64', type: 'uint64' },
      { name: 'nowTs', internalType: 'uint64', type: 'uint64' },
    ],
    name: 'HumanResponseWindowElapsed',
  },
  {
    type: 'error',
    inputs: [{ name: 'penaltyBps', internalType: 'uint16', type: 'uint16' }],
    name: 'InvalidPenalty',
  },
  { type: 'error', inputs: [], name: 'InvalidPolicy' },
  {
    type: 'error',
    inputs: [
      { name: 'expected', internalType: 'uint16', type: 'uint16' },
      { name: 'actual', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'ManagerPenaltyMismatch',
  },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ManagerProposalNotActive',
  },
  {
    type: 'error',
    inputs: [{ name: 'caller', internalType: 'address', type: 'address' }],
    name: 'NotAppealController',
  },
  {
    type: 'error',
    inputs: [{ name: 'caller', internalType: 'address', type: 'address' }],
    name: 'NotPrimaryController',
  },
  {
    type: 'error',
    inputs: [
      { name: 'commitmentMax', internalType: 'uint16', type: 'uint16' },
      { name: 'penaltyBps', internalType: 'uint16', type: 'uint16' },
    ],
    name: 'PenaltyAboveCommitmentMax',
  },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [
      { name: 'caseId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'actual',
        internalType: 'enum TwoTierArbiter.CaseState',
        type: 'uint8',
      },
    ],
    name: 'RulingNotExecutable',
  },
  {
    type: 'error',
    inputs: [
      { name: 'caseId', internalType: 'uint256', type: 'uint256' },
      { name: 'activeCaseId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'StaleCase',
  },
  { type: 'error', inputs: [], name: 'TimingOverflow' },
  {
    type: 'error',
    inputs: [{ name: 'caller', internalType: 'address', type: 'address' }],
    name: 'UnauthorizedAppellant',
  },
  {
    type: 'error',
    inputs: [{ name: 'caseId', internalType: 'uint256', type: 'uint256' }],
    name: 'UnknownCase',
  },
  {
    type: 'error',
    inputs: [
      { name: 'expected', internalType: 'address', type: 'address' },
      { name: 'actual', internalType: 'address', type: 'address' },
    ],
    name: 'WrongArbiter',
  },
  {
    type: 'error',
    inputs: [
      { name: 'caseId', internalType: 'uint256', type: 'uint256' },
      {
        name: 'expected',
        internalType: 'enum TwoTierArbiter.CaseState',
        type: 'uint8',
      },
      {
        name: 'actual',
        internalType: 'enum TwoTierArbiter.CaseState',
        type: 'uint8',
      },
    ],
    name: 'WrongCaseState',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
  { type: 'error', inputs: [], name: 'ZeroHash' },
  { type: 'error', inputs: [], name: 'ZeroWindow' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// VaultCoverConduit
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const vaultCoverConduitAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'vault_', internalType: 'address', type: 'address' },
      { name: 'policy_', internalType: 'address', type: 'address' },
      { name: 'mutualId_', internalType: 'uint256', type: 'uint256' },
      { name: 'maxStreamDuration_', internalType: 'uint64', type: 'uint64' },
      { name: 'minFundAssets_', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'asset',
    outputs: [{ name: '', internalType: 'contract IERC20', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [
      {
        name: '',
        internalType: 'contract ICommitmentManager',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'maxStreamDuration',
    outputs: [{ name: '', internalType: 'uint64', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'minFundAssets',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'mutualId',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'poke',
    outputs: [
      { name: 'premium', internalType: 'uint256', type: 'uint256' },
      { name: 'duration', internalType: 'uint64', type: 'uint64' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'policy',
    outputs: [
      {
        name: '',
        internalType: 'contract LinkedMutualPolicy',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'scheduler',
    outputs: [
      { name: '', internalType: 'contract PremiumScheduler', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'vault',
    outputs: [
      { name: '', internalType: 'contract ICommitmentsVault', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'mutualId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'premium',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'duration',
        internalType: 'uint64',
        type: 'uint64',
        indexed: false,
      },
    ],
    name: 'PremiumFunded',
  },
  { type: 'error', inputs: [], name: 'DurationBelowStreamFloor' },
  {
    type: 'error',
    inputs: [
      { name: 'numeraire', internalType: 'address', type: 'address' },
      { name: 'vault', internalType: 'address', type: 'address' },
    ],
    name: 'NumeraireMismatch',
  },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// VaultFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const vaultFactoryAbi = [
  {
    type: 'constructor',
    inputs: [
      {
        name: 'vaultImplementation_',
        internalType: 'address',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'VAULT_TYPE_ID',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'allVaults',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'blacklist',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'asset', internalType: 'address', type: 'address' },
      { name: 'admin', internalType: 'address', type: 'address' },
      { name: 'strategy', internalType: 'address', type: 'address' },
    ],
    name: 'deployVault',
    outputs: [{ name: 'vault', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'implementationTypeId',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'isBlacklisted',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'isWhitelisted',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'data', internalType: 'bytes[]', type: 'bytes[]' }],
    name: 'multicall',
    outputs: [{ name: 'results', internalType: 'bytes[]', type: 'bytes[]' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'vaultByAsset',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'vaultCount',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'vaultImplementation',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'impl', internalType: 'address', type: 'address' },
      { name: 'expectedTypeId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'whitelistImplementation',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'impl', internalType: 'address', type: 'address', indexed: true },
    ],
    name: 'ImplementationBlacklisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'impl', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'typeId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'ImplementationWhitelisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'asset',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'vault',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'VaultDeployed',
  },
  {
    type: 'error',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'AlreadyWhitelisted',
  },
  {
    type: 'error',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'Blacklisted',
  },
  {
    type: 'error',
    inputs: [{ name: 'impl', internalType: 'address', type: 'address' }],
    name: 'NotWhitelisted',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  {
    type: 'error',
    inputs: [
      { name: 'impl', internalType: 'address', type: 'address' },
      { name: 'expected', internalType: 'bytes32', type: 'bytes32' },
      { name: 'actual', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'TypeIdMismatch',
  },
  {
    type: 'error',
    inputs: [{ name: 'asset', internalType: 'address', type: 'address' }],
    name: 'VaultAlreadyExists',
  },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
  { type: 'error', inputs: [], name: 'ZeroImplementation' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__
 */
export const useReadAttestationArbiter = /*#__PURE__*/ createUseReadContract({
  abi: attestationArbiterAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"agreementOrdering"`
 */
export const useReadAttestationArbiterAgreementOrdering =
  /*#__PURE__*/ createUseReadContract({
    abi: attestationArbiterAbi,
    functionName: 'agreementOrdering',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"arbiterCapabilities"`
 */
export const useReadAttestationArbiterArbiterCapabilities =
  /*#__PURE__*/ createUseReadContract({
    abi: attestationArbiterAbi,
    functionName: 'arbiterCapabilities',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"arbiterMetadataURI"`
 */
export const useReadAttestationArbiterArbiterMetadataUri =
  /*#__PURE__*/ createUseReadContract({
    abi: attestationArbiterAbi,
    functionName: 'arbiterMetadataURI',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"commitmentManager"`
 */
export const useReadAttestationArbiterCommitmentManager =
  /*#__PURE__*/ createUseReadContract({
    abi: attestationArbiterAbi,
    functionName: 'commitmentManager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"commitmentOrdering"`
 */
export const useReadAttestationArbiterCommitmentOrdering =
  /*#__PURE__*/ createUseReadContract({
    abi: attestationArbiterAbi,
    functionName: 'commitmentOrdering',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"isEnvelopeConsumed"`
 */
export const useReadAttestationArbiterIsEnvelopeConsumed =
  /*#__PURE__*/ createUseReadContract({
    abi: attestationArbiterAbi,
    functionName: 'isEnvelopeConsumed',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"manager"`
 */
export const useReadAttestationArbiterManager =
  /*#__PURE__*/ createUseReadContract({
    abi: attestationArbiterAbi,
    functionName: 'manager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"mutualOrdering"`
 */
export const useReadAttestationArbiterMutualOrdering =
  /*#__PURE__*/ createUseReadContract({
    abi: attestationArbiterAbi,
    functionName: 'mutualOrdering',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"serviceManager"`
 */
export const useReadAttestationArbiterServiceManager =
  /*#__PURE__*/ createUseReadContract({
    abi: attestationArbiterAbi,
    functionName: 'serviceManager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadAttestationArbiterSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: attestationArbiterAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link attestationArbiterAbi}__
 */
export const useWriteAttestationArbiter = /*#__PURE__*/ createUseWriteContract({
  abi: attestationArbiterAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"act"`
 */
export const useWriteAttestationArbiterAct =
  /*#__PURE__*/ createUseWriteContract({
    abi: attestationArbiterAbi,
    functionName: 'act',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link attestationArbiterAbi}__
 */
export const useSimulateAttestationArbiter =
  /*#__PURE__*/ createUseSimulateContract({ abi: attestationArbiterAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link attestationArbiterAbi}__ and `functionName` set to `"act"`
 */
export const useSimulateAttestationArbiterAct =
  /*#__PURE__*/ createUseSimulateContract({
    abi: attestationArbiterAbi,
    functionName: 'act',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link attestationArbiterAbi}__
 */
export const useWatchAttestationArbiterEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: attestationArbiterAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link attestationArbiterAbi}__ and `eventName` set to `"Acted"`
 */
export const useWatchAttestationArbiterActedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: attestationArbiterAbi,
    eventName: 'Acted',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link claimRouterAbi}__
 */
export const useReadClaimRouter = /*#__PURE__*/ createUseReadContract({
  abi: claimRouterAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link claimRouterAbi}__ and `functionName` set to `"claimant"`
 */
export const useReadClaimRouterClaimant = /*#__PURE__*/ createUseReadContract({
  abi: claimRouterAbi,
  functionName: 'claimant',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link claimRouterAbi}__ and `functionName` set to `"manager"`
 */
export const useReadClaimRouterManager = /*#__PURE__*/ createUseReadContract({
  abi: claimRouterAbi,
  functionName: 'manager',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link claimRouterAbi}__
 */
export const useWriteClaimRouter = /*#__PURE__*/ createUseWriteContract({
  abi: claimRouterAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link claimRouterAbi}__ and `functionName` set to `"collect"`
 */
export const useWriteClaimRouterCollect = /*#__PURE__*/ createUseWriteContract({
  abi: claimRouterAbi,
  functionName: 'collect',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link claimRouterAbi}__ and `functionName` set to `"settleAndCollect"`
 */
export const useWriteClaimRouterSettleAndCollect =
  /*#__PURE__*/ createUseWriteContract({
    abi: claimRouterAbi,
    functionName: 'settleAndCollect',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link claimRouterAbi}__
 */
export const useSimulateClaimRouter = /*#__PURE__*/ createUseSimulateContract({
  abi: claimRouterAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link claimRouterAbi}__ and `functionName` set to `"collect"`
 */
export const useSimulateClaimRouterCollect =
  /*#__PURE__*/ createUseSimulateContract({
    abi: claimRouterAbi,
    functionName: 'collect',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link claimRouterAbi}__ and `functionName` set to `"settleAndCollect"`
 */
export const useSimulateClaimRouterSettleAndCollect =
  /*#__PURE__*/ createUseSimulateContract({
    abi: claimRouterAbi,
    functionName: 'settleAndCollect',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link claimRouterAbi}__
 */
export const useWatchClaimRouterEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: claimRouterAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link claimRouterAbi}__ and `eventName` set to `"Collected"`
 */
export const useWatchClaimRouterCollectedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: claimRouterAbi,
    eventName: 'Collected',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link claimRouterAbi}__ and `eventName` set to `"Settled"`
 */
export const useWatchClaimRouterSettledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: claimRouterAbi,
    eventName: 'Settled',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__
 */
export const useReadCommitmentManager = /*#__PURE__*/ createUseReadContract({
  abi: commitmentManagerAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"CREATE_COMMITMENT_TYPEHASH"`
 */
export const useReadCommitmentManagerCreateCommitmentTypehash =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'CREATE_COMMITMENT_TYPEHASH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadCommitmentManagerDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"FORFEIT_PROPOSAL_TTL"`
 */
export const useReadCommitmentManagerForfeitProposalTtl =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'FORFEIT_PROPOSAL_TTL',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"HOOK_GAS_CAP_FLOOR"`
 */
export const useReadCommitmentManagerHookGasCapFloor =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'HOOK_GAS_CAP_FLOOR',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"MAX_METADATA_URI_LENGTH"`
 */
export const useReadCommitmentManagerMaxMetadataUriLength =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'MAX_METADATA_URI_LENGTH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"MAX_PROPOSAL_DURATION"`
 */
export const useReadCommitmentManagerMaxProposalDuration =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'MAX_PROPOSAL_DURATION',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"MAX_STRATEGIES"`
 */
export const useReadCommitmentManagerMaxStrategies =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'MAX_STRATEGIES',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"MIN_CHALLENGE_WINDOW"`
 */
export const useReadCommitmentManagerMinChallengeWindow =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'MIN_CHALLENGE_WINDOW',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"PAUSER_ROLE"`
 */
export const useReadCommitmentManagerPauserRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'PAUSER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"UNPAUSER_ROLE"`
 */
export const useReadCommitmentManagerUnpauserRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'UNPAUSER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"UPGRADE_INTERFACE_VERSION"`
 */
export const useReadCommitmentManagerUpgradeInterfaceVersion =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'UPGRADE_INTERFACE_VERSION',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"acceptsContributions"`
 */
export const useReadCommitmentManagerAcceptsContributions =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'acceptsContributions',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"agreementOf"`
 */
export const useReadCommitmentManagerAgreementOf =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'agreementOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"agreementOfProposal"`
 */
export const useReadCommitmentManagerAgreementOfProposal =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'agreementOfProposal',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"closedAt"`
 */
export const useReadCommitmentManagerClosedAt =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'closedAt',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"eip712Domain"`
 */
export const useReadCommitmentManagerEip712Domain =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'eip712Domain',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"encumberedBalance"`
 */
export const useReadCommitmentManagerEncumberedBalance =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'encumberedBalance',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"escrowOf"`
 */
export const useReadCommitmentManagerEscrowOf =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'escrowOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"failedHook"`
 */
export const useReadCommitmentManagerFailedHook =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'failedHook',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"forfeitedUnitsOf"`
 */
export const useReadCommitmentManagerForfeitedUnitsOf =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'forfeitedUnitsOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"forfeiturePaused"`
 */
export const useReadCommitmentManagerForfeiturePaused =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'forfeiturePaused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"freeBalance"`
 */
export const useReadCommitmentManagerFreeBalance =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'freeBalance',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getAgreementPair"`
 */
export const useReadCommitmentManagerGetAgreementPair =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getAgreementPair',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getAgreementSettlement"`
 */
export const useReadCommitmentManagerGetAgreementSettlement =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getAgreementSettlement',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getCommitment"`
 */
export const useReadCommitmentManagerGetCommitment =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getCommitment',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getForfeitProposal"`
 */
export const useReadCommitmentManagerGetForfeitProposal =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getForfeitProposal',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getMembership"`
 */
export const useReadCommitmentManagerGetMembership =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getMembership',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getMutual"`
 */
export const useReadCommitmentManagerGetMutual =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getMutual',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getMutualLossProposal"`
 */
export const useReadCommitmentManagerGetMutualLossProposal =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getMutualLossProposal',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getMutualPremiumState"`
 */
export const useReadCommitmentManagerGetMutualPremiumState =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getMutualPremiumState',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadCommitmentManagerGetRoleAdmin =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getUserCommitmentIds"`
 */
export const useReadCommitmentManagerGetUserCommitmentIds =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getUserCommitmentIds',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"getUserExposure"`
 */
export const useReadCommitmentManagerGetUserExposure =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getUserExposure',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadCommitmentManagerHasRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'hasRole',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"hookGasCap"`
 */
export const useReadCommitmentManagerHookGasCap =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'hookGasCap',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"ledgerTotals"`
 */
export const useReadCommitmentManagerLedgerTotals =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'ledgerTotals',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"nonces"`
 */
export const useReadCommitmentManagerNonces =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'nonces',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"operatorRegistry"`
 */
export const useReadCommitmentManagerOperatorRegistry =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'operatorRegistry',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"pauseState"`
 */
export const useReadCommitmentManagerPauseState =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'pauseState',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"pending"`
 */
export const useReadCommitmentManagerPending =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'pending',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"pendingMemberLoss"`
 */
export const useReadCommitmentManagerPendingMemberLoss =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'pendingMemberLoss',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"pendingMemberPremium"`
 */
export const useReadCommitmentManagerPendingMemberPremium =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'pendingMemberPremium',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"proxiableUUID"`
 */
export const useReadCommitmentManagerProxiableUuid =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'proxiableUUID',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"strategiesOf"`
 */
export const useReadCommitmentManagerStrategiesOf =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'strategiesOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadCommitmentManagerSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"unbondInitiatedAt"`
 */
export const useReadCommitmentManagerUnbondInitiatedAt =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'unbondInitiatedAt',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"unbondingPeriod"`
 */
export const useReadCommitmentManagerUnbondingPeriod =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentManagerAbi,
    functionName: 'unbondingPeriod',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__
 */
export const useWriteCommitmentManager = /*#__PURE__*/ createUseWriteContract({
  abi: commitmentManagerAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"__runStrategyHook"`
 */
export const useWriteCommitmentManagerRunStrategyHook =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: '__runStrategyHook',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"acceptAgreement"`
 */
export const useWriteCommitmentManagerAcceptAgreement =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'acceptAgreement',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"activateMutual"`
 */
export const useWriteCommitmentManagerActivateMutual =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'activateMutual',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"batchCreateCommitments"`
 */
export const useWriteCommitmentManagerBatchCreateCommitments =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'batchCreateCommitments',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"batchReleaseCommitments"`
 */
export const useWriteCommitmentManagerBatchReleaseCommitments =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'batchReleaseCommitments',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelAgreementProposal"`
 */
export const useWriteCommitmentManagerCancelAgreementProposal =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelAgreementProposal',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelForfeit"`
 */
export const useWriteCommitmentManagerCancelForfeit =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelForfeit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelMutualLoss"`
 */
export const useWriteCommitmentManagerCancelMutualLoss =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelMutualLoss',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelStaleForfeitProposal"`
 */
export const useWriteCommitmentManagerCancelStaleForfeitProposal =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelStaleForfeitProposal',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelStaleMutualLoss"`
 */
export const useWriteCommitmentManagerCancelStaleMutualLoss =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelStaleMutualLoss',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelUnbond"`
 */
export const useWriteCommitmentManagerCancelUnbond =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelUnbond',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"claim"`
 */
export const useWriteCommitmentManagerClaim =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'claim',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"claimMemberPremium"`
 */
export const useWriteCommitmentManagerClaimMemberPremium =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'claimMemberPremium',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"claimMembersPremium"`
 */
export const useWriteCommitmentManagerClaimMembersPremium =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'claimMembersPremium',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"contributeEncumbered"`
 */
export const useWriteCommitmentManagerContributeEncumbered =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'contributeEncumbered',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"createAndFund"`
 */
export const useWriteCommitmentManagerCreateAndFund =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'createAndFund',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"createCommitment"`
 */
export const useWriteCommitmentManagerCreateCommitment =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'createCommitment',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"createCommitmentFor"`
 */
export const useWriteCommitmentManagerCreateCommitmentFor =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'createCommitmentFor',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"createMutual"`
 */
export const useWriteCommitmentManagerCreateMutual =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'createMutual',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"deposit"`
 */
export const useWriteCommitmentManagerDeposit =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'deposit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"depositFor"`
 */
export const useWriteCommitmentManagerDepositFor =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'depositFor',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"depositWithPermit"`
 */
export const useWriteCommitmentManagerDepositWithPermit =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'depositWithPermit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"distribute"`
 */
export const useWriteCommitmentManagerDistribute =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'distribute',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"distributeAll"`
 */
export const useWriteCommitmentManagerDistributeAll =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'distributeAll',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"distributeAndClaim"`
 */
export const useWriteCommitmentManagerDistributeAndClaim =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'distributeAndClaim',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"executeForfeit"`
 */
export const useWriteCommitmentManagerExecuteForfeit =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'executeForfeit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"executeMutualLoss"`
 */
export const useWriteCommitmentManagerExecuteMutualLoss =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'executeMutualLoss',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"expireCommitment"`
 */
export const useWriteCommitmentManagerExpireCommitment =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'expireCommitment',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"finalizeUnbond"`
 */
export const useWriteCommitmentManagerFinalizeUnbond =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'finalizeUnbond',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"forceSetOperatorRegistry"`
 */
export const useWriteCommitmentManagerForceSetOperatorRegistry =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'forceSetOperatorRegistry',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"forfeitAgreement"`
 */
export const useWriteCommitmentManagerForfeitAgreement =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'forfeitAgreement',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"fundMutualPremium"`
 */
export const useWriteCommitmentManagerFundMutualPremium =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'fundMutualPremium',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"fundStrategy"`
 */
export const useWriteCommitmentManagerFundStrategy =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'fundStrategy',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteCommitmentManagerGrantRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteCommitmentManagerInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"initiateForfeit"`
 */
export const useWriteCommitmentManagerInitiateForfeit =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'initiateForfeit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"initiateMutualLoss"`
 */
export const useWriteCommitmentManagerInitiateMutualLoss =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'initiateMutualLoss',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"invalidateCreateAuthorization"`
 */
export const useWriteCommitmentManagerInvalidateCreateAuthorization =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'invalidateCreateAuthorization',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"joinMutual"`
 */
export const useWriteCommitmentManagerJoinMutual =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'joinMutual',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"pauseForfeiture"`
 */
export const useWriteCommitmentManagerPauseForfeiture =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'pauseForfeiture',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"proposeAgreement"`
 */
export const useWriteCommitmentManagerProposeAgreement =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'proposeAgreement',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"reclaimPremium"`
 */
export const useWriteCommitmentManagerReclaimPremium =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'reclaimPremium',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"releaseAgreement"`
 */
export const useWriteCommitmentManagerReleaseAgreement =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'releaseAgreement',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"releaseCommitment"`
 */
export const useWriteCommitmentManagerReleaseCommitment =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'releaseCommitment',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"releaseMutualMember"`
 */
export const useWriteCommitmentManagerReleaseMutualMember =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'releaseMutualMember',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteCommitmentManagerRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"requestAgreementUnbond"`
 */
export const useWriteCommitmentManagerRequestAgreementUnbond =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'requestAgreementUnbond',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"requestMutualExit"`
 */
export const useWriteCommitmentManagerRequestMutualExit =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'requestMutualExit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"requestUnbond"`
 */
export const useWriteCommitmentManagerRequestUnbond =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'requestUnbond',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteCommitmentManagerRevokeRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"setHookGasCap"`
 */
export const useWriteCommitmentManagerSetHookGasCap =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'setHookGasCap',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"setMinChallengeWindow"`
 */
export const useWriteCommitmentManagerSetMinChallengeWindow =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'setMinChallengeWindow',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"setOperatorRegistry"`
 */
export const useWriteCommitmentManagerSetOperatorRegistry =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'setOperatorRegistry',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"setUnbondingPeriod"`
 */
export const useWriteCommitmentManagerSetUnbondingPeriod =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'setUnbondingPeriod',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"settleAgreement"`
 */
export const useWriteCommitmentManagerSettleAgreement =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'settleAgreement',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"settleAndClaim"`
 */
export const useWriteCommitmentManagerSettleAndClaim =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'settleAndClaim',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"settleMemberLoss"`
 */
export const useWriteCommitmentManagerSettleMemberLoss =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'settleMemberLoss',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"settleMembers"`
 */
export const useWriteCommitmentManagerSettleMembers =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'settleMembers',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"sweepFailedHook"`
 */
export const useWriteCommitmentManagerSweepFailedHook =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'sweepFailedHook',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"unpauseForfeiture"`
 */
export const useWriteCommitmentManagerUnpauseForfeiture =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'unpauseForfeiture',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useWriteCommitmentManagerUpgradeToAndCall =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"withdraw"`
 */
export const useWriteCommitmentManagerWithdraw =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentManagerAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__
 */
export const useSimulateCommitmentManager =
  /*#__PURE__*/ createUseSimulateContract({ abi: commitmentManagerAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"__runStrategyHook"`
 */
export const useSimulateCommitmentManagerRunStrategyHook =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: '__runStrategyHook',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"acceptAgreement"`
 */
export const useSimulateCommitmentManagerAcceptAgreement =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'acceptAgreement',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"activateMutual"`
 */
export const useSimulateCommitmentManagerActivateMutual =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'activateMutual',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"batchCreateCommitments"`
 */
export const useSimulateCommitmentManagerBatchCreateCommitments =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'batchCreateCommitments',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"batchReleaseCommitments"`
 */
export const useSimulateCommitmentManagerBatchReleaseCommitments =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'batchReleaseCommitments',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelAgreementProposal"`
 */
export const useSimulateCommitmentManagerCancelAgreementProposal =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelAgreementProposal',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelForfeit"`
 */
export const useSimulateCommitmentManagerCancelForfeit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelForfeit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelMutualLoss"`
 */
export const useSimulateCommitmentManagerCancelMutualLoss =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelMutualLoss',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelStaleForfeitProposal"`
 */
export const useSimulateCommitmentManagerCancelStaleForfeitProposal =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelStaleForfeitProposal',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelStaleMutualLoss"`
 */
export const useSimulateCommitmentManagerCancelStaleMutualLoss =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelStaleMutualLoss',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"cancelUnbond"`
 */
export const useSimulateCommitmentManagerCancelUnbond =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'cancelUnbond',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"claim"`
 */
export const useSimulateCommitmentManagerClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'claim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"claimMemberPremium"`
 */
export const useSimulateCommitmentManagerClaimMemberPremium =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'claimMemberPremium',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"claimMembersPremium"`
 */
export const useSimulateCommitmentManagerClaimMembersPremium =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'claimMembersPremium',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"contributeEncumbered"`
 */
export const useSimulateCommitmentManagerContributeEncumbered =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'contributeEncumbered',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"createAndFund"`
 */
export const useSimulateCommitmentManagerCreateAndFund =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'createAndFund',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"createCommitment"`
 */
export const useSimulateCommitmentManagerCreateCommitment =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'createCommitment',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"createCommitmentFor"`
 */
export const useSimulateCommitmentManagerCreateCommitmentFor =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'createCommitmentFor',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"createMutual"`
 */
export const useSimulateCommitmentManagerCreateMutual =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'createMutual',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"deposit"`
 */
export const useSimulateCommitmentManagerDeposit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'deposit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"depositFor"`
 */
export const useSimulateCommitmentManagerDepositFor =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'depositFor',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"depositWithPermit"`
 */
export const useSimulateCommitmentManagerDepositWithPermit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'depositWithPermit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"distribute"`
 */
export const useSimulateCommitmentManagerDistribute =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'distribute',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"distributeAll"`
 */
export const useSimulateCommitmentManagerDistributeAll =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'distributeAll',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"distributeAndClaim"`
 */
export const useSimulateCommitmentManagerDistributeAndClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'distributeAndClaim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"executeForfeit"`
 */
export const useSimulateCommitmentManagerExecuteForfeit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'executeForfeit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"executeMutualLoss"`
 */
export const useSimulateCommitmentManagerExecuteMutualLoss =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'executeMutualLoss',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"expireCommitment"`
 */
export const useSimulateCommitmentManagerExpireCommitment =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'expireCommitment',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"finalizeUnbond"`
 */
export const useSimulateCommitmentManagerFinalizeUnbond =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'finalizeUnbond',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"forceSetOperatorRegistry"`
 */
export const useSimulateCommitmentManagerForceSetOperatorRegistry =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'forceSetOperatorRegistry',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"forfeitAgreement"`
 */
export const useSimulateCommitmentManagerForfeitAgreement =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'forfeitAgreement',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"fundMutualPremium"`
 */
export const useSimulateCommitmentManagerFundMutualPremium =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'fundMutualPremium',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"fundStrategy"`
 */
export const useSimulateCommitmentManagerFundStrategy =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'fundStrategy',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateCommitmentManagerGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateCommitmentManagerInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"initiateForfeit"`
 */
export const useSimulateCommitmentManagerInitiateForfeit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'initiateForfeit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"initiateMutualLoss"`
 */
export const useSimulateCommitmentManagerInitiateMutualLoss =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'initiateMutualLoss',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"invalidateCreateAuthorization"`
 */
export const useSimulateCommitmentManagerInvalidateCreateAuthorization =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'invalidateCreateAuthorization',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"joinMutual"`
 */
export const useSimulateCommitmentManagerJoinMutual =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'joinMutual',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"pauseForfeiture"`
 */
export const useSimulateCommitmentManagerPauseForfeiture =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'pauseForfeiture',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"proposeAgreement"`
 */
export const useSimulateCommitmentManagerProposeAgreement =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'proposeAgreement',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"reclaimPremium"`
 */
export const useSimulateCommitmentManagerReclaimPremium =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'reclaimPremium',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"releaseAgreement"`
 */
export const useSimulateCommitmentManagerReleaseAgreement =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'releaseAgreement',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"releaseCommitment"`
 */
export const useSimulateCommitmentManagerReleaseCommitment =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'releaseCommitment',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"releaseMutualMember"`
 */
export const useSimulateCommitmentManagerReleaseMutualMember =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'releaseMutualMember',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateCommitmentManagerRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"requestAgreementUnbond"`
 */
export const useSimulateCommitmentManagerRequestAgreementUnbond =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'requestAgreementUnbond',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"requestMutualExit"`
 */
export const useSimulateCommitmentManagerRequestMutualExit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'requestMutualExit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"requestUnbond"`
 */
export const useSimulateCommitmentManagerRequestUnbond =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'requestUnbond',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateCommitmentManagerRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"setHookGasCap"`
 */
export const useSimulateCommitmentManagerSetHookGasCap =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'setHookGasCap',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"setMinChallengeWindow"`
 */
export const useSimulateCommitmentManagerSetMinChallengeWindow =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'setMinChallengeWindow',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"setOperatorRegistry"`
 */
export const useSimulateCommitmentManagerSetOperatorRegistry =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'setOperatorRegistry',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"setUnbondingPeriod"`
 */
export const useSimulateCommitmentManagerSetUnbondingPeriod =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'setUnbondingPeriod',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"settleAgreement"`
 */
export const useSimulateCommitmentManagerSettleAgreement =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'settleAgreement',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"settleAndClaim"`
 */
export const useSimulateCommitmentManagerSettleAndClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'settleAndClaim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"settleMemberLoss"`
 */
export const useSimulateCommitmentManagerSettleMemberLoss =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'settleMemberLoss',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"settleMembers"`
 */
export const useSimulateCommitmentManagerSettleMembers =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'settleMembers',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"sweepFailedHook"`
 */
export const useSimulateCommitmentManagerSweepFailedHook =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'sweepFailedHook',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"unpauseForfeiture"`
 */
export const useSimulateCommitmentManagerUnpauseForfeiture =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'unpauseForfeiture',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useSimulateCommitmentManagerUpgradeToAndCall =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentManagerAbi}__ and `functionName` set to `"withdraw"`
 */
export const useSimulateCommitmentManagerWithdraw =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentManagerAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__
 */
export const useWatchCommitmentManagerEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: commitmentManagerAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"AgreementAccepted"`
 */
export const useWatchCommitmentManagerAgreementAcceptedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'AgreementAccepted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"AgreementForfeited"`
 */
export const useWatchCommitmentManagerAgreementForfeitedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'AgreementForfeited',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"AgreementPartialForfeit"`
 */
export const useWatchCommitmentManagerAgreementPartialForfeitEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'AgreementPartialForfeit',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"AgreementProposalCancelled"`
 */
export const useWatchCommitmentManagerAgreementProposalCancelledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'AgreementProposalCancelled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"AgreementProposalExpiredCancelled"`
 */
export const useWatchCommitmentManagerAgreementProposalExpiredCancelledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'AgreementProposalExpiredCancelled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"AgreementProposed"`
 */
export const useWatchCommitmentManagerAgreementProposedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'AgreementProposed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"AgreementProposedTerms"`
 */
export const useWatchCommitmentManagerAgreementProposedTermsEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'AgreementProposedTerms',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"AgreementReleased"`
 */
export const useWatchCommitmentManagerAgreementReleasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'AgreementReleased',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"AgreementSettled"`
 */
export const useWatchCommitmentManagerAgreementSettledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'AgreementSettled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"AgreementUnbondRequested"`
 */
export const useWatchCommitmentManagerAgreementUnbondRequestedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'AgreementUnbondRequested',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"CommitmentBoundToStrategy"`
 */
export const useWatchCommitmentManagerCommitmentBoundToStrategyEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'CommitmentBoundToStrategy',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"CommitmentCounterparty"`
 */
export const useWatchCommitmentManagerCommitmentCounterpartyEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'CommitmentCounterparty',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"CommitmentCreated"`
 */
export const useWatchCommitmentManagerCommitmentCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'CommitmentCreated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"CommitmentExpired"`
 */
export const useWatchCommitmentManagerCommitmentExpiredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'CommitmentExpired',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"CommitmentFinalized"`
 */
export const useWatchCommitmentManagerCommitmentFinalizedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'CommitmentFinalized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"CommitmentReleased"`
 */
export const useWatchCommitmentManagerCommitmentReleasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'CommitmentReleased',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"CommitmentUnbondCancelled"`
 */
export const useWatchCommitmentManagerCommitmentUnbondCancelledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'CommitmentUnbondCancelled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"CommitmentUnbondRequested"`
 */
export const useWatchCommitmentManagerCommitmentUnbondRequestedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'CommitmentUnbondRequested',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"ContributionsEnabled"`
 */
export const useWatchCommitmentManagerContributionsEnabledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'ContributionsEnabled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"CreateAuthorizationInvalidated"`
 */
export const useWatchCommitmentManagerCreateAuthorizationInvalidatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'CreateAuthorizationInvalidated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"Deposited"`
 */
export const useWatchCommitmentManagerDepositedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'Deposited',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"DistributionPaid"`
 */
export const useWatchCommitmentManagerDistributionPaidEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'DistributionPaid',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"EIP712DomainChanged"`
 */
export const useWatchCommitmentManagerEip712DomainChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'EIP712DomainChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"EncumbranceContributed"`
 */
export const useWatchCommitmentManagerEncumbranceContributedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'EncumbranceContributed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"EncumbranceIncreased"`
 */
export const useWatchCommitmentManagerEncumbranceIncreasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'EncumbranceIncreased',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"EncumbranceMovedToEscrow"`
 */
export const useWatchCommitmentManagerEncumbranceMovedToEscrowEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'EncumbranceMovedToEscrow',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"EncumbrancePaidExternal"`
 */
export const useWatchCommitmentManagerEncumbrancePaidExternalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'EncumbrancePaidExternal',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"EncumbranceReleased"`
 */
export const useWatchCommitmentManagerEncumbranceReleasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'EncumbranceReleased',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"EncumbranceTransferred"`
 */
export const useWatchCommitmentManagerEncumbranceTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'EncumbranceTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"ForfeitCancelled"`
 */
export const useWatchCommitmentManagerForfeitCancelledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'ForfeitCancelled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"ForfeitCancelledStale"`
 */
export const useWatchCommitmentManagerForfeitCancelledStaleEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'ForfeitCancelledStale',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"ForfeitExecuted"`
 */
export const useWatchCommitmentManagerForfeitExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'ForfeitExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"ForfeitInitiated"`
 */
export const useWatchCommitmentManagerForfeitInitiatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'ForfeitInitiated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"ForfeiturePauseToggled"`
 */
export const useWatchCommitmentManagerForfeiturePauseToggledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'ForfeiturePauseToggled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"HookGasCapUpdated"`
 */
export const useWatchCommitmentManagerHookGasCapUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'HookGasCapUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"Initialized"`
 */
export const useWatchCommitmentManagerInitializedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'Initialized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MemberExitRequested"`
 */
export const useWatchCommitmentManagerMemberExitRequestedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MemberExitRequested',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MemberJoined"`
 */
export const useWatchCommitmentManagerMemberJoinedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MemberJoined',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MemberPremiumClaimed"`
 */
export const useWatchCommitmentManagerMemberPremiumClaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MemberPremiumClaimed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MemberReleased"`
 */
export const useWatchCommitmentManagerMemberReleasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MemberReleased',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MemberSettled"`
 */
export const useWatchCommitmentManagerMemberSettledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MemberSettled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MinChallengeWindowUpdated"`
 */
export const useWatchCommitmentManagerMinChallengeWindowUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MinChallengeWindowUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MutualActivated"`
 */
export const useWatchCommitmentManagerMutualActivatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MutualActivated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MutualCreated"`
 */
export const useWatchCommitmentManagerMutualCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MutualCreated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MutualLossCancelled"`
 */
export const useWatchCommitmentManagerMutualLossCancelledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MutualLossCancelled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MutualLossExecuted"`
 */
export const useWatchCommitmentManagerMutualLossExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MutualLossExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MutualLossInitiated"`
 */
export const useWatchCommitmentManagerMutualLossInitiatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MutualLossInitiated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MutualLossShortfall"`
 */
export const useWatchCommitmentManagerMutualLossShortfallEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MutualLossShortfall',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MutualPremiumFunded"`
 */
export const useWatchCommitmentManagerMutualPremiumFundedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MutualPremiumFunded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MutualPremiumSwept"`
 */
export const useWatchCommitmentManagerMutualPremiumSweptEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MutualPremiumSwept',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"MutualTerminated"`
 */
export const useWatchCommitmentManagerMutualTerminatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'MutualTerminated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"OperatorRegistryUpdated"`
 */
export const useWatchCommitmentManagerOperatorRegistryUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'OperatorRegistryUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"PremiumReclaimed"`
 */
export const useWatchCommitmentManagerPremiumReclaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'PremiumReclaimed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"RegistryHookFailed"`
 */
export const useWatchCommitmentManagerRegistryHookFailedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'RegistryHookFailed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchCommitmentManagerRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchCommitmentManagerRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchCommitmentManagerRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"StrategyFunded"`
 */
export const useWatchCommitmentManagerStrategyFundedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'StrategyFunded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"StrategyHookFailed"`
 */
export const useWatchCommitmentManagerStrategyHookFailedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'StrategyHookFailed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"UnbondingPeriodUpdated"`
 */
export const useWatchCommitmentManagerUnbondingPeriodUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'UnbondingPeriodUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"Upgraded"`
 */
export const useWatchCommitmentManagerUpgradedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'Upgraded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentManagerAbi}__ and `eventName` set to `"Withdrawn"`
 */
export const useWatchCommitmentManagerWithdrawnEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentManagerAbi,
    eventName: 'Withdrawn',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__
 */
export const useReadCommitmentsGovernor = /*#__PURE__*/ createUseReadContract({
  abi: commitmentsGovernorAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"BALLOT_TYPEHASH"`
 */
export const useReadCommitmentsGovernorBallotTypehash =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'BALLOT_TYPEHASH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"CLOCK_MODE"`
 */
export const useReadCommitmentsGovernorClockMode =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'CLOCK_MODE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"COUNTING_MODE"`
 */
export const useReadCommitmentsGovernorCountingMode =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'COUNTING_MODE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"EXTENDED_BALLOT_TYPEHASH"`
 */
export const useReadCommitmentsGovernorExtendedBallotTypehash =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'EXTENDED_BALLOT_TYPEHASH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"UPGRADE_INTERFACE_VERSION"`
 */
export const useReadCommitmentsGovernorUpgradeInterfaceVersion =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'UPGRADE_INTERFACE_VERSION',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"clock"`
 */
export const useReadCommitmentsGovernorClock =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'clock',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"eip712Domain"`
 */
export const useReadCommitmentsGovernorEip712Domain =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'eip712Domain',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"getProposalId"`
 */
export const useReadCommitmentsGovernorGetProposalId =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'getProposalId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"getVotes"`
 */
export const useReadCommitmentsGovernorGetVotes =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'getVotes',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"getVotesWithParams"`
 */
export const useReadCommitmentsGovernorGetVotesWithParams =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'getVotesWithParams',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"hasVoted"`
 */
export const useReadCommitmentsGovernorHasVoted =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'hasVoted',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"hashProposal"`
 */
export const useReadCommitmentsGovernorHashProposal =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'hashProposal',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"lateQuorumVoteExtension"`
 */
export const useReadCommitmentsGovernorLateQuorumVoteExtension =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'lateQuorumVoteExtension',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"name"`
 */
export const useReadCommitmentsGovernorName =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'name',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"nonces"`
 */
export const useReadCommitmentsGovernorNonces =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'nonces',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"proposalDeadline"`
 */
export const useReadCommitmentsGovernorProposalDeadline =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'proposalDeadline',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"proposalEta"`
 */
export const useReadCommitmentsGovernorProposalEta =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'proposalEta',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"proposalNeedsQueuing"`
 */
export const useReadCommitmentsGovernorProposalNeedsQueuing =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'proposalNeedsQueuing',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"proposalProposer"`
 */
export const useReadCommitmentsGovernorProposalProposer =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'proposalProposer',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"proposalSnapshot"`
 */
export const useReadCommitmentsGovernorProposalSnapshot =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'proposalSnapshot',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"proposalThreshold"`
 */
export const useReadCommitmentsGovernorProposalThreshold =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'proposalThreshold',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"proposalVotes"`
 */
export const useReadCommitmentsGovernorProposalVotes =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'proposalVotes',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"proxiableUUID"`
 */
export const useReadCommitmentsGovernorProxiableUuid =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'proxiableUUID',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"quorum"`
 */
export const useReadCommitmentsGovernorQuorum =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'quorum',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"quorumDenominator"`
 */
export const useReadCommitmentsGovernorQuorumDenominator =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'quorumDenominator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"quorumNumerator"`
 */
export const useReadCommitmentsGovernorQuorumNumerator =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'quorumNumerator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"state"`
 */
export const useReadCommitmentsGovernorState =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'state',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadCommitmentsGovernorSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"timelock"`
 */
export const useReadCommitmentsGovernorTimelock =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'timelock',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"token"`
 */
export const useReadCommitmentsGovernorToken =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'token',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"version"`
 */
export const useReadCommitmentsGovernorVersion =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'version',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"votingDelay"`
 */
export const useReadCommitmentsGovernorVotingDelay =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'votingDelay',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"votingPeriod"`
 */
export const useReadCommitmentsGovernorVotingPeriod =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsGovernorAbi,
    functionName: 'votingPeriod',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__
 */
export const useWriteCommitmentsGovernor = /*#__PURE__*/ createUseWriteContract(
  { abi: commitmentsGovernorAbi },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"cancel"`
 */
export const useWriteCommitmentsGovernorCancel =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'cancel',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"castVote"`
 */
export const useWriteCommitmentsGovernorCastVote =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'castVote',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"castVoteBySig"`
 */
export const useWriteCommitmentsGovernorCastVoteBySig =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'castVoteBySig',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"castVoteWithReason"`
 */
export const useWriteCommitmentsGovernorCastVoteWithReason =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'castVoteWithReason',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"castVoteWithReasonAndParams"`
 */
export const useWriteCommitmentsGovernorCastVoteWithReasonAndParams =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'castVoteWithReasonAndParams',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"castVoteWithReasonAndParamsBySig"`
 */
export const useWriteCommitmentsGovernorCastVoteWithReasonAndParamsBySig =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'castVoteWithReasonAndParamsBySig',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"execute"`
 */
export const useWriteCommitmentsGovernorExecute =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'execute',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteCommitmentsGovernorInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"onERC1155BatchReceived"`
 */
export const useWriteCommitmentsGovernorOnErc1155BatchReceived =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'onERC1155BatchReceived',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"onERC1155Received"`
 */
export const useWriteCommitmentsGovernorOnErc1155Received =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'onERC1155Received',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"onERC721Received"`
 */
export const useWriteCommitmentsGovernorOnErc721Received =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'onERC721Received',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"propose"`
 */
export const useWriteCommitmentsGovernorPropose =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'propose',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"queue"`
 */
export const useWriteCommitmentsGovernorQueue =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'queue',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"relay"`
 */
export const useWriteCommitmentsGovernorRelay =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'relay',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"setLateQuorumVoteExtension"`
 */
export const useWriteCommitmentsGovernorSetLateQuorumVoteExtension =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'setLateQuorumVoteExtension',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"setProposalThreshold"`
 */
export const useWriteCommitmentsGovernorSetProposalThreshold =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'setProposalThreshold',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"setVotingDelay"`
 */
export const useWriteCommitmentsGovernorSetVotingDelay =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'setVotingDelay',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"setVotingPeriod"`
 */
export const useWriteCommitmentsGovernorSetVotingPeriod =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'setVotingPeriod',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"updateQuorumNumerator"`
 */
export const useWriteCommitmentsGovernorUpdateQuorumNumerator =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'updateQuorumNumerator',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"updateTimelock"`
 */
export const useWriteCommitmentsGovernorUpdateTimelock =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'updateTimelock',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useWriteCommitmentsGovernorUpgradeToAndCall =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsGovernorAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__
 */
export const useSimulateCommitmentsGovernor =
  /*#__PURE__*/ createUseSimulateContract({ abi: commitmentsGovernorAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"cancel"`
 */
export const useSimulateCommitmentsGovernorCancel =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'cancel',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"castVote"`
 */
export const useSimulateCommitmentsGovernorCastVote =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'castVote',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"castVoteBySig"`
 */
export const useSimulateCommitmentsGovernorCastVoteBySig =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'castVoteBySig',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"castVoteWithReason"`
 */
export const useSimulateCommitmentsGovernorCastVoteWithReason =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'castVoteWithReason',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"castVoteWithReasonAndParams"`
 */
export const useSimulateCommitmentsGovernorCastVoteWithReasonAndParams =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'castVoteWithReasonAndParams',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"castVoteWithReasonAndParamsBySig"`
 */
export const useSimulateCommitmentsGovernorCastVoteWithReasonAndParamsBySig =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'castVoteWithReasonAndParamsBySig',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"execute"`
 */
export const useSimulateCommitmentsGovernorExecute =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'execute',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateCommitmentsGovernorInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"onERC1155BatchReceived"`
 */
export const useSimulateCommitmentsGovernorOnErc1155BatchReceived =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'onERC1155BatchReceived',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"onERC1155Received"`
 */
export const useSimulateCommitmentsGovernorOnErc1155Received =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'onERC1155Received',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"onERC721Received"`
 */
export const useSimulateCommitmentsGovernorOnErc721Received =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'onERC721Received',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"propose"`
 */
export const useSimulateCommitmentsGovernorPropose =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'propose',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"queue"`
 */
export const useSimulateCommitmentsGovernorQueue =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'queue',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"relay"`
 */
export const useSimulateCommitmentsGovernorRelay =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'relay',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"setLateQuorumVoteExtension"`
 */
export const useSimulateCommitmentsGovernorSetLateQuorumVoteExtension =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'setLateQuorumVoteExtension',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"setProposalThreshold"`
 */
export const useSimulateCommitmentsGovernorSetProposalThreshold =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'setProposalThreshold',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"setVotingDelay"`
 */
export const useSimulateCommitmentsGovernorSetVotingDelay =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'setVotingDelay',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"setVotingPeriod"`
 */
export const useSimulateCommitmentsGovernorSetVotingPeriod =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'setVotingPeriod',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"updateQuorumNumerator"`
 */
export const useSimulateCommitmentsGovernorUpdateQuorumNumerator =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'updateQuorumNumerator',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"updateTimelock"`
 */
export const useSimulateCommitmentsGovernorUpdateTimelock =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'updateTimelock',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useSimulateCommitmentsGovernorUpgradeToAndCall =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsGovernorAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__
 */
export const useWatchCommitmentsGovernorEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: commitmentsGovernorAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"EIP712DomainChanged"`
 */
export const useWatchCommitmentsGovernorEip712DomainChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'EIP712DomainChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"Initialized"`
 */
export const useWatchCommitmentsGovernorInitializedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'Initialized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"LateQuorumVoteExtensionSet"`
 */
export const useWatchCommitmentsGovernorLateQuorumVoteExtensionSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'LateQuorumVoteExtensionSet',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"ProposalCanceled"`
 */
export const useWatchCommitmentsGovernorProposalCanceledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'ProposalCanceled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"ProposalCreated"`
 */
export const useWatchCommitmentsGovernorProposalCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'ProposalCreated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"ProposalExecuted"`
 */
export const useWatchCommitmentsGovernorProposalExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'ProposalExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"ProposalExtended"`
 */
export const useWatchCommitmentsGovernorProposalExtendedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'ProposalExtended',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"ProposalQueued"`
 */
export const useWatchCommitmentsGovernorProposalQueuedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'ProposalQueued',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"ProposalThresholdSet"`
 */
export const useWatchCommitmentsGovernorProposalThresholdSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'ProposalThresholdSet',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"QuorumNumeratorUpdated"`
 */
export const useWatchCommitmentsGovernorQuorumNumeratorUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'QuorumNumeratorUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"TimelockChange"`
 */
export const useWatchCommitmentsGovernorTimelockChangeEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'TimelockChange',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"Upgraded"`
 */
export const useWatchCommitmentsGovernorUpgradedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'Upgraded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"VoteCast"`
 */
export const useWatchCommitmentsGovernorVoteCastEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'VoteCast',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"VoteCastWithParams"`
 */
export const useWatchCommitmentsGovernorVoteCastWithParamsEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'VoteCastWithParams',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"VotingDelaySet"`
 */
export const useWatchCommitmentsGovernorVotingDelaySetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'VotingDelaySet',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsGovernorAbi}__ and `eventName` set to `"VotingPeriodSet"`
 */
export const useWatchCommitmentsGovernorVotingPeriodSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsGovernorAbi,
    eventName: 'VotingPeriodSet',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__
 */
export const useReadCommitmentsTimelock = /*#__PURE__*/ createUseReadContract({
  abi: commitmentsTimelockAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"CANCELLER_ROLE"`
 */
export const useReadCommitmentsTimelockCancellerRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'CANCELLER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadCommitmentsTimelockDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"EXECUTOR_ROLE"`
 */
export const useReadCommitmentsTimelockExecutorRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'EXECUTOR_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"PROPOSER_ROLE"`
 */
export const useReadCommitmentsTimelockProposerRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'PROPOSER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"getMinDelay"`
 */
export const useReadCommitmentsTimelockGetMinDelay =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'getMinDelay',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"getOperationState"`
 */
export const useReadCommitmentsTimelockGetOperationState =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'getOperationState',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadCommitmentsTimelockGetRoleAdmin =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"getTimestamp"`
 */
export const useReadCommitmentsTimelockGetTimestamp =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'getTimestamp',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadCommitmentsTimelockHasRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'hasRole',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"hashOperation"`
 */
export const useReadCommitmentsTimelockHashOperation =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'hashOperation',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"hashOperationBatch"`
 */
export const useReadCommitmentsTimelockHashOperationBatch =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'hashOperationBatch',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"isOperation"`
 */
export const useReadCommitmentsTimelockIsOperation =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'isOperation',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"isOperationDone"`
 */
export const useReadCommitmentsTimelockIsOperationDone =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'isOperationDone',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"isOperationPending"`
 */
export const useReadCommitmentsTimelockIsOperationPending =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'isOperationPending',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"isOperationReady"`
 */
export const useReadCommitmentsTimelockIsOperationReady =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'isOperationReady',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadCommitmentsTimelockSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsTimelockAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__
 */
export const useWriteCommitmentsTimelock = /*#__PURE__*/ createUseWriteContract(
  { abi: commitmentsTimelockAbi },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"cancel"`
 */
export const useWriteCommitmentsTimelockCancel =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'cancel',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"execute"`
 */
export const useWriteCommitmentsTimelockExecute =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'execute',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"executeBatch"`
 */
export const useWriteCommitmentsTimelockExecuteBatch =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'executeBatch',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteCommitmentsTimelockGrantRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteCommitmentsTimelockInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"onERC1155BatchReceived"`
 */
export const useWriteCommitmentsTimelockOnErc1155BatchReceived =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'onERC1155BatchReceived',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"onERC1155Received"`
 */
export const useWriteCommitmentsTimelockOnErc1155Received =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'onERC1155Received',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"onERC721Received"`
 */
export const useWriteCommitmentsTimelockOnErc721Received =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'onERC721Received',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteCommitmentsTimelockRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteCommitmentsTimelockRevokeRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"schedule"`
 */
export const useWriteCommitmentsTimelockSchedule =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'schedule',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"scheduleBatch"`
 */
export const useWriteCommitmentsTimelockScheduleBatch =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'scheduleBatch',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"updateDelay"`
 */
export const useWriteCommitmentsTimelockUpdateDelay =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsTimelockAbi,
    functionName: 'updateDelay',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__
 */
export const useSimulateCommitmentsTimelock =
  /*#__PURE__*/ createUseSimulateContract({ abi: commitmentsTimelockAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"cancel"`
 */
export const useSimulateCommitmentsTimelockCancel =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'cancel',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"execute"`
 */
export const useSimulateCommitmentsTimelockExecute =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'execute',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"executeBatch"`
 */
export const useSimulateCommitmentsTimelockExecuteBatch =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'executeBatch',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateCommitmentsTimelockGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateCommitmentsTimelockInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"onERC1155BatchReceived"`
 */
export const useSimulateCommitmentsTimelockOnErc1155BatchReceived =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'onERC1155BatchReceived',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"onERC1155Received"`
 */
export const useSimulateCommitmentsTimelockOnErc1155Received =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'onERC1155Received',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"onERC721Received"`
 */
export const useSimulateCommitmentsTimelockOnErc721Received =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'onERC721Received',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateCommitmentsTimelockRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateCommitmentsTimelockRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"schedule"`
 */
export const useSimulateCommitmentsTimelockSchedule =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'schedule',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"scheduleBatch"`
 */
export const useSimulateCommitmentsTimelockScheduleBatch =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'scheduleBatch',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `functionName` set to `"updateDelay"`
 */
export const useSimulateCommitmentsTimelockUpdateDelay =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsTimelockAbi,
    functionName: 'updateDelay',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsTimelockAbi}__
 */
export const useWatchCommitmentsTimelockEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: commitmentsTimelockAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `eventName` set to `"CallExecuted"`
 */
export const useWatchCommitmentsTimelockCallExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsTimelockAbi,
    eventName: 'CallExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `eventName` set to `"CallSalt"`
 */
export const useWatchCommitmentsTimelockCallSaltEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsTimelockAbi,
    eventName: 'CallSalt',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `eventName` set to `"CallScheduled"`
 */
export const useWatchCommitmentsTimelockCallScheduledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsTimelockAbi,
    eventName: 'CallScheduled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `eventName` set to `"Cancelled"`
 */
export const useWatchCommitmentsTimelockCancelledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsTimelockAbi,
    eventName: 'Cancelled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `eventName` set to `"Initialized"`
 */
export const useWatchCommitmentsTimelockInitializedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsTimelockAbi,
    eventName: 'Initialized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `eventName` set to `"MinDelayChange"`
 */
export const useWatchCommitmentsTimelockMinDelayChangeEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsTimelockAbi,
    eventName: 'MinDelayChange',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchCommitmentsTimelockRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsTimelockAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchCommitmentsTimelockRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsTimelockAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsTimelockAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchCommitmentsTimelockRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsTimelockAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__
 */
export const useReadCommitmentsVault = /*#__PURE__*/ createUseReadContract({
  abi: commitmentsVaultAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadCommitmentsVaultDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"MAX_METADATA_URI_LENGTH"`
 */
export const useReadCommitmentsVaultMaxMetadataUriLength =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'MAX_METADATA_URI_LENGTH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"PAUSER_ROLE"`
 */
export const useReadCommitmentsVaultPauserRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'PAUSER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"UNPAUSER_ROLE"`
 */
export const useReadCommitmentsVaultUnpauserRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'UNPAUSER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"UPGRADE_INTERFACE_VERSION"`
 */
export const useReadCommitmentsVaultUpgradeInterfaceVersion =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'UPGRADE_INTERFACE_VERSION',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadCommitmentsVaultAllowance =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'allowance',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"asset"`
 */
export const useReadCommitmentsVaultAsset = /*#__PURE__*/ createUseReadContract(
  { abi: commitmentsVaultAbi, functionName: 'asset' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadCommitmentsVaultBalanceOf =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'balanceOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"convertToAssets"`
 */
export const useReadCommitmentsVaultConvertToAssets =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'convertToAssets',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"convertToShares"`
 */
export const useReadCommitmentsVaultConvertToShares =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'convertToShares',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadCommitmentsVaultDecimals =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'decimals',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"depositsPaused"`
 */
export const useReadCommitmentsVaultDepositsPaused =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'depositsPaused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"factoryTypeId"`
 */
export const useReadCommitmentsVaultFactoryTypeId =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'factoryTypeId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"getMetadata"`
 */
export const useReadCommitmentsVaultGetMetadata =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'getMetadata',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadCommitmentsVaultGetRoleAdmin =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadCommitmentsVaultHasRole =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'hasRole',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"maxDeposit"`
 */
export const useReadCommitmentsVaultMaxDeposit =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'maxDeposit',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"maxMint"`
 */
export const useReadCommitmentsVaultMaxMint =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'maxMint',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"maxRedeem"`
 */
export const useReadCommitmentsVaultMaxRedeem =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'maxRedeem',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"maxWithdraw"`
 */
export const useReadCommitmentsVaultMaxWithdraw =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'maxWithdraw',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"name"`
 */
export const useReadCommitmentsVaultName = /*#__PURE__*/ createUseReadContract({
  abi: commitmentsVaultAbi,
  functionName: 'name',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"previewDeposit"`
 */
export const useReadCommitmentsVaultPreviewDeposit =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'previewDeposit',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"previewMint"`
 */
export const useReadCommitmentsVaultPreviewMint =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'previewMint',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"previewRedeem"`
 */
export const useReadCommitmentsVaultPreviewRedeem =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'previewRedeem',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"previewWithdraw"`
 */
export const useReadCommitmentsVaultPreviewWithdraw =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'previewWithdraw',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"proxiableUUID"`
 */
export const useReadCommitmentsVaultProxiableUuid =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'proxiableUUID',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadCommitmentsVaultSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadCommitmentsVaultSymbol =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'symbol',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"totalAssets"`
 */
export const useReadCommitmentsVaultTotalAssets =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'totalAssets',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadCommitmentsVaultTotalSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'totalSupply',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"yieldStrategy"`
 */
export const useReadCommitmentsVaultYieldStrategy =
  /*#__PURE__*/ createUseReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'yieldStrategy',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__
 */
export const useWriteCommitmentsVault = /*#__PURE__*/ createUseWriteContract({
  abi: commitmentsVaultAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteCommitmentsVaultApprove =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"deposit"`
 */
export const useWriteCommitmentsVaultDeposit =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'deposit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"donate"`
 */
export const useWriteCommitmentsVaultDonate =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'donate',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteCommitmentsVaultGrantRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteCommitmentsVaultInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"mint"`
 */
export const useWriteCommitmentsVaultMint =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'mint',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"pauseDeposits"`
 */
export const useWriteCommitmentsVaultPauseDeposits =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'pauseDeposits',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"redeem"`
 */
export const useWriteCommitmentsVaultRedeem =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'redeem',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteCommitmentsVaultRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteCommitmentsVaultRevokeRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"setMetadata"`
 */
export const useWriteCommitmentsVaultSetMetadata =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'setMetadata',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"setYieldStrategy"`
 */
export const useWriteCommitmentsVaultSetYieldStrategy =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'setYieldStrategy',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteCommitmentsVaultTransfer =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteCommitmentsVaultTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"unpauseDeposits"`
 */
export const useWriteCommitmentsVaultUnpauseDeposits =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'unpauseDeposits',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useWriteCommitmentsVaultUpgradeToAndCall =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"withdraw"`
 */
export const useWriteCommitmentsVaultWithdraw =
  /*#__PURE__*/ createUseWriteContract({
    abi: commitmentsVaultAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__
 */
export const useSimulateCommitmentsVault =
  /*#__PURE__*/ createUseSimulateContract({ abi: commitmentsVaultAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateCommitmentsVaultApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"deposit"`
 */
export const useSimulateCommitmentsVaultDeposit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'deposit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"donate"`
 */
export const useSimulateCommitmentsVaultDonate =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'donate',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateCommitmentsVaultGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateCommitmentsVaultInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"mint"`
 */
export const useSimulateCommitmentsVaultMint =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'mint',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"pauseDeposits"`
 */
export const useSimulateCommitmentsVaultPauseDeposits =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'pauseDeposits',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"redeem"`
 */
export const useSimulateCommitmentsVaultRedeem =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'redeem',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateCommitmentsVaultRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateCommitmentsVaultRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"setMetadata"`
 */
export const useSimulateCommitmentsVaultSetMetadata =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'setMetadata',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"setYieldStrategy"`
 */
export const useSimulateCommitmentsVaultSetYieldStrategy =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'setYieldStrategy',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateCommitmentsVaultTransfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateCommitmentsVaultTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"unpauseDeposits"`
 */
export const useSimulateCommitmentsVaultUnpauseDeposits =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'unpauseDeposits',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useSimulateCommitmentsVaultUpgradeToAndCall =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `functionName` set to `"withdraw"`
 */
export const useSimulateCommitmentsVaultWithdraw =
  /*#__PURE__*/ createUseSimulateContract({
    abi: commitmentsVaultAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__
 */
export const useWatchCommitmentsVaultEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: commitmentsVaultAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchCommitmentsVaultApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"Deposit"`
 */
export const useWatchCommitmentsVaultDepositEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'Deposit',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"DepositsPauseToggled"`
 */
export const useWatchCommitmentsVaultDepositsPauseToggledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'DepositsPauseToggled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"Donation"`
 */
export const useWatchCommitmentsVaultDonationEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'Donation',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"Initialized"`
 */
export const useWatchCommitmentsVaultInitializedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'Initialized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchCommitmentsVaultRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchCommitmentsVaultRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchCommitmentsVaultRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchCommitmentsVaultTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'Transfer',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"Upgraded"`
 */
export const useWatchCommitmentsVaultUpgradedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'Upgraded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"VaultMetadataUpdated"`
 */
export const useWatchCommitmentsVaultVaultMetadataUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'VaultMetadataUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"Withdraw"`
 */
export const useWatchCommitmentsVaultWithdrawEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'Withdraw',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link commitmentsVaultAbi}__ and `eventName` set to `"YieldStrategyUpdated"`
 */
export const useWatchCommitmentsVaultYieldStrategyUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: commitmentsVaultAbi,
    eventName: 'YieldStrategyUpdated',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__
 */
export const useReadErc8004IdentityRegistryDev =
  /*#__PURE__*/ createUseReadContract({ abi: erc8004IdentityRegistryDevAbi })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"UPGRADE_INTERFACE_VERSION"`
 */
export const useReadErc8004IdentityRegistryDevUpgradeInterfaceVersion =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'UPGRADE_INTERFACE_VERSION',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadErc8004IdentityRegistryDevBalanceOf =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'balanceOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"eip712Domain"`
 */
export const useReadErc8004IdentityRegistryDevEip712Domain =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'eip712Domain',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"getAgentWallet"`
 */
export const useReadErc8004IdentityRegistryDevGetAgentWallet =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'getAgentWallet',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"getApproved"`
 */
export const useReadErc8004IdentityRegistryDevGetApproved =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'getApproved',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"getMetadata"`
 */
export const useReadErc8004IdentityRegistryDevGetMetadata =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'getMetadata',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"getVersion"`
 */
export const useReadErc8004IdentityRegistryDevGetVersion =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'getVersion',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"isApprovedForAll"`
 */
export const useReadErc8004IdentityRegistryDevIsApprovedForAll =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'isApprovedForAll',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"isAuthorizedOrOwner"`
 */
export const useReadErc8004IdentityRegistryDevIsAuthorizedOrOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'isAuthorizedOrOwner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"name"`
 */
export const useReadErc8004IdentityRegistryDevName =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'name',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"owner"`
 */
export const useReadErc8004IdentityRegistryDevOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"ownerOf"`
 */
export const useReadErc8004IdentityRegistryDevOwnerOf =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'ownerOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"proxiableUUID"`
 */
export const useReadErc8004IdentityRegistryDevProxiableUuid =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'proxiableUUID',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadErc8004IdentityRegistryDevSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadErc8004IdentityRegistryDevSymbol =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'symbol',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"tokenURI"`
 */
export const useReadErc8004IdentityRegistryDevTokenUri =
  /*#__PURE__*/ createUseReadContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'tokenURI',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__
 */
export const useWriteErc8004IdentityRegistryDev =
  /*#__PURE__*/ createUseWriteContract({ abi: erc8004IdentityRegistryDevAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteErc8004IdentityRegistryDevApprove =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteErc8004IdentityRegistryDevInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"initializeDev"`
 */
export const useWriteErc8004IdentityRegistryDevInitializeDev =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'initializeDev',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"register"`
 */
export const useWriteErc8004IdentityRegistryDevRegister =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'register',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteErc8004IdentityRegistryDevRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"safeTransferFrom"`
 */
export const useWriteErc8004IdentityRegistryDevSafeTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'safeTransferFrom',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"setAgentURI"`
 */
export const useWriteErc8004IdentityRegistryDevSetAgentUri =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'setAgentURI',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"setAgentWallet"`
 */
export const useWriteErc8004IdentityRegistryDevSetAgentWallet =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'setAgentWallet',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"setApprovalForAll"`
 */
export const useWriteErc8004IdentityRegistryDevSetApprovalForAll =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'setApprovalForAll',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"setMetadata"`
 */
export const useWriteErc8004IdentityRegistryDevSetMetadata =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'setMetadata',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteErc8004IdentityRegistryDevTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteErc8004IdentityRegistryDevTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"unsetAgentWallet"`
 */
export const useWriteErc8004IdentityRegistryDevUnsetAgentWallet =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'unsetAgentWallet',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useWriteErc8004IdentityRegistryDevUpgradeToAndCall =
  /*#__PURE__*/ createUseWriteContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__
 */
export const useSimulateErc8004IdentityRegistryDev =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateErc8004IdentityRegistryDevApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateErc8004IdentityRegistryDevInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"initializeDev"`
 */
export const useSimulateErc8004IdentityRegistryDevInitializeDev =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'initializeDev',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"register"`
 */
export const useSimulateErc8004IdentityRegistryDevRegister =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'register',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateErc8004IdentityRegistryDevRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"safeTransferFrom"`
 */
export const useSimulateErc8004IdentityRegistryDevSafeTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'safeTransferFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"setAgentURI"`
 */
export const useSimulateErc8004IdentityRegistryDevSetAgentUri =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'setAgentURI',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"setAgentWallet"`
 */
export const useSimulateErc8004IdentityRegistryDevSetAgentWallet =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'setAgentWallet',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"setApprovalForAll"`
 */
export const useSimulateErc8004IdentityRegistryDevSetApprovalForAll =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'setApprovalForAll',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"setMetadata"`
 */
export const useSimulateErc8004IdentityRegistryDevSetMetadata =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'setMetadata',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateErc8004IdentityRegistryDevTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateErc8004IdentityRegistryDevTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"unsetAgentWallet"`
 */
export const useSimulateErc8004IdentityRegistryDevUnsetAgentWallet =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'unsetAgentWallet',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useSimulateErc8004IdentityRegistryDevUpgradeToAndCall =
  /*#__PURE__*/ createUseSimulateContract({
    abi: erc8004IdentityRegistryDevAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__
 */
export const useWatchErc8004IdentityRegistryDevEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchErc8004IdentityRegistryDevApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"ApprovalForAll"`
 */
export const useWatchErc8004IdentityRegistryDevApprovalForAllEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'ApprovalForAll',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"BatchMetadataUpdate"`
 */
export const useWatchErc8004IdentityRegistryDevBatchMetadataUpdateEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'BatchMetadataUpdate',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"EIP712DomainChanged"`
 */
export const useWatchErc8004IdentityRegistryDevEip712DomainChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'EIP712DomainChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"Initialized"`
 */
export const useWatchErc8004IdentityRegistryDevInitializedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'Initialized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"MetadataSet"`
 */
export const useWatchErc8004IdentityRegistryDevMetadataSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'MetadataSet',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"MetadataUpdate"`
 */
export const useWatchErc8004IdentityRegistryDevMetadataUpdateEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'MetadataUpdate',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchErc8004IdentityRegistryDevOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"Registered"`
 */
export const useWatchErc8004IdentityRegistryDevRegisteredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'Registered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchErc8004IdentityRegistryDevTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'Transfer',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"URIUpdated"`
 */
export const useWatchErc8004IdentityRegistryDevUriUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'URIUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link erc8004IdentityRegistryDevAbi}__ and `eventName` set to `"Upgraded"`
 */
export const useWatchErc8004IdentityRegistryDevUpgradedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: erc8004IdentityRegistryDevAbi,
    eventName: 'Upgraded',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanInNodeAbi}__
 */
export const useReadFanInNode = /*#__PURE__*/ createUseReadContract({
  abi: fanInNodeAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"consumer"`
 */
export const useReadFanInNodeConsumer = /*#__PURE__*/ createUseReadContract({
  abi: fanInNodeAbi,
  functionName: 'consumer',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"factoryTypeId"`
 */
export const useReadFanInNodeFactoryTypeId =
  /*#__PURE__*/ createUseReadContract({
    abi: fanInNodeAbi,
    functionName: 'factoryTypeId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"inputDenoms"`
 */
export const useReadFanInNodeInputDenoms = /*#__PURE__*/ createUseReadContract({
  abi: fanInNodeAbi,
  functionName: 'inputDenoms',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"manager"`
 */
export const useReadFanInNodeManager = /*#__PURE__*/ createUseReadContract({
  abi: fanInNodeAbi,
  functionName: 'manager',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"outputSources"`
 */
export const useReadFanInNodeOutputSources =
  /*#__PURE__*/ createUseReadContract({
    abi: fanInNodeAbi,
    functionName: 'outputSources',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"security"`
 */
export const useReadFanInNodeSecurity = /*#__PURE__*/ createUseReadContract({
  abi: fanInNodeAbi,
  functionName: 'security',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"totalStake"`
 */
export const useReadFanInNodeTotalStake = /*#__PURE__*/ createUseReadContract({
  abi: fanInNodeAbi,
  functionName: 'totalStake',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanInNodeAbi}__
 */
export const useWriteFanInNode = /*#__PURE__*/ createUseWriteContract({
  abi: fanInNodeAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteFanInNodeInitialize = /*#__PURE__*/ createUseWriteContract(
  { abi: fanInNodeAbi, functionName: 'initialize' },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"registerProvider"`
 */
export const useWriteFanInNodeRegisterProvider =
  /*#__PURE__*/ createUseWriteContract({
    abi: fanInNodeAbi,
    functionName: 'registerProvider',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"releaseStake"`
 */
export const useWriteFanInNodeReleaseStake =
  /*#__PURE__*/ createUseWriteContract({
    abi: fanInNodeAbi,
    functionName: 'releaseStake',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"stake"`
 */
export const useWriteFanInNodeStake = /*#__PURE__*/ createUseWriteContract({
  abi: fanInNodeAbi,
  functionName: 'stake',
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanInNodeAbi}__
 */
export const useSimulateFanInNode = /*#__PURE__*/ createUseSimulateContract({
  abi: fanInNodeAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateFanInNodeInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanInNodeAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"registerProvider"`
 */
export const useSimulateFanInNodeRegisterProvider =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanInNodeAbi,
    functionName: 'registerProvider',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"releaseStake"`
 */
export const useSimulateFanInNodeReleaseStake =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanInNodeAbi,
    functionName: 'releaseStake',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanInNodeAbi}__ and `functionName` set to `"stake"`
 */
export const useSimulateFanInNodeStake =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanInNodeAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanInNodeAbi}__
 */
export const useWatchFanInNodeEvent = /*#__PURE__*/ createUseWatchContractEvent(
  { abi: fanInNodeAbi },
)

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanInNodeAbi}__ and `eventName` set to `"ProviderRegistered"`
 */
export const useWatchFanInNodeProviderRegisteredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fanInNodeAbi,
    eventName: 'ProviderRegistered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanInNodeAbi}__ and `eventName` set to `"StakeReleased"`
 */
export const useWatchFanInNodeStakeReleasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fanInNodeAbi,
    eventName: 'StakeReleased',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanInNodeAbi}__ and `eventName` set to `"Staked"`
 */
export const useWatchFanInNodeStakedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fanInNodeAbi,
    eventName: 'Staked',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__
 */
export const useReadFanOutNode = /*#__PURE__*/ createUseReadContract({
  abi: fanOutNodeAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"MAX_REWARD_TOKENS"`
 */
export const useReadFanOutNodeMaxRewardTokens =
  /*#__PURE__*/ createUseReadContract({
    abi: fanOutNodeAbi,
    functionName: 'MAX_REWARD_TOKENS',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"factoryTypeId"`
 */
export const useReadFanOutNodeFactoryTypeId =
  /*#__PURE__*/ createUseReadContract({
    abi: fanOutNodeAbi,
    functionName: 'factoryTypeId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"getLien"`
 */
export const useReadFanOutNodeGetLien = /*#__PURE__*/ createUseReadContract({
  abi: fanOutNodeAbi,
  functionName: 'getLien',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"getOutflows"`
 */
export const useReadFanOutNodeGetOutflows = /*#__PURE__*/ createUseReadContract(
  { abi: fanOutNodeAbi, functionName: 'getOutflows' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"getUserInfo"`
 */
export const useReadFanOutNodeGetUserInfo = /*#__PURE__*/ createUseReadContract(
  { abi: fanOutNodeAbi, functionName: 'getUserInfo' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"inputMaxPenaltyBps"`
 */
export const useReadFanOutNodeInputMaxPenaltyBps =
  /*#__PURE__*/ createUseReadContract({
    abi: fanOutNodeAbi,
    functionName: 'inputMaxPenaltyBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"pendingRewards"`
 */
export const useReadFanOutNodePendingRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: fanOutNodeAbi,
    functionName: 'pendingRewards',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"provider"`
 */
export const useReadFanOutNodeProvider = /*#__PURE__*/ createUseReadContract({
  abi: fanOutNodeAbi,
  functionName: 'provider',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"rewardDebt"`
 */
export const useReadFanOutNodeRewardDebt = /*#__PURE__*/ createUseReadContract({
  abi: fanOutNodeAbi,
  functionName: 'rewardDebt',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"rewardsPerShare"`
 */
export const useReadFanOutNodeRewardsPerShare =
  /*#__PURE__*/ createUseReadContract({
    abi: fanOutNodeAbi,
    functionName: 'rewardsPerShare',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"totalStake"`
 */
export const useReadFanOutNodeTotalStake = /*#__PURE__*/ createUseReadContract({
  abi: fanOutNodeAbi,
  functionName: 'totalStake',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanOutNodeAbi}__
 */
export const useWriteFanOutNode = /*#__PURE__*/ createUseWriteContract({
  abi: fanOutNodeAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"claimRewards"`
 */
export const useWriteFanOutNodeClaimRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: fanOutNodeAbi,
    functionName: 'claimRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"distributeRewards"`
 */
export const useWriteFanOutNodeDistributeRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: fanOutNodeAbi,
    functionName: 'distributeRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteFanOutNodeInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: fanOutNodeAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"initializeWithPenalty"`
 */
export const useWriteFanOutNodeInitializeWithPenalty =
  /*#__PURE__*/ createUseWriteContract({
    abi: fanOutNodeAbi,
    functionName: 'initializeWithPenalty',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"releaseStake"`
 */
export const useWriteFanOutNodeReleaseStake =
  /*#__PURE__*/ createUseWriteContract({
    abi: fanOutNodeAbi,
    functionName: 'releaseStake',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"setOutflows"`
 */
export const useWriteFanOutNodeSetOutflows =
  /*#__PURE__*/ createUseWriteContract({
    abi: fanOutNodeAbi,
    functionName: 'setOutflows',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"stake"`
 */
export const useWriteFanOutNodeStake = /*#__PURE__*/ createUseWriteContract({
  abi: fanOutNodeAbi,
  functionName: 'stake',
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanOutNodeAbi}__
 */
export const useSimulateFanOutNode = /*#__PURE__*/ createUseSimulateContract({
  abi: fanOutNodeAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"claimRewards"`
 */
export const useSimulateFanOutNodeClaimRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanOutNodeAbi,
    functionName: 'claimRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"distributeRewards"`
 */
export const useSimulateFanOutNodeDistributeRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanOutNodeAbi,
    functionName: 'distributeRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateFanOutNodeInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanOutNodeAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"initializeWithPenalty"`
 */
export const useSimulateFanOutNodeInitializeWithPenalty =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanOutNodeAbi,
    functionName: 'initializeWithPenalty',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"releaseStake"`
 */
export const useSimulateFanOutNodeReleaseStake =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanOutNodeAbi,
    functionName: 'releaseStake',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"setOutflows"`
 */
export const useSimulateFanOutNodeSetOutflows =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanOutNodeAbi,
    functionName: 'setOutflows',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fanOutNodeAbi}__ and `functionName` set to `"stake"`
 */
export const useSimulateFanOutNodeStake =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fanOutNodeAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanOutNodeAbi}__
 */
export const useWatchFanOutNodeEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fanOutNodeAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanOutNodeAbi}__ and `eventName` set to `"Initialized"`
 */
export const useWatchFanOutNodeInitializedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fanOutNodeAbi,
    eventName: 'Initialized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanOutNodeAbi}__ and `eventName` set to `"OutflowsSet"`
 */
export const useWatchFanOutNodeOutflowsSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fanOutNodeAbi,
    eventName: 'OutflowsSet',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanOutNodeAbi}__ and `eventName` set to `"RewardsClaimed"`
 */
export const useWatchFanOutNodeRewardsClaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fanOutNodeAbi,
    eventName: 'RewardsClaimed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanOutNodeAbi}__ and `eventName` set to `"RewardsDistributed"`
 */
export const useWatchFanOutNodeRewardsDistributedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fanOutNodeAbi,
    eventName: 'RewardsDistributed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanOutNodeAbi}__ and `eventName` set to `"StakeReleased"`
 */
export const useWatchFanOutNodeStakeReleasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fanOutNodeAbi,
    eventName: 'StakeReleased',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fanOutNodeAbi}__ and `eventName` set to `"Staked"`
 */
export const useWatchFanOutNodeStakedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fanOutNodeAbi,
    eventName: 'Staked',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__
 */
export const useReadFlatFeeAtCreate = /*#__PURE__*/ createUseReadContract({
  abi: flatFeeAtCreateAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"creditOf"`
 */
export const useReadFlatFeeAtCreateCreditOf =
  /*#__PURE__*/ createUseReadContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'creditOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"feeOf"`
 */
export const useReadFlatFeeAtCreateFeeOf = /*#__PURE__*/ createUseReadContract({
  abi: flatFeeAtCreateAbi,
  functionName: 'feeOf',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"manager"`
 */
export const useReadFlatFeeAtCreateManager =
  /*#__PURE__*/ createUseReadContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'manager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"pending"`
 */
export const useReadFlatFeeAtCreatePending =
  /*#__PURE__*/ createUseReadContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'pending',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__
 */
export const useWriteFlatFeeAtCreate = /*#__PURE__*/ createUseWriteContract({
  abi: flatFeeAtCreateAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"claim"`
 */
export const useWriteFlatFeeAtCreateClaim =
  /*#__PURE__*/ createUseWriteContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'claim',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"distribute"`
 */
export const useWriteFlatFeeAtCreateDistribute =
  /*#__PURE__*/ createUseWriteContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'distribute',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"onCommitmentCreated"`
 */
export const useWriteFlatFeeAtCreateOnCommitmentCreated =
  /*#__PURE__*/ createUseWriteContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'onCommitmentCreated',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"onCommitmentForfeited"`
 */
export const useWriteFlatFeeAtCreateOnCommitmentForfeited =
  /*#__PURE__*/ createUseWriteContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'onCommitmentForfeited',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"onCommitmentReleased"`
 */
export const useWriteFlatFeeAtCreateOnCommitmentReleased =
  /*#__PURE__*/ createUseWriteContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'onCommitmentReleased',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"prefund"`
 */
export const useWriteFlatFeeAtCreatePrefund =
  /*#__PURE__*/ createUseWriteContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'prefund',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"refundUnallocated"`
 */
export const useWriteFlatFeeAtCreateRefundUnallocated =
  /*#__PURE__*/ createUseWriteContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'refundUnallocated',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__
 */
export const useSimulateFlatFeeAtCreate =
  /*#__PURE__*/ createUseSimulateContract({ abi: flatFeeAtCreateAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"claim"`
 */
export const useSimulateFlatFeeAtCreateClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'claim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"distribute"`
 */
export const useSimulateFlatFeeAtCreateDistribute =
  /*#__PURE__*/ createUseSimulateContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'distribute',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"onCommitmentCreated"`
 */
export const useSimulateFlatFeeAtCreateOnCommitmentCreated =
  /*#__PURE__*/ createUseSimulateContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'onCommitmentCreated',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"onCommitmentForfeited"`
 */
export const useSimulateFlatFeeAtCreateOnCommitmentForfeited =
  /*#__PURE__*/ createUseSimulateContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'onCommitmentForfeited',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"onCommitmentReleased"`
 */
export const useSimulateFlatFeeAtCreateOnCommitmentReleased =
  /*#__PURE__*/ createUseSimulateContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'onCommitmentReleased',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"prefund"`
 */
export const useSimulateFlatFeeAtCreatePrefund =
  /*#__PURE__*/ createUseSimulateContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'prefund',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `functionName` set to `"refundUnallocated"`
 */
export const useSimulateFlatFeeAtCreateRefundUnallocated =
  /*#__PURE__*/ createUseSimulateContract({
    abi: flatFeeAtCreateAbi,
    functionName: 'refundUnallocated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link flatFeeAtCreateAbi}__
 */
export const useWatchFlatFeeAtCreateEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: flatFeeAtCreateAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `eventName` set to `"CreditRefunded"`
 */
export const useWatchFlatFeeAtCreateCreditRefundedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: flatFeeAtCreateAbi,
    eventName: 'CreditRefunded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `eventName` set to `"DistributionPaid"`
 */
export const useWatchFlatFeeAtCreateDistributionPaidEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: flatFeeAtCreateAbi,
    eventName: 'DistributionPaid',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link flatFeeAtCreateAbi}__ and `eventName` set to `"Prefunded"`
 */
export const useWatchFlatFeeAtCreatePrefundedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: flatFeeAtCreateAbi,
    eventName: 'Prefunded',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link governorFactoryAbi}__
 */
export const useReadGovernorFactory = /*#__PURE__*/ createUseReadContract({
  abi: governorFactoryAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link governorFactoryAbi}__ and `functionName` set to `"canonicalGovernor"`
 */
export const useReadGovernorFactoryCanonicalGovernor =
  /*#__PURE__*/ createUseReadContract({
    abi: governorFactoryAbi,
    functionName: 'canonicalGovernor',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link governorFactoryAbi}__ and `functionName` set to `"deployer"`
 */
export const useReadGovernorFactoryDeployer =
  /*#__PURE__*/ createUseReadContract({
    abi: governorFactoryAbi,
    functionName: 'deployer',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link governorFactoryAbi}__ and `functionName` set to `"governorImpl"`
 */
export const useReadGovernorFactoryGovernorImpl =
  /*#__PURE__*/ createUseReadContract({
    abi: governorFactoryAbi,
    functionName: 'governorImpl',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link governorFactoryAbi}__ and `functionName` set to `"timelockImpl"`
 */
export const useReadGovernorFactoryTimelockImpl =
  /*#__PURE__*/ createUseReadContract({
    abi: governorFactoryAbi,
    functionName: 'timelockImpl',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link governorFactoryAbi}__
 */
export const useWriteGovernorFactory = /*#__PURE__*/ createUseWriteContract({
  abi: governorFactoryAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link governorFactoryAbi}__ and `functionName` set to `"deploy"`
 */
export const useWriteGovernorFactoryDeploy =
  /*#__PURE__*/ createUseWriteContract({
    abi: governorFactoryAbi,
    functionName: 'deploy',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link governorFactoryAbi}__ and `functionName` set to `"setCanonicalGovernor"`
 */
export const useWriteGovernorFactorySetCanonicalGovernor =
  /*#__PURE__*/ createUseWriteContract({
    abi: governorFactoryAbi,
    functionName: 'setCanonicalGovernor',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link governorFactoryAbi}__
 */
export const useSimulateGovernorFactory =
  /*#__PURE__*/ createUseSimulateContract({ abi: governorFactoryAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link governorFactoryAbi}__ and `functionName` set to `"deploy"`
 */
export const useSimulateGovernorFactoryDeploy =
  /*#__PURE__*/ createUseSimulateContract({
    abi: governorFactoryAbi,
    functionName: 'deploy',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link governorFactoryAbi}__ and `functionName` set to `"setCanonicalGovernor"`
 */
export const useSimulateGovernorFactorySetCanonicalGovernor =
  /*#__PURE__*/ createUseSimulateContract({
    abi: governorFactoryAbi,
    functionName: 'setCanonicalGovernor',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link governorFactoryAbi}__
 */
export const useWatchGovernorFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: governorFactoryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link governorFactoryAbi}__ and `eventName` set to `"CanonicalGovernorSet"`
 */
export const useWatchGovernorFactoryCanonicalGovernorSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: governorFactoryAbi,
    eventName: 'CanonicalGovernorSet',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link governorFactoryAbi}__ and `eventName` set to `"GovernorDeployed"`
 */
export const useWatchGovernorFactoryGovernorDeployedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: governorFactoryAbi,
    eventName: 'GovernorDeployed',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__
 */
export const useReadLinkedMutualPolicy = /*#__PURE__*/ createUseReadContract({
  abi: linkedMutualPolicyAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"getActiveNotionalSold"`
 */
export const useReadLinkedMutualPolicyGetActiveNotionalSold =
  /*#__PURE__*/ createUseReadContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'getActiveNotionalSold',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"getCoverBinding"`
 */
export const useReadLinkedMutualPolicyGetCoverBinding =
  /*#__PURE__*/ createUseReadContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'getCoverBinding',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"manager"`
 */
export const useReadLinkedMutualPolicyManager =
  /*#__PURE__*/ createUseReadContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'manager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"nextBindingId"`
 */
export const useReadLinkedMutualPolicyNextBindingId =
  /*#__PURE__*/ createUseReadContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'nextBindingId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"scheduler"`
 */
export const useReadLinkedMutualPolicyScheduler =
  /*#__PURE__*/ createUseReadContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'scheduler',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__
 */
export const useWriteLinkedMutualPolicy = /*#__PURE__*/ createUseWriteContract({
  abi: linkedMutualPolicyAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"bindCover"`
 */
export const useWriteLinkedMutualPolicyBindCover =
  /*#__PURE__*/ createUseWriteContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'bindCover',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"expireBinding"`
 */
export const useWriteLinkedMutualPolicyExpireBinding =
  /*#__PURE__*/ createUseWriteContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'expireBinding',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"fundStandby"`
 */
export const useWriteLinkedMutualPolicyFundStandby =
  /*#__PURE__*/ createUseWriteContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'fundStandby',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__
 */
export const useSimulateLinkedMutualPolicy =
  /*#__PURE__*/ createUseSimulateContract({ abi: linkedMutualPolicyAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"bindCover"`
 */
export const useSimulateLinkedMutualPolicyBindCover =
  /*#__PURE__*/ createUseSimulateContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'bindCover',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"expireBinding"`
 */
export const useSimulateLinkedMutualPolicyExpireBinding =
  /*#__PURE__*/ createUseSimulateContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'expireBinding',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `functionName` set to `"fundStandby"`
 */
export const useSimulateLinkedMutualPolicyFundStandby =
  /*#__PURE__*/ createUseSimulateContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'fundStandby',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link linkedMutualPolicyAbi}__
 */
export const useWatchLinkedMutualPolicyEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: linkedMutualPolicyAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `eventName` set to `"BindingExpired"`
 */
export const useWatchLinkedMutualPolicyBindingExpiredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: linkedMutualPolicyAbi,
    eventName: 'BindingExpired',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `eventName` set to `"CoverBound"`
 */
export const useWatchLinkedMutualPolicyCoverBoundEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: linkedMutualPolicyAbi,
    eventName: 'CoverBound',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link linkedMutualPolicyAbi}__ and `eventName` set to `"StandbyFunded"`
 */
export const useWatchLinkedMutualPolicyStandbyFundedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: linkedMutualPolicyAbi,
    eventName: 'StandbyFunded',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link manualArbiterAbi}__
 */
export const useReadManualArbiter = /*#__PURE__*/ createUseReadContract({
  abi: manualArbiterAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"arbiterCapabilities"`
 */
export const useReadManualArbiterArbiterCapabilities =
  /*#__PURE__*/ createUseReadContract({
    abi: manualArbiterAbi,
    functionName: 'arbiterCapabilities',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"arbiterMetadataURI"`
 */
export const useReadManualArbiterArbiterMetadataUri =
  /*#__PURE__*/ createUseReadContract({
    abi: manualArbiterAbi,
    functionName: 'arbiterMetadataURI',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"commitmentManager"`
 */
export const useReadManualArbiterCommitmentManager =
  /*#__PURE__*/ createUseReadContract({
    abi: manualArbiterAbi,
    functionName: 'commitmentManager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"manager"`
 */
export const useReadManualArbiterManager = /*#__PURE__*/ createUseReadContract({
  abi: manualArbiterAbi,
  functionName: 'manager',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"owner"`
 */
export const useReadManualArbiterOwner = /*#__PURE__*/ createUseReadContract({
  abi: manualArbiterAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"pendingOwner"`
 */
export const useReadManualArbiterPendingOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: manualArbiterAbi,
    functionName: 'pendingOwner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadManualArbiterSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: manualArbiterAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__
 */
export const useWriteManualArbiter = /*#__PURE__*/ createUseWriteContract({
  abi: manualArbiterAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useWriteManualArbiterAcceptOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"activateMutual"`
 */
export const useWriteManualArbiterActivateMutual =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'activateMutual',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"cancelForfeit"`
 */
export const useWriteManualArbiterCancelForfeit =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'cancelForfeit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"cancelMutualLoss"`
 */
export const useWriteManualArbiterCancelMutualLoss =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'cancelMutualLoss',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"forfeitAgreement"`
 */
export const useWriteManualArbiterForfeitAgreement =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'forfeitAgreement',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"initiateForfeit"`
 */
export const useWriteManualArbiterInitiateForfeit =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'initiateForfeit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"initiateMutualLoss"`
 */
export const useWriteManualArbiterInitiateMutualLoss =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'initiateMutualLoss',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"release"`
 */
export const useWriteManualArbiterRelease =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'release',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"releaseAgreement"`
 */
export const useWriteManualArbiterReleaseAgreement =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'releaseAgreement',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteManualArbiterRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"setMetadataURI"`
 */
export const useWriteManualArbiterSetMetadataUri =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'setMetadataURI',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"settleAgreement"`
 */
export const useWriteManualArbiterSettleAgreement =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'settleAgreement',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteManualArbiterTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: manualArbiterAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__
 */
export const useSimulateManualArbiter = /*#__PURE__*/ createUseSimulateContract(
  { abi: manualArbiterAbi },
)

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useSimulateManualArbiterAcceptOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"activateMutual"`
 */
export const useSimulateManualArbiterActivateMutual =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'activateMutual',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"cancelForfeit"`
 */
export const useSimulateManualArbiterCancelForfeit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'cancelForfeit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"cancelMutualLoss"`
 */
export const useSimulateManualArbiterCancelMutualLoss =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'cancelMutualLoss',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"forfeitAgreement"`
 */
export const useSimulateManualArbiterForfeitAgreement =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'forfeitAgreement',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"initiateForfeit"`
 */
export const useSimulateManualArbiterInitiateForfeit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'initiateForfeit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"initiateMutualLoss"`
 */
export const useSimulateManualArbiterInitiateMutualLoss =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'initiateMutualLoss',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"release"`
 */
export const useSimulateManualArbiterRelease =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'release',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"releaseAgreement"`
 */
export const useSimulateManualArbiterReleaseAgreement =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'releaseAgreement',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateManualArbiterRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"setMetadataURI"`
 */
export const useSimulateManualArbiterSetMetadataUri =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'setMetadataURI',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"settleAgreement"`
 */
export const useSimulateManualArbiterSettleAgreement =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'settleAgreement',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link manualArbiterAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateManualArbiterTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: manualArbiterAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link manualArbiterAbi}__
 */
export const useWatchManualArbiterEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: manualArbiterAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link manualArbiterAbi}__ and `eventName` set to `"MetadataURIUpdated"`
 */
export const useWatchManualArbiterMetadataUriUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: manualArbiterAbi,
    eventName: 'MetadataURIUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link manualArbiterAbi}__ and `eventName` set to `"OwnershipTransferStarted"`
 */
export const useWatchManualArbiterOwnershipTransferStartedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: manualArbiterAbi,
    eventName: 'OwnershipTransferStarted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link manualArbiterAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchManualArbiterOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: manualArbiterAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__
 */
export const useReadMeshFactory = /*#__PURE__*/ createUseReadContract({
  abi: meshFactoryAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"fanInImpl"`
 */
export const useReadMeshFactoryFanInImpl = /*#__PURE__*/ createUseReadContract({
  abi: meshFactoryAbi,
  functionName: 'fanInImpl',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"fanOutImpl"`
 */
export const useReadMeshFactoryFanOutImpl = /*#__PURE__*/ createUseReadContract(
  { abi: meshFactoryAbi, functionName: 'fanOutImpl' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"implementationTypeId"`
 */
export const useReadMeshFactoryImplementationTypeId =
  /*#__PURE__*/ createUseReadContract({
    abi: meshFactoryAbi,
    functionName: 'implementationTypeId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"isBlacklisted"`
 */
export const useReadMeshFactoryIsBlacklisted =
  /*#__PURE__*/ createUseReadContract({
    abi: meshFactoryAbi,
    functionName: 'isBlacklisted',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"isWhitelisted"`
 */
export const useReadMeshFactoryIsWhitelisted =
  /*#__PURE__*/ createUseReadContract({
    abi: meshFactoryAbi,
    functionName: 'isWhitelisted',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"owner"`
 */
export const useReadMeshFactoryOwner = /*#__PURE__*/ createUseReadContract({
  abi: meshFactoryAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"predictFanInAddress"`
 */
export const useReadMeshFactoryPredictFanInAddress =
  /*#__PURE__*/ createUseReadContract({
    abi: meshFactoryAbi,
    functionName: 'predictFanInAddress',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"predictFanOutAddress"`
 */
export const useReadMeshFactoryPredictFanOutAddress =
  /*#__PURE__*/ createUseReadContract({
    abi: meshFactoryAbi,
    functionName: 'predictFanOutAddress',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"predictTokenWeightingAddress"`
 */
export const useReadMeshFactoryPredictTokenWeightingAddress =
  /*#__PURE__*/ createUseReadContract({
    abi: meshFactoryAbi,
    functionName: 'predictTokenWeightingAddress',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"tokenWeightingImpl"`
 */
export const useReadMeshFactoryTokenWeightingImpl =
  /*#__PURE__*/ createUseReadContract({
    abi: meshFactoryAbi,
    functionName: 'tokenWeightingImpl',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__
 */
export const useWriteMeshFactory = /*#__PURE__*/ createUseWriteContract({
  abi: meshFactoryAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"blacklist"`
 */
export const useWriteMeshFactoryBlacklist =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'blacklist',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployFanIn"`
 */
export const useWriteMeshFactoryDeployFanIn =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'deployFanIn',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployFanInAt"`
 */
export const useWriteMeshFactoryDeployFanInAt =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'deployFanInAt',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployFanOut"`
 */
export const useWriteMeshFactoryDeployFanOut =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'deployFanOut',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployFanOutAt"`
 */
export const useWriteMeshFactoryDeployFanOutAt =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'deployFanOutAt',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployTokenWeighting"`
 */
export const useWriteMeshFactoryDeployTokenWeighting =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'deployTokenWeighting',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployTokenWeightingAt"`
 */
export const useWriteMeshFactoryDeployTokenWeightingAt =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'deployTokenWeightingAt',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"multicall"`
 */
export const useWriteMeshFactoryMulticall =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'multicall',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteMeshFactoryRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteMeshFactoryTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"whitelistImplementation"`
 */
export const useWriteMeshFactoryWhitelistImplementation =
  /*#__PURE__*/ createUseWriteContract({
    abi: meshFactoryAbi,
    functionName: 'whitelistImplementation',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__
 */
export const useSimulateMeshFactory = /*#__PURE__*/ createUseSimulateContract({
  abi: meshFactoryAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"blacklist"`
 */
export const useSimulateMeshFactoryBlacklist =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'blacklist',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployFanIn"`
 */
export const useSimulateMeshFactoryDeployFanIn =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'deployFanIn',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployFanInAt"`
 */
export const useSimulateMeshFactoryDeployFanInAt =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'deployFanInAt',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployFanOut"`
 */
export const useSimulateMeshFactoryDeployFanOut =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'deployFanOut',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployFanOutAt"`
 */
export const useSimulateMeshFactoryDeployFanOutAt =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'deployFanOutAt',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployTokenWeighting"`
 */
export const useSimulateMeshFactoryDeployTokenWeighting =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'deployTokenWeighting',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"deployTokenWeightingAt"`
 */
export const useSimulateMeshFactoryDeployTokenWeightingAt =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'deployTokenWeightingAt',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"multicall"`
 */
export const useSimulateMeshFactoryMulticall =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'multicall',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateMeshFactoryRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateMeshFactoryTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link meshFactoryAbi}__ and `functionName` set to `"whitelistImplementation"`
 */
export const useSimulateMeshFactoryWhitelistImplementation =
  /*#__PURE__*/ createUseSimulateContract({
    abi: meshFactoryAbi,
    functionName: 'whitelistImplementation',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link meshFactoryAbi}__
 */
export const useWatchMeshFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: meshFactoryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link meshFactoryAbi}__ and `eventName` set to `"ImplementationBlacklisted"`
 */
export const useWatchMeshFactoryImplementationBlacklistedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: meshFactoryAbi,
    eventName: 'ImplementationBlacklisted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link meshFactoryAbi}__ and `eventName` set to `"ImplementationWhitelisted"`
 */
export const useWatchMeshFactoryImplementationWhitelistedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: meshFactoryAbi,
    eventName: 'ImplementationWhitelisted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link meshFactoryAbi}__ and `eventName` set to `"NodeDeployed"`
 */
export const useWatchMeshFactoryNodeDeployedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: meshFactoryAbi,
    eventName: 'NodeDeployed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link meshFactoryAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchMeshFactoryOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: meshFactoryAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockStrategyAbi}__
 */
export const useReadMockStrategy = /*#__PURE__*/ createUseReadContract({
  abi: mockStrategyAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"asset"`
 */
export const useReadMockStrategyAsset = /*#__PURE__*/ createUseReadContract({
  abi: mockStrategyAbi,
  functionName: 'asset',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"maxDeposit"`
 */
export const useReadMockStrategyMaxDeposit =
  /*#__PURE__*/ createUseReadContract({
    abi: mockStrategyAbi,
    functionName: 'maxDeposit',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"totalAssets"`
 */
export const useReadMockStrategyTotalAssets =
  /*#__PURE__*/ createUseReadContract({
    abi: mockStrategyAbi,
    functionName: 'totalAssets',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"vault"`
 */
export const useReadMockStrategyVault = /*#__PURE__*/ createUseReadContract({
  abi: mockStrategyAbi,
  functionName: 'vault',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockStrategyAbi}__
 */
export const useWriteMockStrategy = /*#__PURE__*/ createUseWriteContract({
  abi: mockStrategyAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"deposit"`
 */
export const useWriteMockStrategyDeposit = /*#__PURE__*/ createUseWriteContract(
  { abi: mockStrategyAbi, functionName: 'deposit' },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"setMaxDeposit"`
 */
export const useWriteMockStrategySetMaxDeposit =
  /*#__PURE__*/ createUseWriteContract({
    abi: mockStrategyAbi,
    functionName: 'setMaxDeposit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"simulateLoss"`
 */
export const useWriteMockStrategySimulateLoss =
  /*#__PURE__*/ createUseWriteContract({
    abi: mockStrategyAbi,
    functionName: 'simulateLoss',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"simulateYield"`
 */
export const useWriteMockStrategySimulateYield =
  /*#__PURE__*/ createUseWriteContract({
    abi: mockStrategyAbi,
    functionName: 'simulateYield',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"withdraw"`
 */
export const useWriteMockStrategyWithdraw =
  /*#__PURE__*/ createUseWriteContract({
    abi: mockStrategyAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockStrategyAbi}__
 */
export const useSimulateMockStrategy = /*#__PURE__*/ createUseSimulateContract({
  abi: mockStrategyAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"deposit"`
 */
export const useSimulateMockStrategyDeposit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: mockStrategyAbi,
    functionName: 'deposit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"setMaxDeposit"`
 */
export const useSimulateMockStrategySetMaxDeposit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: mockStrategyAbi,
    functionName: 'setMaxDeposit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"simulateLoss"`
 */
export const useSimulateMockStrategySimulateLoss =
  /*#__PURE__*/ createUseSimulateContract({
    abi: mockStrategyAbi,
    functionName: 'simulateLoss',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"simulateYield"`
 */
export const useSimulateMockStrategySimulateYield =
  /*#__PURE__*/ createUseSimulateContract({
    abi: mockStrategyAbi,
    functionName: 'simulateYield',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockStrategyAbi}__ and `functionName` set to `"withdraw"`
 */
export const useSimulateMockStrategyWithdraw =
  /*#__PURE__*/ createUseSimulateContract({
    abi: mockStrategyAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mutualRegistryAbi}__
 */
export const useReadMutualRegistry = /*#__PURE__*/ createUseReadContract({
  abi: mutualRegistryAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mutualRegistryAbi}__ and `functionName` set to `"MAX_PERIL_URI_LENGTH"`
 */
export const useReadMutualRegistryMaxPerilUriLength =
  /*#__PURE__*/ createUseReadContract({
    abi: mutualRegistryAbi,
    functionName: 'MAX_PERIL_URI_LENGTH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mutualRegistryAbi}__ and `functionName` set to `"allMutualIds"`
 */
export const useReadMutualRegistryAllMutualIds =
  /*#__PURE__*/ createUseReadContract({
    abi: mutualRegistryAbi,
    functionName: 'allMutualIds',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mutualRegistryAbi}__ and `functionName` set to `"capacity"`
 */
export const useReadMutualRegistryCapacity =
  /*#__PURE__*/ createUseReadContract({
    abi: mutualRegistryAbi,
    functionName: 'capacity',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mutualRegistryAbi}__ and `functionName` set to `"getMutualListing"`
 */
export const useReadMutualRegistryGetMutualListing =
  /*#__PURE__*/ createUseReadContract({
    abi: mutualRegistryAbi,
    functionName: 'getMutualListing',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mutualRegistryAbi}__ and `functionName` set to `"isFilled"`
 */
export const useReadMutualRegistryIsFilled =
  /*#__PURE__*/ createUseReadContract({
    abi: mutualRegistryAbi,
    functionName: 'isFilled',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mutualRegistryAbi}__ and `functionName` set to `"manager"`
 */
export const useReadMutualRegistryManager = /*#__PURE__*/ createUseReadContract(
  { abi: mutualRegistryAbi, functionName: 'manager' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mutualRegistryAbi}__ and `functionName` set to `"mutualCount"`
 */
export const useReadMutualRegistryMutualCount =
  /*#__PURE__*/ createUseReadContract({
    abi: mutualRegistryAbi,
    functionName: 'mutualCount',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mutualRegistryAbi}__
 */
export const useWriteMutualRegistry = /*#__PURE__*/ createUseWriteContract({
  abi: mutualRegistryAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mutualRegistryAbi}__ and `functionName` set to `"registerMutual"`
 */
export const useWriteMutualRegistryRegisterMutual =
  /*#__PURE__*/ createUseWriteContract({
    abi: mutualRegistryAbi,
    functionName: 'registerMutual',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mutualRegistryAbi}__
 */
export const useSimulateMutualRegistry =
  /*#__PURE__*/ createUseSimulateContract({ abi: mutualRegistryAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mutualRegistryAbi}__ and `functionName` set to `"registerMutual"`
 */
export const useSimulateMutualRegistryRegisterMutual =
  /*#__PURE__*/ createUseSimulateContract({
    abi: mutualRegistryAbi,
    functionName: 'registerMutual',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link mutualRegistryAbi}__
 */
export const useWatchMutualRegistryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: mutualRegistryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link mutualRegistryAbi}__ and `eventName` set to `"MutualRegistered"`
 */
export const useWatchMutualRegistryMutualRegisteredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: mutualRegistryAbi,
    eventName: 'MutualRegistered',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__
 */
export const useReadOperatorRegistry = /*#__PURE__*/ createUseReadContract({
  abi: operatorRegistryAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadOperatorRegistryDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"DELEGATE_TYPEHASH"`
 */
export const useReadOperatorRegistryDelegateTypehash =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'DELEGATE_TYPEHASH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"MAX_METADATA_URI_LENGTH"`
 */
export const useReadOperatorRegistryMaxMetadataUriLength =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'MAX_METADATA_URI_LENGTH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"REGISTER_TYPEHASH"`
 */
export const useReadOperatorRegistryRegisterTypehash =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'REGISTER_TYPEHASH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"UPGRADE_INTERFACE_VERSION"`
 */
export const useReadOperatorRegistryUpgradeInterfaceVersion =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'UPGRADE_INTERFACE_VERSION',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"commitmentManager"`
 */
export const useReadOperatorRegistryCommitmentManager =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'commitmentManager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"eip712Domain"`
 */
export const useReadOperatorRegistryEip712Domain =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'eip712Domain',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"entity"`
 */
export const useReadOperatorRegistryEntity =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'entity',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"getAcceptancePolicy"`
 */
export const useReadOperatorRegistryGetAcceptancePolicy =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'getAcceptancePolicy',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"getOperator"`
 */
export const useReadOperatorRegistryGetOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'getOperator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"getOperatorCount"`
 */
export const useReadOperatorRegistryGetOperatorCount =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'getOperatorCount',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"getOperatorMetadata"`
 */
export const useReadOperatorRegistryGetOperatorMetadata =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'getOperatorMetadata',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"getOperatorSet"`
 */
export const useReadOperatorRegistryGetOperatorSet =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'getOperatorSet',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadOperatorRegistryGetRoleAdmin =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadOperatorRegistryHasRole =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'hasRole',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"isEntity"`
 */
export const useReadOperatorRegistryIsEntity =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'isEntity',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"isOperator"`
 */
export const useReadOperatorRegistryIsOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'isOperator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"isStrategyAllowed"`
 */
export const useReadOperatorRegistryIsStrategyAllowed =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'isStrategyAllowed',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"maxDelegationsPerOperator"`
 */
export const useReadOperatorRegistryMaxDelegationsPerOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'maxDelegationsPerOperator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"minOperatorStake"`
 */
export const useReadOperatorRegistryMinOperatorStake =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'minOperatorStake',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"operatorFanIn"`
 */
export const useReadOperatorRegistryOperatorFanIn =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'operatorFanIn',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"operatorForCommitment"`
 */
export const useReadOperatorRegistryOperatorForCommitment =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'operatorForCommitment',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"proxiableUUID"`
 */
export const useReadOperatorRegistryProxiableUuid =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'proxiableUUID',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"sigNonces"`
 */
export const useReadOperatorRegistrySigNonces =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'sigNonces',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"stakeDenom"`
 */
export const useReadOperatorRegistryStakeDenom =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'stakeDenom',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadOperatorRegistrySupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"tokenWeighting"`
 */
export const useReadOperatorRegistryTokenWeighting =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'tokenWeighting',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"totalEntities"`
 */
export const useReadOperatorRegistryTotalEntities =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'totalEntities',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"trackedCommitmentCount"`
 */
export const useReadOperatorRegistryTrackedCommitmentCount =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorRegistryAbi,
    functionName: 'trackedCommitmentCount',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__
 */
export const useWriteOperatorRegistry = /*#__PURE__*/ createUseWriteContract({
  abi: operatorRegistryAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"delegate"`
 */
export const useWriteOperatorRegistryDelegate =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'delegate',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"delegateWithSig"`
 */
export const useWriteOperatorRegistryDelegateWithSig =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'delegateWithSig',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"deregister"`
 */
export const useWriteOperatorRegistryDeregister =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'deregister',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteOperatorRegistryGrantRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"increaseNonce"`
 */
export const useWriteOperatorRegistryIncreaseNonce =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'increaseNonce',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteOperatorRegistryInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"multicall"`
 */
export const useWriteOperatorRegistryMulticall =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'multicall',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"onDelegationForfeited"`
 */
export const useWriteOperatorRegistryOnDelegationForfeited =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'onDelegationForfeited',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"onDelegationReleased"`
 */
export const useWriteOperatorRegistryOnDelegationReleased =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'onDelegationReleased',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"reconcile"`
 */
export const useWriteOperatorRegistryReconcile =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'reconcile',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"register"`
 */
export const useWriteOperatorRegistryRegister =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'register',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"registerWithSig"`
 */
export const useWriteOperatorRegistryRegisterWithSig =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'registerWithSig',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteOperatorRegistryRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteOperatorRegistryRevokeRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"setMaxDelegationsPerOperator"`
 */
export const useWriteOperatorRegistrySetMaxDelegationsPerOperator =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'setMaxDelegationsPerOperator',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"setMeshWiring"`
 */
export const useWriteOperatorRegistrySetMeshWiring =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'setMeshWiring',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"setMinOperatorStake"`
 */
export const useWriteOperatorRegistrySetMinOperatorStake =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'setMinOperatorStake',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"setOperatorMetadata"`
 */
export const useWriteOperatorRegistrySetOperatorMetadata =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'setOperatorMetadata',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"setStrategyAllowed"`
 */
export const useWriteOperatorRegistrySetStrategyAllowed =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'setStrategyAllowed',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"sweepForfeitProceeds"`
 */
export const useWriteOperatorRegistrySweepForfeitProceeds =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'sweepForfeitProceeds',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"tightenPolicy"`
 */
export const useWriteOperatorRegistryTightenPolicy =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'tightenPolicy',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useWriteOperatorRegistryUpgradeToAndCall =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorRegistryAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__
 */
export const useSimulateOperatorRegistry =
  /*#__PURE__*/ createUseSimulateContract({ abi: operatorRegistryAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"delegate"`
 */
export const useSimulateOperatorRegistryDelegate =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'delegate',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"delegateWithSig"`
 */
export const useSimulateOperatorRegistryDelegateWithSig =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'delegateWithSig',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"deregister"`
 */
export const useSimulateOperatorRegistryDeregister =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'deregister',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateOperatorRegistryGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"increaseNonce"`
 */
export const useSimulateOperatorRegistryIncreaseNonce =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'increaseNonce',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateOperatorRegistryInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"multicall"`
 */
export const useSimulateOperatorRegistryMulticall =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'multicall',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"onDelegationForfeited"`
 */
export const useSimulateOperatorRegistryOnDelegationForfeited =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'onDelegationForfeited',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"onDelegationReleased"`
 */
export const useSimulateOperatorRegistryOnDelegationReleased =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'onDelegationReleased',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"reconcile"`
 */
export const useSimulateOperatorRegistryReconcile =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'reconcile',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"register"`
 */
export const useSimulateOperatorRegistryRegister =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'register',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"registerWithSig"`
 */
export const useSimulateOperatorRegistryRegisterWithSig =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'registerWithSig',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateOperatorRegistryRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateOperatorRegistryRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"setMaxDelegationsPerOperator"`
 */
export const useSimulateOperatorRegistrySetMaxDelegationsPerOperator =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'setMaxDelegationsPerOperator',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"setMeshWiring"`
 */
export const useSimulateOperatorRegistrySetMeshWiring =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'setMeshWiring',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"setMinOperatorStake"`
 */
export const useSimulateOperatorRegistrySetMinOperatorStake =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'setMinOperatorStake',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"setOperatorMetadata"`
 */
export const useSimulateOperatorRegistrySetOperatorMetadata =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'setOperatorMetadata',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"setStrategyAllowed"`
 */
export const useSimulateOperatorRegistrySetStrategyAllowed =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'setStrategyAllowed',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"sweepForfeitProceeds"`
 */
export const useSimulateOperatorRegistrySweepForfeitProceeds =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'sweepForfeitProceeds',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"tightenPolicy"`
 */
export const useSimulateOperatorRegistryTightenPolicy =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'tightenPolicy',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorRegistryAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useSimulateOperatorRegistryUpgradeToAndCall =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorRegistryAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__
 */
export const useWatchOperatorRegistryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: operatorRegistryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"AcceptancePolicyTightened"`
 */
export const useWatchOperatorRegistryAcceptancePolicyTightenedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'AcceptancePolicyTightened',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"DelegationCreated"`
 */
export const useWatchOperatorRegistryDelegationCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'DelegationCreated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"DelegationForfeited"`
 */
export const useWatchOperatorRegistryDelegationForfeitedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'DelegationForfeited',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"DelegationReleased"`
 */
export const useWatchOperatorRegistryDelegationReleasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'DelegationReleased',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"EIP712DomainChanged"`
 */
export const useWatchOperatorRegistryEip712DomainChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'EIP712DomainChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"ForfeitRecipientPending"`
 */
export const useWatchOperatorRegistryForfeitRecipientPendingEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'ForfeitRecipientPending',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"ForfeitRecipientSwept"`
 */
export const useWatchOperatorRegistryForfeitRecipientSweptEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'ForfeitRecipientSwept',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"Initialized"`
 */
export const useWatchOperatorRegistryInitializedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'Initialized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"MaxDelegationsPerOperatorUpdated"`
 */
export const useWatchOperatorRegistryMaxDelegationsPerOperatorUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'MaxDelegationsPerOperatorUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"MeshWired"`
 */
export const useWatchOperatorRegistryMeshWiredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'MeshWired',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"MinOperatorStakeUpdated"`
 */
export const useWatchOperatorRegistryMinOperatorStakeUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'MinOperatorStakeUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"NonceIncreased"`
 */
export const useWatchOperatorRegistryNonceIncreasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'NonceIncreased',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"OperatorBelowMinStake"`
 */
export const useWatchOperatorRegistryOperatorBelowMinStakeEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'OperatorBelowMinStake',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"OperatorDeregistered"`
 */
export const useWatchOperatorRegistryOperatorDeregisteredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'OperatorDeregistered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"OperatorFanInDeployed"`
 */
export const useWatchOperatorRegistryOperatorFanInDeployedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'OperatorFanInDeployed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"OperatorMetadataUpdated"`
 */
export const useWatchOperatorRegistryOperatorMetadataUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'OperatorMetadataUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"OperatorRegistered"`
 */
export const useWatchOperatorRegistryOperatorRegisteredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'OperatorRegistered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchOperatorRegistryRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchOperatorRegistryRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchOperatorRegistryRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"StrategyAllowlistUpdated"`
 */
export const useWatchOperatorRegistryStrategyAllowlistUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'StrategyAllowlistUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorRegistryAbi}__ and `eventName` set to `"Upgraded"`
 */
export const useWatchOperatorRegistryUpgradedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorRegistryAbi,
    eventName: 'Upgraded',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__
 */
export const useReadOperatorServiceRegistry =
  /*#__PURE__*/ createUseReadContract({ abi: operatorServiceRegistryAbi })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadOperatorServiceRegistryDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"DEFAULT_MAX_REFERENCE_BLOCK_AGE"`
 */
export const useReadOperatorServiceRegistryDefaultMaxReferenceBlockAge =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'DEFAULT_MAX_REFERENCE_BLOCK_AGE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"ENVELOPE_TYPEHASH"`
 */
export const useReadOperatorServiceRegistryEnvelopeTypehash =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'ENVELOPE_TYPEHASH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"UPGRADE_INTERFACE_VERSION"`
 */
export const useReadOperatorServiceRegistryUpgradeInterfaceVersion =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'UPGRADE_INTERFACE_VERSION',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"eip712Domain"`
 */
export const useReadOperatorServiceRegistryEip712Domain =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'eip712Domain',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getLatestOperatorForSigningKey"`
 */
export const useReadOperatorServiceRegistryGetLatestOperatorForSigningKey =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getLatestOperatorForSigningKey',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getLatestOperatorSigningKey"`
 */
export const useReadOperatorServiceRegistryGetLatestOperatorSigningKey =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getLatestOperatorSigningKey',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getOperatorSigningKeyAtBlock"`
 */
export const useReadOperatorServiceRegistryGetOperatorSigningKeyAtBlock =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getOperatorSigningKeyAtBlock',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getOperatorWeight"`
 */
export const useReadOperatorServiceRegistryGetOperatorWeight =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getOperatorWeight',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadOperatorServiceRegistryGetRoleAdmin =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getServiceURI"`
 */
export const useReadOperatorServiceRegistryGetServiceUri =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getServiceURI',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getStakeRegistry"`
 */
export const useReadOperatorServiceRegistryGetStakeRegistry =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getStakeRegistry',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getTotalPower"`
 */
export const useReadOperatorServiceRegistryGetTotalPower =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getTotalPower',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getTotalPowerAt"`
 */
export const useReadOperatorServiceRegistryGetTotalPowerAt =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getTotalPowerAt',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getVotingPower"`
 */
export const useReadOperatorServiceRegistryGetVotingPower =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getVotingPower',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"getVotingPowerAt"`
 */
export const useReadOperatorServiceRegistryGetVotingPowerAt =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'getVotingPowerAt',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadOperatorServiceRegistryHasRole =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'hasRole',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"isValidSignature"`
 */
export const useReadOperatorServiceRegistryIsValidSignature =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'isValidSignature',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"maxReferenceBlockAge"`
 */
export const useReadOperatorServiceRegistryMaxReferenceBlockAge =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'maxReferenceBlockAge',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"operatorRegistered"`
 */
export const useReadOperatorServiceRegistryOperatorRegistered =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'operatorRegistered',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"operatorRegistry"`
 */
export const useReadOperatorServiceRegistryOperatorRegistry =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'operatorRegistry',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"proxiableUUID"`
 */
export const useReadOperatorServiceRegistryProxiableUuid =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'proxiableUUID',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadOperatorServiceRegistrySupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"validate"`
 */
export const useReadOperatorServiceRegistryValidate =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'validate',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"votingPowerSource"`
 */
export const useReadOperatorServiceRegistryVotingPowerSource =
  /*#__PURE__*/ createUseReadContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'votingPowerSource',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__
 */
export const useWriteOperatorServiceRegistry =
  /*#__PURE__*/ createUseWriteContract({ abi: operatorServiceRegistryAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"enrollServiceOperator"`
 */
export const useWriteOperatorServiceRegistryEnrollServiceOperator =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'enrollServiceOperator',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteOperatorServiceRegistryGrantRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteOperatorServiceRegistryInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteOperatorServiceRegistryRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteOperatorServiceRegistryRevokeRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"setMaxReferenceBlockAge"`
 */
export const useWriteOperatorServiceRegistrySetMaxReferenceBlockAge =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'setMaxReferenceBlockAge',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"setServiceURI"`
 */
export const useWriteOperatorServiceRegistrySetServiceUri =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'setServiceURI',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"setVotingPowerSource"`
 */
export const useWriteOperatorServiceRegistrySetVotingPowerSource =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'setVotingPowerSource',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"updateOperatorSigningKey"`
 */
export const useWriteOperatorServiceRegistryUpdateOperatorSigningKey =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'updateOperatorSigningKey',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"updateQuorum"`
 */
export const useWriteOperatorServiceRegistryUpdateQuorum =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'updateQuorum',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"updateStakeThreshold"`
 */
export const useWriteOperatorServiceRegistryUpdateStakeThreshold =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'updateStakeThreshold',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useWriteOperatorServiceRegistryUpgradeToAndCall =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"withdrawServiceOperator"`
 */
export const useWriteOperatorServiceRegistryWithdrawServiceOperator =
  /*#__PURE__*/ createUseWriteContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'withdrawServiceOperator',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__
 */
export const useSimulateOperatorServiceRegistry =
  /*#__PURE__*/ createUseSimulateContract({ abi: operatorServiceRegistryAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"enrollServiceOperator"`
 */
export const useSimulateOperatorServiceRegistryEnrollServiceOperator =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'enrollServiceOperator',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateOperatorServiceRegistryGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateOperatorServiceRegistryInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateOperatorServiceRegistryRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateOperatorServiceRegistryRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"setMaxReferenceBlockAge"`
 */
export const useSimulateOperatorServiceRegistrySetMaxReferenceBlockAge =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'setMaxReferenceBlockAge',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"setServiceURI"`
 */
export const useSimulateOperatorServiceRegistrySetServiceUri =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'setServiceURI',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"setVotingPowerSource"`
 */
export const useSimulateOperatorServiceRegistrySetVotingPowerSource =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'setVotingPowerSource',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"updateOperatorSigningKey"`
 */
export const useSimulateOperatorServiceRegistryUpdateOperatorSigningKey =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'updateOperatorSigningKey',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"updateQuorum"`
 */
export const useSimulateOperatorServiceRegistryUpdateQuorum =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'updateQuorum',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"updateStakeThreshold"`
 */
export const useSimulateOperatorServiceRegistryUpdateStakeThreshold =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'updateStakeThreshold',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"upgradeToAndCall"`
 */
export const useSimulateOperatorServiceRegistryUpgradeToAndCall =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'upgradeToAndCall',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `functionName` set to `"withdrawServiceOperator"`
 */
export const useSimulateOperatorServiceRegistryWithdrawServiceOperator =
  /*#__PURE__*/ createUseSimulateContract({
    abi: operatorServiceRegistryAbi,
    functionName: 'withdrawServiceOperator',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__
 */
export const useWatchOperatorServiceRegistryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: operatorServiceRegistryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"EIP712DomainChanged"`
 */
export const useWatchOperatorServiceRegistryEip712DomainChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'EIP712DomainChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"Initialized"`
 */
export const useWatchOperatorServiceRegistryInitializedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'Initialized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"MaxReferenceBlockAgeUpdated"`
 */
export const useWatchOperatorServiceRegistryMaxReferenceBlockAgeUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'MaxReferenceBlockAgeUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"OperatorDeregistered"`
 */
export const useWatchOperatorServiceRegistryOperatorDeregisteredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'OperatorDeregistered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"OperatorRegistered"`
 */
export const useWatchOperatorServiceRegistryOperatorRegisteredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'OperatorRegistered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"OperatorSigningKeyUpdated"`
 */
export const useWatchOperatorServiceRegistryOperatorSigningKeyUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'OperatorSigningKeyUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"QuorumThresholdUpdated"`
 */
export const useWatchOperatorServiceRegistryQuorumThresholdUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'QuorumThresholdUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchOperatorServiceRegistryRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchOperatorServiceRegistryRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchOperatorServiceRegistryRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"ServiceURIUpdated"`
 */
export const useWatchOperatorServiceRegistryServiceUriUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'ServiceURIUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"StakeThresholdUpdated"`
 */
export const useWatchOperatorServiceRegistryStakeThresholdUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'StakeThresholdUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"Upgraded"`
 */
export const useWatchOperatorServiceRegistryUpgradedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'Upgraded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link operatorServiceRegistryAbi}__ and `eventName` set to `"VotingPowerSourceUpdated"`
 */
export const useWatchOperatorServiceRegistryVotingPowerSourceUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: operatorServiceRegistryAbi,
    eventName: 'VotingPowerSourceUpdated',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__
 */
export const useReadOptimisticInsuranceArbiter =
  /*#__PURE__*/ createUseReadContract({ abi: optimisticInsuranceArbiterAbi })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"CLAIM_STALE_TTL"`
 */
export const useReadOptimisticInsuranceArbiterClaimStaleTtl =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'CLAIM_STALE_TTL',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"MAX_BOND_DOUBLINGS"`
 */
export const useReadOptimisticInsuranceArbiterMaxBondDoublings =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'MAX_BOND_DOUBLINGS',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"activeClaimOf"`
 */
export const useReadOptimisticInsuranceArbiterActiveClaimOf =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'activeClaimOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"answerTimeout"`
 */
export const useReadOptimisticInsuranceArbiterAnswerTimeout =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'answerTimeout',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"arbiterCapabilities"`
 */
export const useReadOptimisticInsuranceArbiterArbiterCapabilities =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'arbiterCapabilities',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"arbiterMetadataURI"`
 */
export const useReadOptimisticInsuranceArbiterArbiterMetadataUri =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'arbiterMetadataURI',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"bondBps"`
 */
export const useReadOptimisticInsuranceArbiterBondBps =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'bondBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"bondFloor"`
 */
export const useReadOptimisticInsuranceArbiterBondFloor =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'bondFloor',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"bondToken"`
 */
export const useReadOptimisticInsuranceArbiterBondToken =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'bondToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"commitmentManager"`
 */
export const useReadOptimisticInsuranceArbiterCommitmentManager =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'commitmentManager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"getBondStackTop"`
 */
export const useReadOptimisticInsuranceArbiterGetBondStackTop =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'getBondStackTop',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"getClaim"`
 */
export const useReadOptimisticInsuranceArbiterGetClaim =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'getClaim',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"manager"`
 */
export const useReadOptimisticInsuranceArbiterManager =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'manager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"minBond"`
 */
export const useReadOptimisticInsuranceArbiterMinBond =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'minBond',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"nextClaimId"`
 */
export const useReadOptimisticInsuranceArbiterNextClaimId =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'nextClaimId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadOptimisticInsuranceArbiterSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"treasury"`
 */
export const useReadOptimisticInsuranceArbiterTreasury =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'treasury',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"winnerShareBps"`
 */
export const useReadOptimisticInsuranceArbiterWinnerShareBps =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'winnerShareBps',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__
 */
export const useWriteOptimisticInsuranceArbiter =
  /*#__PURE__*/ createUseWriteContract({ abi: optimisticInsuranceArbiterAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"cancelClaim"`
 */
export const useWriteOptimisticInsuranceArbiterCancelClaim =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'cancelClaim',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"cancelStaleClaim"`
 */
export const useWriteOptimisticInsuranceArbiterCancelStaleClaim =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'cancelStaleClaim',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"disputeClaim"`
 */
export const useWriteOptimisticInsuranceArbiterDisputeClaim =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'disputeClaim',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"executeClaim"`
 */
export const useWriteOptimisticInsuranceArbiterExecuteClaim =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'executeClaim',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"finalizeClaim"`
 */
export const useWriteOptimisticInsuranceArbiterFinalizeClaim =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'finalizeClaim',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"proposeClaim"`
 */
export const useWriteOptimisticInsuranceArbiterProposeClaim =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'proposeClaim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__
 */
export const useSimulateOptimisticInsuranceArbiter =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticInsuranceArbiterAbi,
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"cancelClaim"`
 */
export const useSimulateOptimisticInsuranceArbiterCancelClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'cancelClaim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"cancelStaleClaim"`
 */
export const useSimulateOptimisticInsuranceArbiterCancelStaleClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'cancelStaleClaim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"disputeClaim"`
 */
export const useSimulateOptimisticInsuranceArbiterDisputeClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'disputeClaim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"executeClaim"`
 */
export const useSimulateOptimisticInsuranceArbiterExecuteClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'executeClaim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"finalizeClaim"`
 */
export const useSimulateOptimisticInsuranceArbiterFinalizeClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'finalizeClaim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `functionName` set to `"proposeClaim"`
 */
export const useSimulateOptimisticInsuranceArbiterProposeClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'proposeClaim',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__
 */
export const useWatchOptimisticInsuranceArbiterEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticInsuranceArbiterAbi,
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `eventName` set to `"ClaimCancelled"`
 */
export const useWatchOptimisticInsuranceArbiterClaimCancelledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticInsuranceArbiterAbi,
    eventName: 'ClaimCancelled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `eventName` set to `"ClaimDisputed"`
 */
export const useWatchOptimisticInsuranceArbiterClaimDisputedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticInsuranceArbiterAbi,
    eventName: 'ClaimDisputed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `eventName` set to `"ClaimFinalized"`
 */
export const useWatchOptimisticInsuranceArbiterClaimFinalizedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticInsuranceArbiterAbi,
    eventName: 'ClaimFinalized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `eventName` set to `"ClaimProposed"`
 */
export const useWatchOptimisticInsuranceArbiterClaimProposedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticInsuranceArbiterAbi,
    eventName: 'ClaimProposed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `eventName` set to `"ClaimRuled"`
 */
export const useWatchOptimisticInsuranceArbiterClaimRuledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticInsuranceArbiterAbi,
    eventName: 'ClaimRuled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `eventName` set to `"ClaimSettled"`
 */
export const useWatchOptimisticInsuranceArbiterClaimSettledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticInsuranceArbiterAbi,
    eventName: 'ClaimSettled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `eventName` set to `"ClaimStaleCancelled"`
 */
export const useWatchOptimisticInsuranceArbiterClaimStaleCancelledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticInsuranceArbiterAbi,
    eventName: 'ClaimStaleCancelled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticInsuranceArbiterAbi}__ and `eventName` set to `"ClaimUnwound"`
 */
export const useWatchOptimisticInsuranceArbiterClaimUnwoundEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticInsuranceArbiterAbi,
    eventName: 'ClaimUnwound',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__
 */
export const useReadOptimisticMutualArbiter =
  /*#__PURE__*/ createUseReadContract({ abi: optimisticMutualArbiterAbi })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"arbiterCapabilities"`
 */
export const useReadOptimisticMutualArbiterArbiterCapabilities =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'arbiterCapabilities',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"arbiterMetadataURI"`
 */
export const useReadOptimisticMutualArbiterArbiterMetadataUri =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'arbiterMetadataURI',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"bondToken"`
 */
export const useReadOptimisticMutualArbiterBondToken =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'bondToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"claims"`
 */
export const useReadOptimisticMutualArbiterClaims =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'claims',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"commitmentManager"`
 */
export const useReadOptimisticMutualArbiterCommitmentManager =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'commitmentManager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"coverPolicy"`
 */
export const useReadOptimisticMutualArbiterCoverPolicy =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'coverPolicy',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"manager"`
 */
export const useReadOptimisticMutualArbiterManager =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'manager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"minBond"`
 */
export const useReadOptimisticMutualArbiterMinBond =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'minBond',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"owner"`
 */
export const useReadOptimisticMutualArbiterOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"pendingOwner"`
 */
export const useReadOptimisticMutualArbiterPendingOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'pendingOwner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadOptimisticMutualArbiterSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"treasury"`
 */
export const useReadOptimisticMutualArbiterTreasury =
  /*#__PURE__*/ createUseReadContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'treasury',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__
 */
export const useWriteOptimisticMutualArbiter =
  /*#__PURE__*/ createUseWriteContract({ abi: optimisticMutualArbiterAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useWriteOptimisticMutualArbiterAcceptOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"activate"`
 */
export const useWriteOptimisticMutualArbiterActivate =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'activate',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"proposeLoss"`
 */
export const useWriteOptimisticMutualArbiterProposeLoss =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'proposeLoss',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"proposeLossFor"`
 */
export const useWriteOptimisticMutualArbiterProposeLossFor =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'proposeLossFor',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"reclaimBond"`
 */
export const useWriteOptimisticMutualArbiterReclaimBond =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'reclaimBond',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"reclaimOnCancelled"`
 */
export const useWriteOptimisticMutualArbiterReclaimOnCancelled =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'reclaimOnCancelled',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteOptimisticMutualArbiterRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"setCoverPolicy"`
 */
export const useWriteOptimisticMutualArbiterSetCoverPolicy =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'setCoverPolicy',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"setTreasury"`
 */
export const useWriteOptimisticMutualArbiterSetTreasury =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteOptimisticMutualArbiterTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"veto"`
 */
export const useWriteOptimisticMutualArbiterVeto =
  /*#__PURE__*/ createUseWriteContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'veto',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__
 */
export const useSimulateOptimisticMutualArbiter =
  /*#__PURE__*/ createUseSimulateContract({ abi: optimisticMutualArbiterAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useSimulateOptimisticMutualArbiterAcceptOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"activate"`
 */
export const useSimulateOptimisticMutualArbiterActivate =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'activate',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"proposeLoss"`
 */
export const useSimulateOptimisticMutualArbiterProposeLoss =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'proposeLoss',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"proposeLossFor"`
 */
export const useSimulateOptimisticMutualArbiterProposeLossFor =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'proposeLossFor',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"reclaimBond"`
 */
export const useSimulateOptimisticMutualArbiterReclaimBond =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'reclaimBond',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"reclaimOnCancelled"`
 */
export const useSimulateOptimisticMutualArbiterReclaimOnCancelled =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'reclaimOnCancelled',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateOptimisticMutualArbiterRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"setCoverPolicy"`
 */
export const useSimulateOptimisticMutualArbiterSetCoverPolicy =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'setCoverPolicy',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"setTreasury"`
 */
export const useSimulateOptimisticMutualArbiterSetTreasury =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateOptimisticMutualArbiterTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `functionName` set to `"veto"`
 */
export const useSimulateOptimisticMutualArbiterVeto =
  /*#__PURE__*/ createUseSimulateContract({
    abi: optimisticMutualArbiterAbi,
    functionName: 'veto',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__
 */
export const useWatchOptimisticMutualArbiterEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: optimisticMutualArbiterAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `eventName` set to `"BondReclaimed"`
 */
export const useWatchOptimisticMutualArbiterBondReclaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticMutualArbiterAbi,
    eventName: 'BondReclaimed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `eventName` set to `"CoverBindingSnapshotted"`
 */
export const useWatchOptimisticMutualArbiterCoverBindingSnapshottedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticMutualArbiterAbi,
    eventName: 'CoverBindingSnapshotted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `eventName` set to `"CoverPolicyUpdated"`
 */
export const useWatchOptimisticMutualArbiterCoverPolicyUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticMutualArbiterAbi,
    eventName: 'CoverPolicyUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `eventName` set to `"LossProposed"`
 */
export const useWatchOptimisticMutualArbiterLossProposedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticMutualArbiterAbi,
    eventName: 'LossProposed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `eventName` set to `"LossVetoed"`
 */
export const useWatchOptimisticMutualArbiterLossVetoedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticMutualArbiterAbi,
    eventName: 'LossVetoed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `eventName` set to `"OwnershipTransferStarted"`
 */
export const useWatchOptimisticMutualArbiterOwnershipTransferStartedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticMutualArbiterAbi,
    eventName: 'OwnershipTransferStarted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchOptimisticMutualArbiterOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticMutualArbiterAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link optimisticMutualArbiterAbi}__ and `eventName` set to `"TreasuryUpdated"`
 */
export const useWatchOptimisticMutualArbiterTreasuryUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: optimisticMutualArbiterAbi,
    eventName: 'TreasuryUpdated',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link premiumSchedulerAbi}__
 */
export const useReadPremiumScheduler = /*#__PURE__*/ createUseReadContract({
  abi: premiumSchedulerAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"curveFor"`
 */
export const useReadPremiumSchedulerCurveFor =
  /*#__PURE__*/ createUseReadContract({
    abi: premiumSchedulerAbi,
    functionName: 'curveFor',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"manager"`
 */
export const useReadPremiumSchedulerManager =
  /*#__PURE__*/ createUseReadContract({
    abi: premiumSchedulerAbi,
    functionName: 'manager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"owner"`
 */
export const useReadPremiumSchedulerOwner = /*#__PURE__*/ createUseReadContract(
  { abi: premiumSchedulerAbi, functionName: 'owner' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"pendingOwner"`
 */
export const useReadPremiumSchedulerPendingOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: premiumSchedulerAbi,
    functionName: 'pendingOwner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"policy"`
 */
export const useReadPremiumSchedulerPolicy =
  /*#__PURE__*/ createUseReadContract({
    abi: premiumSchedulerAbi,
    functionName: 'policy',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"quote"`
 */
export const useReadPremiumSchedulerQuote = /*#__PURE__*/ createUseReadContract(
  { abi: premiumSchedulerAbi, functionName: 'quote' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"quoteStandby"`
 */
export const useReadPremiumSchedulerQuoteStandby =
  /*#__PURE__*/ createUseReadContract({
    abi: premiumSchedulerAbi,
    functionName: 'quoteStandby',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link premiumSchedulerAbi}__
 */
export const useWritePremiumScheduler = /*#__PURE__*/ createUseWriteContract({
  abi: premiumSchedulerAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useWritePremiumSchedulerAcceptOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: premiumSchedulerAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWritePremiumSchedulerRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: premiumSchedulerAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"setDefaultCurve"`
 */
export const useWritePremiumSchedulerSetDefaultCurve =
  /*#__PURE__*/ createUseWriteContract({
    abi: premiumSchedulerAbi,
    functionName: 'setDefaultCurve',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"setMutualCurve"`
 */
export const useWritePremiumSchedulerSetMutualCurve =
  /*#__PURE__*/ createUseWriteContract({
    abi: premiumSchedulerAbi,
    functionName: 'setMutualCurve',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"setPolicy"`
 */
export const useWritePremiumSchedulerSetPolicy =
  /*#__PURE__*/ createUseWriteContract({
    abi: premiumSchedulerAbi,
    functionName: 'setPolicy',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWritePremiumSchedulerTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: premiumSchedulerAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link premiumSchedulerAbi}__
 */
export const useSimulatePremiumScheduler =
  /*#__PURE__*/ createUseSimulateContract({ abi: premiumSchedulerAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useSimulatePremiumSchedulerAcceptOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: premiumSchedulerAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulatePremiumSchedulerRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: premiumSchedulerAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"setDefaultCurve"`
 */
export const useSimulatePremiumSchedulerSetDefaultCurve =
  /*#__PURE__*/ createUseSimulateContract({
    abi: premiumSchedulerAbi,
    functionName: 'setDefaultCurve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"setMutualCurve"`
 */
export const useSimulatePremiumSchedulerSetMutualCurve =
  /*#__PURE__*/ createUseSimulateContract({
    abi: premiumSchedulerAbi,
    functionName: 'setMutualCurve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"setPolicy"`
 */
export const useSimulatePremiumSchedulerSetPolicy =
  /*#__PURE__*/ createUseSimulateContract({
    abi: premiumSchedulerAbi,
    functionName: 'setPolicy',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulatePremiumSchedulerTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: premiumSchedulerAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link premiumSchedulerAbi}__
 */
export const useWatchPremiumSchedulerEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: premiumSchedulerAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `eventName` set to `"DefaultCurveSet"`
 */
export const useWatchPremiumSchedulerDefaultCurveSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: premiumSchedulerAbi,
    eventName: 'DefaultCurveSet',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `eventName` set to `"MutualCurveSet"`
 */
export const useWatchPremiumSchedulerMutualCurveSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: premiumSchedulerAbi,
    eventName: 'MutualCurveSet',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `eventName` set to `"OwnershipTransferStarted"`
 */
export const useWatchPremiumSchedulerOwnershipTransferStartedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: premiumSchedulerAbi,
    eventName: 'OwnershipTransferStarted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchPremiumSchedulerOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: premiumSchedulerAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link premiumSchedulerAbi}__ and `eventName` set to `"PolicySet"`
 */
export const useWatchPremiumSchedulerPolicySetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: premiumSchedulerAbi,
    eventName: 'PolicySet',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__
 */
export const useReadSkimmingMockStrategy = /*#__PURE__*/ createUseReadContract({
  abi: skimmingMockStrategyAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"asset"`
 */
export const useReadSkimmingMockStrategyAsset =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'asset',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"chargedGains"`
 */
export const useReadSkimmingMockStrategyChargedGains =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'chargedGains',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"maxDeposit"`
 */
export const useReadSkimmingMockStrategyMaxDeposit =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'maxDeposit',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"operator"`
 */
export const useReadSkimmingMockStrategyOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'operator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"operatorFeeBps"`
 */
export const useReadSkimmingMockStrategyOperatorFeeBps =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'operatorFeeBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"pendingSkim"`
 */
export const useReadSkimmingMockStrategyPendingSkim =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'pendingSkim',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"premiumRecipient"`
 */
export const useReadSkimmingMockStrategyPremiumRecipient =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'premiumRecipient',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"principal"`
 */
export const useReadSkimmingMockStrategyPrincipal =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'principal',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"skimBps"`
 */
export const useReadSkimmingMockStrategySkimBps =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'skimBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"totalAssets"`
 */
export const useReadSkimmingMockStrategyTotalAssets =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'totalAssets',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"vault"`
 */
export const useReadSkimmingMockStrategyVault =
  /*#__PURE__*/ createUseReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'vault',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__
 */
export const useWriteSkimmingMockStrategy =
  /*#__PURE__*/ createUseWriteContract({ abi: skimmingMockStrategyAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"deposit"`
 */
export const useWriteSkimmingMockStrategyDeposit =
  /*#__PURE__*/ createUseWriteContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'deposit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"setMaxDeposit"`
 */
export const useWriteSkimmingMockStrategySetMaxDeposit =
  /*#__PURE__*/ createUseWriteContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'setMaxDeposit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"simulateBackedYield"`
 */
export const useWriteSkimmingMockStrategySimulateBackedYield =
  /*#__PURE__*/ createUseWriteContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'simulateBackedYield',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"simulateLoss"`
 */
export const useWriteSkimmingMockStrategySimulateLoss =
  /*#__PURE__*/ createUseWriteContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'simulateLoss',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"simulateYield"`
 */
export const useWriteSkimmingMockStrategySimulateYield =
  /*#__PURE__*/ createUseWriteContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'simulateYield',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"skim"`
 */
export const useWriteSkimmingMockStrategySkim =
  /*#__PURE__*/ createUseWriteContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'skim',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"withdraw"`
 */
export const useWriteSkimmingMockStrategyWithdraw =
  /*#__PURE__*/ createUseWriteContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__
 */
export const useSimulateSkimmingMockStrategy =
  /*#__PURE__*/ createUseSimulateContract({ abi: skimmingMockStrategyAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"deposit"`
 */
export const useSimulateSkimmingMockStrategyDeposit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'deposit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"setMaxDeposit"`
 */
export const useSimulateSkimmingMockStrategySetMaxDeposit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'setMaxDeposit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"simulateBackedYield"`
 */
export const useSimulateSkimmingMockStrategySimulateBackedYield =
  /*#__PURE__*/ createUseSimulateContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'simulateBackedYield',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"simulateLoss"`
 */
export const useSimulateSkimmingMockStrategySimulateLoss =
  /*#__PURE__*/ createUseSimulateContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'simulateLoss',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"simulateYield"`
 */
export const useSimulateSkimmingMockStrategySimulateYield =
  /*#__PURE__*/ createUseSimulateContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'simulateYield',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"skim"`
 */
export const useSimulateSkimmingMockStrategySkim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'skim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `functionName` set to `"withdraw"`
 */
export const useSimulateSkimmingMockStrategyWithdraw =
  /*#__PURE__*/ createUseSimulateContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link skimmingMockStrategyAbi}__
 */
export const useWatchSkimmingMockStrategyEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: skimmingMockStrategyAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `eventName` set to `"OperatorFeePaid"`
 */
export const useWatchSkimmingMockStrategyOperatorFeePaidEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: skimmingMockStrategyAbi,
    eventName: 'OperatorFeePaid',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `eventName` set to `"PremiumRouted"`
 */
export const useWatchSkimmingMockStrategyPremiumRoutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: skimmingMockStrategyAbi,
    eventName: 'PremiumRouted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link skimmingMockStrategyAbi}__ and `eventName` set to `"YieldSkimmed"`
 */
export const useWatchSkimmingMockStrategyYieldSkimmedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: skimmingMockStrategyAbi,
    eventName: 'YieldSkimmed',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__
 */
export const useReadTokenWeighting = /*#__PURE__*/ createUseReadContract({
  abi: tokenWeightingAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadTokenWeightingDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"MAX_DENOMS"`
 */
export const useReadTokenWeightingMaxDenoms =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'MAX_DENOMS',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"MAX_REWARD_TOKENS"`
 */
export const useReadTokenWeightingMaxRewardTokens =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'MAX_REWARD_TOKENS',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"REWARDER_ROLE"`
 */
export const useReadTokenWeightingRewarderRole =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'REWARDER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"currentStake"`
 */
export const useReadTokenWeightingCurrentStake =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'currentStake',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"denomCount"`
 */
export const useReadTokenWeightingDenomCount =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'denomCount',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"factoryTypeId"`
 */
export const useReadTokenWeightingFactoryTypeId =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'factoryTypeId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadTokenWeightingGetRoleAdmin =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"getTotalPower"`
 */
export const useReadTokenWeightingGetTotalPower =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'getTotalPower',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"getTotalPowerAt"`
 */
export const useReadTokenWeightingGetTotalPowerAt =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'getTotalPowerAt',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"getVotingPower"`
 */
export const useReadTokenWeightingGetVotingPower =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'getVotingPower',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"getVotingPowerAt"`
 */
export const useReadTokenWeightingGetVotingPowerAt =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'getVotingPowerAt',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"governance"`
 */
export const useReadTokenWeightingGovernance =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'governance',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadTokenWeightingHasRole = /*#__PURE__*/ createUseReadContract(
  { abi: tokenWeightingAbi, functionName: 'hasRole' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"isDenomRetired"`
 */
export const useReadTokenWeightingIsDenomRetired =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'isDenomRetired',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"pendingRewards"`
 */
export const useReadTokenWeightingPendingRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'pendingRewards',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"provider"`
 */
export const useReadTokenWeightingProvider =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'provider',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"rewardDebt"`
 */
export const useReadTokenWeightingRewardDebt =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'rewardDebt',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"rewardsPerShare"`
 */
export const useReadTokenWeightingRewardsPerShare =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'rewardsPerShare',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadTokenWeightingSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"totalStake"`
 */
export const useReadTokenWeightingTotalStake =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingAbi,
    functionName: 'totalStake',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"weights"`
 */
export const useReadTokenWeightingWeights = /*#__PURE__*/ createUseReadContract(
  { abi: tokenWeightingAbi, functionName: 'weights' },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__
 */
export const useWriteTokenWeighting = /*#__PURE__*/ createUseWriteContract({
  abi: tokenWeightingAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"claimRewards"`
 */
export const useWriteTokenWeightingClaimRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: tokenWeightingAbi,
    functionName: 'claimRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"distributeRewards"`
 */
export const useWriteTokenWeightingDistributeRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: tokenWeightingAbi,
    functionName: 'distributeRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteTokenWeightingGrantRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: tokenWeightingAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteTokenWeightingInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: tokenWeightingAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"releaseStake"`
 */
export const useWriteTokenWeightingReleaseStake =
  /*#__PURE__*/ createUseWriteContract({
    abi: tokenWeightingAbi,
    functionName: 'releaseStake',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteTokenWeightingRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: tokenWeightingAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"retireDenom"`
 */
export const useWriteTokenWeightingRetireDenom =
  /*#__PURE__*/ createUseWriteContract({
    abi: tokenWeightingAbi,
    functionName: 'retireDenom',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteTokenWeightingRevokeRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: tokenWeightingAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"stake"`
 */
export const useWriteTokenWeightingStake = /*#__PURE__*/ createUseWriteContract(
  { abi: tokenWeightingAbi, functionName: 'stake' },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"transferGovernance"`
 */
export const useWriteTokenWeightingTransferGovernance =
  /*#__PURE__*/ createUseWriteContract({
    abi: tokenWeightingAbi,
    functionName: 'transferGovernance',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"updateWeight"`
 */
export const useWriteTokenWeightingUpdateWeight =
  /*#__PURE__*/ createUseWriteContract({
    abi: tokenWeightingAbi,
    functionName: 'updateWeight',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__
 */
export const useSimulateTokenWeighting =
  /*#__PURE__*/ createUseSimulateContract({ abi: tokenWeightingAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"claimRewards"`
 */
export const useSimulateTokenWeightingClaimRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'claimRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"distributeRewards"`
 */
export const useSimulateTokenWeightingDistributeRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'distributeRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateTokenWeightingGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateTokenWeightingInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"releaseStake"`
 */
export const useSimulateTokenWeightingReleaseStake =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'releaseStake',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateTokenWeightingRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"retireDenom"`
 */
export const useSimulateTokenWeightingRetireDenom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'retireDenom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateTokenWeightingRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"stake"`
 */
export const useSimulateTokenWeightingStake =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"transferGovernance"`
 */
export const useSimulateTokenWeightingTransferGovernance =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'transferGovernance',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link tokenWeightingAbi}__ and `functionName` set to `"updateWeight"`
 */
export const useSimulateTokenWeightingUpdateWeight =
  /*#__PURE__*/ createUseSimulateContract({
    abi: tokenWeightingAbi,
    functionName: 'updateWeight',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__
 */
export const useWatchTokenWeightingEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: tokenWeightingAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"DenomPurged"`
 */
export const useWatchTokenWeightingDenomPurgedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'DenomPurged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"DenomRetired"`
 */
export const useWatchTokenWeightingDenomRetiredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'DenomRetired',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"GovernanceTransferred"`
 */
export const useWatchTokenWeightingGovernanceTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'GovernanceTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"Initialized"`
 */
export const useWatchTokenWeightingInitializedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'Initialized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"RewardsClaimed"`
 */
export const useWatchTokenWeightingRewardsClaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'RewardsClaimed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"RewardsDistributed"`
 */
export const useWatchTokenWeightingRewardsDistributedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'RewardsDistributed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchTokenWeightingRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchTokenWeightingRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchTokenWeightingRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"StakeReleased"`
 */
export const useWatchTokenWeightingStakeReleasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'StakeReleased',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"Staked"`
 */
export const useWatchTokenWeightingStakedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'Staked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingAbi}__ and `eventName` set to `"WeightUpdated"`
 */
export const useWatchTokenWeightingWeightUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingAbi,
    eventName: 'WeightUpdated',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__
 */
export const useReadTokenWeightingVotesShim =
  /*#__PURE__*/ createUseReadContract({ abi: tokenWeightingVotesShimAbi })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `functionName` set to `"CLOCK_MODE"`
 */
export const useReadTokenWeightingVotesShimClockMode =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingVotesShimAbi,
    functionName: 'CLOCK_MODE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `functionName` set to `"clock"`
 */
export const useReadTokenWeightingVotesShimClock =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingVotesShimAbi,
    functionName: 'clock',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `functionName` set to `"delegate"`
 */
export const useReadTokenWeightingVotesShimDelegate =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingVotesShimAbi,
    functionName: 'delegate',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `functionName` set to `"delegateBySig"`
 */
export const useReadTokenWeightingVotesShimDelegateBySig =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingVotesShimAbi,
    functionName: 'delegateBySig',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `functionName` set to `"delegates"`
 */
export const useReadTokenWeightingVotesShimDelegates =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingVotesShimAbi,
    functionName: 'delegates',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `functionName` set to `"getPastTotalSupply"`
 */
export const useReadTokenWeightingVotesShimGetPastTotalSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingVotesShimAbi,
    functionName: 'getPastTotalSupply',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `functionName` set to `"getPastVotes"`
 */
export const useReadTokenWeightingVotesShimGetPastVotes =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingVotesShimAbi,
    functionName: 'getPastVotes',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `functionName` set to `"getVotes"`
 */
export const useReadTokenWeightingVotesShimGetVotes =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingVotesShimAbi,
    functionName: 'getVotes',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `functionName` set to `"source"`
 */
export const useReadTokenWeightingVotesShimSource =
  /*#__PURE__*/ createUseReadContract({
    abi: tokenWeightingVotesShimAbi,
    functionName: 'source',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__
 */
export const useWatchTokenWeightingVotesShimEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: tokenWeightingVotesShimAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `eventName` set to `"DelegateChanged"`
 */
export const useWatchTokenWeightingVotesShimDelegateChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingVotesShimAbi,
    eventName: 'DelegateChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link tokenWeightingVotesShimAbi}__ and `eventName` set to `"DelegateVotesChanged"`
 */
export const useWatchTokenWeightingVotesShimDelegateVotesChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: tokenWeightingVotesShimAbi,
    eventName: 'DelegateVotesChanged',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__
 */
export const useReadTwoTierArbiter = /*#__PURE__*/ createUseReadContract({
  abi: twoTierArbiterAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"activeCaseOf"`
 */
export const useReadTwoTierArbiterActiveCaseOf =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'activeCaseOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"appealController"`
 */
export const useReadTwoTierArbiterAppealController =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'appealController',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"appealWindow"`
 */
export const useReadTwoTierArbiterAppealWindow =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'appealWindow',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"arbiterCapabilities"`
 */
export const useReadTwoTierArbiterArbiterCapabilities =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'arbiterCapabilities',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"arbiterMetadataURI"`
 */
export const useReadTwoTierArbiterArbiterMetadataUri =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'arbiterMetadataURI',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"commitmentManager"`
 */
export const useReadTwoTierArbiterCommitmentManager =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'commitmentManager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"courtPolicyHash"`
 */
export const useReadTwoTierArbiterCourtPolicyHash =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'courtPolicyHash',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"executionBuffer"`
 */
export const useReadTwoTierArbiterExecutionBuffer =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'executionBuffer',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"getCase"`
 */
export const useReadTwoTierArbiterGetCase = /*#__PURE__*/ createUseReadContract(
  { abi: twoTierArbiterAbi, functionName: 'getCase' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"humanResponseWindow"`
 */
export const useReadTwoTierArbiterHumanResponseWindow =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'humanResponseWindow',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"manager"`
 */
export const useReadTwoTierArbiterManager = /*#__PURE__*/ createUseReadContract(
  { abi: twoTierArbiterAbi, functionName: 'manager' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"nextCaseId"`
 */
export const useReadTwoTierArbiterNextCaseId =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'nextCaseId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"primaryController"`
 */
export const useReadTwoTierArbiterPrimaryController =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'primaryController',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"requiredChallengeWindow"`
 */
export const useReadTwoTierArbiterRequiredChallengeWindow =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'requiredChallengeWindow',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadTwoTierArbiterSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: twoTierArbiterAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link twoTierArbiterAbi}__
 */
export const useWriteTwoTierArbiter = /*#__PURE__*/ createUseWriteContract({
  abi: twoTierArbiterAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"appeal"`
 */
export const useWriteTwoTierArbiterAppeal =
  /*#__PURE__*/ createUseWriteContract({
    abi: twoTierArbiterAbi,
    functionName: 'appeal',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"executeRuling"`
 */
export const useWriteTwoTierArbiterExecuteRuling =
  /*#__PURE__*/ createUseWriteContract({
    abi: twoTierArbiterAbi,
    functionName: 'executeRuling',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"lapseAppeal"`
 */
export const useWriteTwoTierArbiterLapseAppeal =
  /*#__PURE__*/ createUseWriteContract({
    abi: twoTierArbiterAbi,
    functionName: 'lapseAppeal',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"proposeRuling"`
 */
export const useWriteTwoTierArbiterProposeRuling =
  /*#__PURE__*/ createUseWriteContract({
    abi: twoTierArbiterAbi,
    functionName: 'proposeRuling',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"resolveAppeal"`
 */
export const useWriteTwoTierArbiterResolveAppeal =
  /*#__PURE__*/ createUseWriteContract({
    abi: twoTierArbiterAbi,
    functionName: 'resolveAppeal',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"syncCase"`
 */
export const useWriteTwoTierArbiterSyncCase =
  /*#__PURE__*/ createUseWriteContract({
    abi: twoTierArbiterAbi,
    functionName: 'syncCase',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"withdrawRuling"`
 */
export const useWriteTwoTierArbiterWithdrawRuling =
  /*#__PURE__*/ createUseWriteContract({
    abi: twoTierArbiterAbi,
    functionName: 'withdrawRuling',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link twoTierArbiterAbi}__
 */
export const useSimulateTwoTierArbiter =
  /*#__PURE__*/ createUseSimulateContract({ abi: twoTierArbiterAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"appeal"`
 */
export const useSimulateTwoTierArbiterAppeal =
  /*#__PURE__*/ createUseSimulateContract({
    abi: twoTierArbiterAbi,
    functionName: 'appeal',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"executeRuling"`
 */
export const useSimulateTwoTierArbiterExecuteRuling =
  /*#__PURE__*/ createUseSimulateContract({
    abi: twoTierArbiterAbi,
    functionName: 'executeRuling',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"lapseAppeal"`
 */
export const useSimulateTwoTierArbiterLapseAppeal =
  /*#__PURE__*/ createUseSimulateContract({
    abi: twoTierArbiterAbi,
    functionName: 'lapseAppeal',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"proposeRuling"`
 */
export const useSimulateTwoTierArbiterProposeRuling =
  /*#__PURE__*/ createUseSimulateContract({
    abi: twoTierArbiterAbi,
    functionName: 'proposeRuling',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"resolveAppeal"`
 */
export const useSimulateTwoTierArbiterResolveAppeal =
  /*#__PURE__*/ createUseSimulateContract({
    abi: twoTierArbiterAbi,
    functionName: 'resolveAppeal',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"syncCase"`
 */
export const useSimulateTwoTierArbiterSyncCase =
  /*#__PURE__*/ createUseSimulateContract({
    abi: twoTierArbiterAbi,
    functionName: 'syncCase',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `functionName` set to `"withdrawRuling"`
 */
export const useSimulateTwoTierArbiterWithdrawRuling =
  /*#__PURE__*/ createUseSimulateContract({
    abi: twoTierArbiterAbi,
    functionName: 'withdrawRuling',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link twoTierArbiterAbi}__
 */
export const useWatchTwoTierArbiterEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: twoTierArbiterAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `eventName` set to `"AppealLapsed"`
 */
export const useWatchTwoTierArbiterAppealLapsedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: twoTierArbiterAbi,
    eventName: 'AppealLapsed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `eventName` set to `"AppealResolved"`
 */
export const useWatchTwoTierArbiterAppealResolvedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: twoTierArbiterAbi,
    eventName: 'AppealResolved',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `eventName` set to `"CaseSynchronized"`
 */
export const useWatchTwoTierArbiterCaseSynchronizedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: twoTierArbiterAbi,
    eventName: 'CaseSynchronized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `eventName` set to `"RulingAppealed"`
 */
export const useWatchTwoTierArbiterRulingAppealedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: twoTierArbiterAbi,
    eventName: 'RulingAppealed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `eventName` set to `"RulingExecuted"`
 */
export const useWatchTwoTierArbiterRulingExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: twoTierArbiterAbi,
    eventName: 'RulingExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `eventName` set to `"RulingProposed"`
 */
export const useWatchTwoTierArbiterRulingProposedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: twoTierArbiterAbi,
    eventName: 'RulingProposed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link twoTierArbiterAbi}__ and `eventName` set to `"RulingWithdrawn"`
 */
export const useWatchTwoTierArbiterRulingWithdrawnEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: twoTierArbiterAbi,
    eventName: 'RulingWithdrawn',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__
 */
export const useReadVaultCoverConduit = /*#__PURE__*/ createUseReadContract({
  abi: vaultCoverConduitAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `functionName` set to `"asset"`
 */
export const useReadVaultCoverConduitAsset =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultCoverConduitAbi,
    functionName: 'asset',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `functionName` set to `"manager"`
 */
export const useReadVaultCoverConduitManager =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultCoverConduitAbi,
    functionName: 'manager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `functionName` set to `"maxStreamDuration"`
 */
export const useReadVaultCoverConduitMaxStreamDuration =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultCoverConduitAbi,
    functionName: 'maxStreamDuration',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `functionName` set to `"minFundAssets"`
 */
export const useReadVaultCoverConduitMinFundAssets =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultCoverConduitAbi,
    functionName: 'minFundAssets',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `functionName` set to `"mutualId"`
 */
export const useReadVaultCoverConduitMutualId =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultCoverConduitAbi,
    functionName: 'mutualId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `functionName` set to `"policy"`
 */
export const useReadVaultCoverConduitPolicy =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultCoverConduitAbi,
    functionName: 'policy',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `functionName` set to `"scheduler"`
 */
export const useReadVaultCoverConduitScheduler =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultCoverConduitAbi,
    functionName: 'scheduler',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `functionName` set to `"vault"`
 */
export const useReadVaultCoverConduitVault =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultCoverConduitAbi,
    functionName: 'vault',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__
 */
export const useWriteVaultCoverConduit = /*#__PURE__*/ createUseWriteContract({
  abi: vaultCoverConduitAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `functionName` set to `"poke"`
 */
export const useWriteVaultCoverConduitPoke =
  /*#__PURE__*/ createUseWriteContract({
    abi: vaultCoverConduitAbi,
    functionName: 'poke',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__
 */
export const useSimulateVaultCoverConduit =
  /*#__PURE__*/ createUseSimulateContract({ abi: vaultCoverConduitAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `functionName` set to `"poke"`
 */
export const useSimulateVaultCoverConduitPoke =
  /*#__PURE__*/ createUseSimulateContract({
    abi: vaultCoverConduitAbi,
    functionName: 'poke',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link vaultCoverConduitAbi}__
 */
export const useWatchVaultCoverConduitEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: vaultCoverConduitAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link vaultCoverConduitAbi}__ and `eventName` set to `"PremiumFunded"`
 */
export const useWatchVaultCoverConduitPremiumFundedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: vaultCoverConduitAbi,
    eventName: 'PremiumFunded',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultFactoryAbi}__
 */
export const useReadVaultFactory = /*#__PURE__*/ createUseReadContract({
  abi: vaultFactoryAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"VAULT_TYPE_ID"`
 */
export const useReadVaultFactoryVaultTypeId =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultFactoryAbi,
    functionName: 'VAULT_TYPE_ID',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"allVaults"`
 */
export const useReadVaultFactoryAllVaults = /*#__PURE__*/ createUseReadContract(
  { abi: vaultFactoryAbi, functionName: 'allVaults' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"implementationTypeId"`
 */
export const useReadVaultFactoryImplementationTypeId =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultFactoryAbi,
    functionName: 'implementationTypeId',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"isBlacklisted"`
 */
export const useReadVaultFactoryIsBlacklisted =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultFactoryAbi,
    functionName: 'isBlacklisted',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"isWhitelisted"`
 */
export const useReadVaultFactoryIsWhitelisted =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultFactoryAbi,
    functionName: 'isWhitelisted',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"owner"`
 */
export const useReadVaultFactoryOwner = /*#__PURE__*/ createUseReadContract({
  abi: vaultFactoryAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"vaultByAsset"`
 */
export const useReadVaultFactoryVaultByAsset =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultFactoryAbi,
    functionName: 'vaultByAsset',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"vaultCount"`
 */
export const useReadVaultFactoryVaultCount =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultFactoryAbi,
    functionName: 'vaultCount',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"vaultImplementation"`
 */
export const useReadVaultFactoryVaultImplementation =
  /*#__PURE__*/ createUseReadContract({
    abi: vaultFactoryAbi,
    functionName: 'vaultImplementation',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link vaultFactoryAbi}__
 */
export const useWriteVaultFactory = /*#__PURE__*/ createUseWriteContract({
  abi: vaultFactoryAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"blacklist"`
 */
export const useWriteVaultFactoryBlacklist =
  /*#__PURE__*/ createUseWriteContract({
    abi: vaultFactoryAbi,
    functionName: 'blacklist',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"deployVault"`
 */
export const useWriteVaultFactoryDeployVault =
  /*#__PURE__*/ createUseWriteContract({
    abi: vaultFactoryAbi,
    functionName: 'deployVault',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"multicall"`
 */
export const useWriteVaultFactoryMulticall =
  /*#__PURE__*/ createUseWriteContract({
    abi: vaultFactoryAbi,
    functionName: 'multicall',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteVaultFactoryRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: vaultFactoryAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteVaultFactoryTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: vaultFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"whitelistImplementation"`
 */
export const useWriteVaultFactoryWhitelistImplementation =
  /*#__PURE__*/ createUseWriteContract({
    abi: vaultFactoryAbi,
    functionName: 'whitelistImplementation',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link vaultFactoryAbi}__
 */
export const useSimulateVaultFactory = /*#__PURE__*/ createUseSimulateContract({
  abi: vaultFactoryAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"blacklist"`
 */
export const useSimulateVaultFactoryBlacklist =
  /*#__PURE__*/ createUseSimulateContract({
    abi: vaultFactoryAbi,
    functionName: 'blacklist',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"deployVault"`
 */
export const useSimulateVaultFactoryDeployVault =
  /*#__PURE__*/ createUseSimulateContract({
    abi: vaultFactoryAbi,
    functionName: 'deployVault',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"multicall"`
 */
export const useSimulateVaultFactoryMulticall =
  /*#__PURE__*/ createUseSimulateContract({
    abi: vaultFactoryAbi,
    functionName: 'multicall',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateVaultFactoryRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: vaultFactoryAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateVaultFactoryTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: vaultFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link vaultFactoryAbi}__ and `functionName` set to `"whitelistImplementation"`
 */
export const useSimulateVaultFactoryWhitelistImplementation =
  /*#__PURE__*/ createUseSimulateContract({
    abi: vaultFactoryAbi,
    functionName: 'whitelistImplementation',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link vaultFactoryAbi}__
 */
export const useWatchVaultFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: vaultFactoryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link vaultFactoryAbi}__ and `eventName` set to `"ImplementationBlacklisted"`
 */
export const useWatchVaultFactoryImplementationBlacklistedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: vaultFactoryAbi,
    eventName: 'ImplementationBlacklisted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link vaultFactoryAbi}__ and `eventName` set to `"ImplementationWhitelisted"`
 */
export const useWatchVaultFactoryImplementationWhitelistedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: vaultFactoryAbi,
    eventName: 'ImplementationWhitelisted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link vaultFactoryAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchVaultFactoryOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: vaultFactoryAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link vaultFactoryAbi}__ and `eventName` set to `"VaultDeployed"`
 */
export const useWatchVaultFactoryVaultDeployedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: vaultFactoryAbi,
    eventName: 'VaultDeployed',
  })
