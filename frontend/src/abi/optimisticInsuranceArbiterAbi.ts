export const optimisticInsuranceArbiterAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "manager_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "bondToken_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "minBond_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "answerTimeout_",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "winnerShareBps_",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "treasury_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "CLAIM_STALE_TTL",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_BOND_DOUBLINGS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "activeClaimOf",
    "inputs": [
      {
        "name": "commitmentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "activeClaimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "answerTimeout",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bondToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancelClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelStaleClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "commitmentManager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "disputeClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "counterAmountBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "bond",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executeClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "finalizeClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getBondStackTop",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "asserter",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amountBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "bond",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "deadline",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct OptimisticInsuranceArbiter.Claim",
        "components": [
          {
            "name": "commitmentId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "winningAmtBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "lastBondAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum OptimisticInsuranceArbiter.ClaimState"
          },
          {
            "name": "templateId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "stack",
            "type": "tuple[]",
            "internalType": "struct OptimisticInsuranceArbiter.BondEntry[]",
            "components": [
              {
                "name": "asserter",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "amountBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "bond",
                "type": "uint128",
                "internalType": "uint128"
              }
            ]
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "manager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ICommitmentManager"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minBond",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextClaimId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "proposeClaim",
    "inputs": [
      {
        "name": "commitmentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amountBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "templateId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "bond",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "outputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "winnerShareBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "ClaimCancelled",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimDisputed",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "disputer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amountBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "bond",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimFinalized",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "winningAmtBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimProposed",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "commitmentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "proposer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amountBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "bond",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "templateId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimRuled",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "winningAmtBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "source",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimSettled",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "winnerPayout",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "treasuryPayout",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "winningRefunds",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimStaleCancelled",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyDisputed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AmountAboveCommitmentMax",
    "inputs": [
      {
        "name": "commitmentMax",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "claimAmount",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "BondBelowFloor",
    "inputs": [
      {
        "name": "minimum",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "provided",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "BondNotDoubled",
    "inputs": [
      {
        "name": "required",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "provided",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimAlreadyActive",
    "inputs": [
      {
        "name": "commitmentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "existingClaimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "CommitmentNotActive",
    "inputs": [
      {
        "name": "commitmentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidAmountBps",
    "inputs": [
      {
        "name": "amountBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidWinnerShareBps",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LastAsserterCannotDispute",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MaxDoublingsReached",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotProposer",
    "inputs": [
      {
        "name": "proposer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "StaleTtlNotElapsed",
    "inputs": [
      {
        "name": "readyAt",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "nowTs",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "TimeoutNotElapsed",
    "inputs": [
      {
        "name": "readyAt",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "nowTs",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "TreasuryRequired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "WrongArbiter",
    "inputs": [
      {
        "name": "expected",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "actual",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "WrongBondToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WrongClaimState",
    "inputs": [
      {
        "name": "expected",
        "type": "uint8",
        "internalType": "enum OptimisticInsuranceArbiter.ClaimState"
      },
      {
        "name": "actual",
        "type": "uint8",
        "internalType": "enum OptimisticInsuranceArbiter.ClaimState"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroAnswerTimeout",
    "inputs": []
  }
] as const
