---
title: ERC-COMMITMENTS Selector and Topic0 Appendix
status: generated
generated: true
---

# ERC-COMMITMENTS — Selector & Topic0 Appendix

> **Generated file — do not edit by hand.** Produced by `script/gen-selectors.mjs`
> (`just selectors`) from the standards manifest and compiled ABIs under `out/`.
> Regenerate after any interface change.

This appendix pins the on-chain identifiers integrators build against: 4-byte
**function selectors**, 32-byte **event topic0** hashes, 4-byte **error
selectors**, and **ERC-165 interface ids**. Signatures are canonical (tuples
expanded, argument order as declared). Agreement and Mutual entries remain on
the aggregate `ICommitmentManager` ABI for compatibility, but are grouped under
the standards that specify them.

## ERC-COMMITMENTS — Commitments Core

### `ICommitmentManager`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x2cd19ce0` | `cancelForfeit(uint256)` |
| `0x26b5f204` | `cancelStaleForfeitProposal(uint256)` |
| `0x0d6f1fc9` | `cancelUnbond(uint256)` |
| `0xecbd45af` | `claim(uint256,address,bytes)` |
| `0x8fe6f94e` | `closedAt(uint256)` |
| `0x81f63f2f` | `contributeEncumbered(uint256,uint256)` |
| `0x63bda5d3` | `createAndFund(uint256,(address,address,address,address,uint256,uint16,uint64,uint64,(address,bytes)[],string,bytes32))` |
| `0xdaf24942` | `createCommitment((address,address,address,address,uint256,uint16,uint64,uint64,(address,bytes)[],string,bytes32))` |
| `0x1835b374` | `createCommitmentFor(address,(address,address,address,address,uint256,uint16,uint64,uint64,(address,bytes)[],string,bytes32),uint256,uint256,bytes)` |
| `0x47e7ef24` | `deposit(address,uint256)` |
| `0xc8820f6c` | `depositFor(address,uint256,address)` |
| `0x12a62cff` | `depositWithPermit(address,uint256,uint256,uint8,bytes32,bytes32)` |
| `0xe1fa8b02` | `distribute(uint256,address)` |
| `0x94c176e4` | `distributeAll(uint256)` |
| `0xce85c6ec` | `encumberedBalance(address,address)` |
| `0x7d8746f9` | `escrowOf(address,address)` |
| `0xef3bf569` | `executeForfeit(uint256)` |
| `0x18117038` | `expireCommitment(uint256)` |
| `0x291cf6fb` | `finalizeUnbond(uint256)` |
| `0x4b6df144` | `forfeitedUnitsOf(uint256)` |
| `0x382ba5ba` | `freeBalance(address,address)` |
| `0x7fb23769` | `fundStrategy(address,address,uint256)` |
| `0x69bcdb7d` | `getCommitment(uint256)` |
| `0x95804480` | `getForfeitProposal(uint256)` |
| `0xd9620e8f` | `getUserExposure(address,address)` |
| `0x575eb3e5` | `hookGasCap()` |
| `0x7ee1d02e` | `initiateForfeit(uint256,uint16)` |
| `0x85e30ccc` | `invalidateCreateAuthorization()` |
| `0x7ecebe00` | `nonces(address)` |
| `0x58c2225b` | `operatorRegistry()` |
| `0x34c3dff1` | `pauseForfeiture()` |
| `0xd7118351` | `pauseState()` |
| `0x5f37f4c0` | `pending(uint256,address,bytes)` |
| `0x8c9e2e5f` | `releaseCommitment(uint256)` |
| `0x54f63b14` | `requestUnbond(uint256)` |
| `0x9b610072` | `strategiesOf(uint256)` |
| `0x3d513cf7` | `sweepFailedHook(uint256,address)` |
| `0x636a6a79` | `unbondInitiatedAt(uint256)` |
| `0x6cf6d675` | `unbondingPeriod()` |
| `0x2b42c3eb` | `unpauseForfeiture()` |
| `0xf3fef3a3` | `withdraw(address,uint256)` |

#### Event topic0

| topic0 | Signature |
|---|---|
| `0xd4d6e7f34ebb4f4a5c72d905269ec40aebf16d87c53f82a60aab5608b87edbc0` | `CommitmentBoundToStrategy(uint256,address,bytes)` |
| `0x3c6eb8b9c2108e844c1af90289be797b54ec9fa33bc0fb90d7140943d484f8d0` | `CommitmentCreated(uint256,address,address,address,address,address,uint256,uint16,uint64,uint64,string,bytes32)` |
| `0x341988ee052d669244b570da8d1dcf7731f4cf5933df2edf40201222ce62f5cb` | `CommitmentExpired(uint256,address)` |
| `0x9df20228d91c3065c03ef144e93618b94bbb13bb3efdad1d9e4d95adb874b0f5` | `CommitmentFinalized(uint256)` |
| `0xd56043f5b5d853ad89cae8f33fa9639e101319e3d343a4e9892286eaa90719cf` | `CommitmentReleased(uint256,address)` |
| `0x793f2415742d898660485c01e6ab38ea9cec9e14eea1813d93563ba36b31665f` | `CommitmentUnbondCancelled(uint256)` |
| `0xe4ecc6512c0e370a2e4bfe7e6a56921e03d4b9fe207e8ccd0f3fc05088273716` | `CommitmentUnbondRequested(uint256,address,uint64)` |
| `0x0fb5e1b7fcc52f140f926ddfed19aff1303e856723af89ac1bae83e25f00221e` | `ContributionsEnabled(uint256,address)` |
| `0x28850baec8b7355377d73f77c91430a3ff137a8abfb489fee4f268a776c27588` | `CreateAuthorizationInvalidated(address,uint256)` |
| `0x8752a472e571a816aea92eec8dae9baf628e840f4929fbcc2d155e6233ff68a7` | `Deposited(address,address,uint256)` |
| `0xea7e3e43908fbcbb6537d7b765c6d9754640766124962dd14fb285f1228b6447` | `DistributionPaid(address,address,address,uint256,uint256,bytes32)` |
| `0xf5aca200898ff2861a63fbd3f2d409cc2d0978122a7248d7d106d90145a3f8a1` | `EncumbranceContributed(uint256,address,address,uint256)` |
| `0x98aec918ba52b2e86d922e50dc486b36cc90b51b37d1240c851b16ab6ddc5823` | `EncumbranceIncreased(address,address,uint256)` |
| `0xf96187694fceb95ed9c11e01056977b4599cf0620cc9325d769b8cbd903f9826` | `EncumbranceMovedToEscrow(uint256,address,address,uint256)` |
| `0xe5d6c841a8acde472a42d05f620fb60de25f2d55d1212f4ffbfadd64f8999a7f` | `EncumbrancePaidExternal(uint256,address,address,uint256)` |
| `0x1faa94b07a3212f75a1f7a4f50553571199bbb365f685c682c72ae697cb5dbaa` | `EncumbranceReleased(uint256,address,address,uint256)` |
| `0x1662447ec31f27dc3766611220d19c8a77c370a9a72b5261458a0b4edcd1708d` | `ForfeitCancelled(uint256)` |
| `0xee54ccf40930b5c8eea718330c917e825fa81a6ec6bb442671295b18023ad08c` | `ForfeitCancelledStale(uint256)` |
| `0xf22baa666cf8aaa09fae00e1b3bfd18ed0fd3f492045cc2f8d50862470ddcc62` | `ForfeitExecuted(uint256,uint256,address)` |
| `0x1aacaeb33f466c399d0e1927e72524bd4dd84d2f4652d26ed09ddf3211beb761` | `ForfeitInitiated(uint256,uint16,uint64)` |
| `0x1a72591dbd0b550715012589fe4e2fb2a81a89d69aa202d0c1c3d9deb278c4ea` | `ForfeiturePauseToggled(bool)` |
| `0xe950ec7cbac9da0b6e2f5a4f2e471e71e3440ef34f9a01962412b479a74dd990` | `HookGasCapUpdated(uint64,uint64)` |
| `0x9cec45a50e7ece848bb3f2b4b0ea146c154e1bee7135128ca20027299923db05` | `MinChallengeWindowUpdated(uint64,uint64)` |
| `0xf8b0ee9361a0f0225b39f58411465016adbd34abff194e6119b537fa8b063247` | `OperatorRegistryUpdated(address,address)` |
| `0x6f418bf463519db7e778f00ec407308483fabbce5f93bf3711af690309621980` | `RegistryHookFailed(uint256,bytes4)` |
| `0x8645e4b5a3773009365e38f3a54d01e3406f3b6db6cda75c6891c525d648fb60` | `StrategyFunded(address,address,address,uint256)` |
| `0x9cd5b6c7d273217ee890eb2e1ff55fedd29e935e9b7526b2597d82364f26f122` | `StrategyHookFailed(uint256,address,bytes4)` |
| `0xb63dfb3782776fe53d70eb7aeaf3379f5e482fca391e5a5453d4b310bdbbb666` | `UnbondingPeriodUpdated(uint64,uint64)` |
| `0xd1c19fbcd4551a5edfb66d43d2e337c04837afda3482b42bdf569a8fccdae5fb` | `Withdrawn(address,address,uint256)` |

#### Error selectors

| Selector | Signature |
|---|---|
| `0x90109168` | `ChallengeWindowActive()` |
| `0x2a79c22c` | `ChallengeWindowTooShort()` |
| `0x27bf151c` | `CommitmentHasNoExpiry()` |
| `0x9dcdb076` | `CommitmentInactive()` |
| `0xd475a053` | `CommitmentNotExpired()` |
| `0x20f34bae` | `ContributionsDisabled()` |
| `0xcc5fde69` | `DuplicateStrategy()` |
| `0xc2e5347d` | `EmptyBatch()` |
| `0x236c6c77` | `ForfeitPending()` |
| `0x4f4ce8e7` | `ForfeitureIsPaused()` |
| `0x192de9b3` | `InsufficientEncumberedBalance(uint256,uint256)` |
| `0xc0710ec8` | `InsufficientEscrow(uint256,uint256)` |
| `0x4aeb0dcb` | `InsufficientFreeBalance(uint256,uint256)` |
| `0x4206fa3c` | `InsufficientGasForHook()` |
| `0xd36c8500` | `InvalidExpiry()` |
| `0x756688fe` | `InvalidNonce()` |
| `0x8baa579f` | `InvalidSignature()` |
| `0xd5b532b3` | `MinChallengeWindowBelowFloor()` |
| `0x1f1b0045` | `MovementEscrowRecipientNotStrategy(address,address)` |
| `0x0653fa01` | `MovementExceedsCommitment(uint256,uint256)` |
| `0x7faa0984` | `MovementFromEscrowNotOnDistribute()` |
| `0x1b759871` | `MovementFromNotCommitter(address,address)` |
| `0x0501d36c` | `MovementFromNotStrategy(address,address)` |
| `0x5beffab4` | `MovementRecipientNotParty(address)` |
| `0x34bc301e` | `MovementToEscrowNotAllowedOnClaim()` |
| `0x44178825` | `MovementToExternalOnlyOnDistribute()` |
| `0x7f86c4be` | `MovementWrongToken(address,address)` |
| `0x1e40973e` | `MovementZeroUnits()` |
| `0x9465883d` | `NoActiveForfeitProposal()` |
| `0xaa9dba5e` | `NoFailedHook()` |
| `0xfe107326` | `NoUnbondPending()` |
| `0xccb665a6` | `NotArbiter()` |
| `0x2e3bec61` | `NotCommitter()` |
| `0x9a69ed93` | `OperatorRegistrySwapBlocked(address)` |
| `0x8d6f12a9` | `PenaltyExceedsMax()` |
| `0x0819bdcd` | `SignatureExpired()` |
| `0xc0fda9fe` | `TooManyStrategies()` |
| `0x8b8d204c` | `URITooLong()` |
| `0x82b42900` | `Unauthorized()` |
| `0xff231895` | `UnbondAlreadyRequested()` |
| `0x411c436f` | `UnbondBlockedByForfeit()` |
| `0xa27b275d` | `UnbondNotElapsed(uint64)` |
| `0x1d865f0d` | `UnbondPending()` |
| `0x3191b6f3` | `UnknownStrategy()` |
| `0xd92e233d` | `ZeroAddress()` |
| `0x1f2a2005` | `ZeroAmount()` |
| `0xe09e5412` | `ZeroArbiter()` |
| `0x9f1ecc3a` | `ZeroCounterparty()` |

### `IBackingAdapter`

#### Function selectors

| Selector | Signature |
|---|---|
| `0xee4ed9a9` | `indexNow(address)` |
| `0x03a4ebca` | `payoutDenomination(address)` |

### `IDistributionStrategy`

#### Function selectors

| Selector | Signature |
|---|---|
| `0xc1acab40` | `claim(((uint256,address,address,address,address,uint256,uint64),address,uint64),bytes)` |
| `0x261fd86f` | `distribute(((uint256,address,address,address,address,uint256,uint64),address))` |
| `0x7977650d` | `onCommitmentCreated(((uint256,address,address,address,address,uint256,uint64),uint256,uint16,uint64,bytes))` |
| `0xd6aa0ae5` | `onCommitmentForfeited(((uint256,address,address,address,address,uint256,uint64),uint16,address,uint256))` |
| `0x7fbbcbe2` | `onCommitmentReleased(((uint256,address,address,address,address,uint256,uint64)))` |
| `0x5b624528` | `pending(((uint256,address,address,address,address,uint256,uint64),address,uint64),bytes)` |

## ERC-COMMITMENTS-AGREEMENTS — Agreements

### `ICommitmentManager`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x3ae776d2` | `acceptAgreement(uint256)` |
| `0xbac127a7` | `agreementOf(uint256)` |
| `0x459cf2da` | `agreementOfProposal(uint256)` |
| `0x0de04eed` | `cancelAgreementProposal(uint256)` |
| `0x3ce3d5f8` | `forfeitAgreement(uint256,uint16)` |
| `0xf5cfe8d5` | `getAgreementPair(uint256)` |
| `0xef7639a5` | `getAgreementSettlement(uint256)` |
| `0x43c89584` | `proposeAgreement((address,address,(address,address,uint256,uint16,(address,bytes)[]),(address,address,uint256,uint16,(address,bytes)[]),uint64,uint64,string,bytes32,uint128,uint128))` |
| `0x262a384b` | `releaseAgreement(uint256)` |
| `0xe167c90b` | `settleAgreement(uint256,bool,uint256,bytes32)` |

#### Event topic0

| topic0 | Signature |
|---|---|
| `0x9cc0c398d2c0a9ac6b9f758c52e08727045d5b403a69855af18a569c01503b65` | `AgreementAccepted(uint256,uint256,uint256,uint256,string,bytes32)` |
| `0x4ef00eec8cf3b941f1742246624bd7d32a64500d10aac998bdeb379969090caf` | `AgreementForfeited(uint256)` |
| `0x8b28699286769017816c73b985b75921a07a43c6a9fc13c020772eaf40719e55` | `AgreementPartialForfeit(uint256,uint256)` |
| `0x753dcd64e79ec24d03c52f0f4ee66603cc51e51545d7ede8673884950f4840e8` | `AgreementProposalCancelled(uint256)` |
| `0x8101b2d2b6a3eb3bc3562ce369591c679a1f81d46bc4c827ad6172a15ee0a64a` | `AgreementProposalExpiredCancelled(uint256,address)` |
| `0x254f22be34bc63d2da17d04bac1cdc94817eb9a149259886754269bb179fb336` | `AgreementProposed(uint256,address,address,string,bytes32)` |
| `0x244d23c6a9f65c9999e9390e6f162748a00557f1e579060ffa714e866d9ba75e` | `AgreementProposedTerms(uint256,address,address,address,uint256,uint16,address,address,uint256,uint16,uint64,uint64,uint128,uint128)` |
| `0x0c43d8cabcbcb3bba7d1d7a1491c66a0a957d6836f82f2b597016ddc8b72e71a` | `AgreementReleased(uint256)` |
| `0x4790d617bd2f3500e3102f07b53ecd8795905b0ba1f5d8aacdbac0908c871285` | `AgreementSettled(uint256,bool,uint256,uint256,uint256,bytes32)` |

#### Error selectors

| Selector | Signature |
|---|---|
| `0x27b4f32b` | `AgreementBothResolved()` |
| `0x9cc59cb9` | `AgreementNotFound()` |
| `0x1aa8064c` | `AlreadyAccepted()` |
| `0x259f58ce` | `InsufficientCommitmentAmount(uint256,uint256)` |
| `0x90a13e80` | `NotAcceptor()` |
| `0x7d1b73b9` | `NotProposer()` |
| `0x54a863d8` | `ProposalDurationTooLong()` |
| `0x28a72379` | `ProposalExpired()` |
| `0x635e8737` | `ProposalNotFound()` |
| `0xf1751947` | `SettlementCapExceeded(uint128,uint128)` |
| `0x1d50a205` | `SettlementCapZero()` |
| `0xb0995335` | `UseAgreementPath()` |

## ERC-COMMITMENTS-MUTUALS — Mutuals

### `ICommitmentManager`

#### Function selectors

| Selector | Signature |
|---|---|
| `0xed970880` | `activateMutual(uint256)` |
| `0x975761d2` | `cancelMutualLoss(uint256)` |
| `0xbcac5af4` | `cancelStaleMutualLoss(uint256)` |
| `0x033d8afb` | `claimMemberPremium(uint256)` |
| `0x66208a18` | `createMutual((address,address,address,uint64,uint64))` |
| `0xd842ddb8` | `executeMutualLoss(uint256)` |
| `0xd7163930` | `fundMutualPremium(uint256,uint256,uint64)` |
| `0x38fbf2c6` | `getMembership(uint256)` |
| `0x46950e1b` | `getMutual(uint256)` |
| `0x96e0f85a` | `getMutualLossProposal(uint256)` |
| `0xb2ca6d26` | `getMutualPremiumState(uint256)` |
| `0x9249fe7f` | `initiateMutualLoss(uint256,uint256,bytes32)` |
| `0x3dd33b33` | `joinMutual(uint256,(address,address,address,address,uint256,uint16,uint64,uint64,(address,bytes)[],string,bytes32))` |
| `0x7c2cfb5c` | `pendingMemberLoss(uint256)` |
| `0x62340abc` | `pendingMemberPremium(uint256)` |
| `0xd432238d` | `reclaimPremium(uint256)` |
| `0x307c36ad` | `releaseMutualMember(uint256)` |
| `0xaa7aa643` | `requestMutualExit(uint256)` |
| `0xaf81191f` | `settleMemberLoss(uint256)` |
| `0xbe0ab14e` | `settleMembers(uint256[])` |

#### Event topic0

| topic0 | Signature |
|---|---|
| `0x21fb793588837a4abd624a2ef31a01cc5900752d3f3e1df350a420c3719069e6` | `MemberExitLapsed(uint256,uint256)` |
| `0xfa18642e7d835d824f721372ae4d5de7e8ec4d20e4bbec100a65fb9abc4143ad` | `MemberExitRequested(uint256,uint256,uint64)` |
| `0xcb822c5c768eef06a96e73295defbfc46e2ab3e498ff258651c0e7eb398a3003` | `MemberJoined(uint256,uint256,address,uint128,uint256)` |
| `0x60f37e9ed531bc54915d13dcc372b88583ffaa830d8afa84561f5e92ef946152` | `MemberPremiumClaimed(uint256,address,uint256)` |
| `0x452dda6038fbc3d60af3fa22bb027c7534fa4e0139c5e8580cfa9a252218797d` | `MemberReleased(uint256,uint256)` |
| `0xcd464cbe0947b45d2f30859f6c2b6a1565e43b7cdd16748760e2edd6be707636` | `MemberSettled(uint256,uint256,uint256,uint256)` |
| `0x00472971d79a888eeee711359f23a84d8c04824898531260e185247563ebc02e` | `MutualActivated(uint256)` |
| `0x6850cd51e55285efc65fd0ab89c6408ae3ec9fa1a454eb309265dd9d623614e6` | `MutualCreated(uint256,address,address,address)` |
| `0x2e93d0dd5b27b7b0847a7265ba47fd55b8ec8eaf037734c04732fde314d49622` | `MutualLossCancelled(uint256,bool)` |
| `0x062b0e68f47c67a51df6252476443b6d17f49668666b234c1a13a6121f377531` | `MutualLossExecuted(uint256,uint256,uint256)` |
| `0xb494ed38a04c2e23df1bd2269fe10a63a1f81ae7e8f3663a292c5ce0c12d2d6e` | `MutualLossInitiated(uint256,uint256,bytes32,address)` |
| `0xb2358a28beb5c62e011d8a759b7a7e1e7d7c8109a6610b078f00fe1647b4251f` | `MutualLossShortfall(uint256,uint256)` |
| `0xc1b736e37afc95392a8d348b5b3cf672ec8f000b3b772a8b5997594e5c5fbd30` | `MutualPremiumFunded(uint256,address,uint256,uint128,uint64)` |
| `0xd4862ab7e826f485bc7683b1b2e1ed3c6fdc856f535ed73e43cc9ef555ed8a79` | `MutualPremiumSwept(uint256,address,uint256)` |
| `0xe674a939716ad9939d99d4a31dc9c0ac7ac9bf5f67047a1465e1740e5469e60d` | `MutualTerminated(uint256)` |
| `0x57364f0f418052fa583ab663310fe85d9307b323cc759ebe276e021735ca3b8d` | `PremiumReclaimed(uint256,address,uint256)` |

#### Error selectors

| Selector | Signature |
|---|---|
| `0x8b1401b9` | `CommitmentInMutual()` |
| `0x4adb6f85` | `DeallocationWindowActive()` |
| `0x12f50c9e` | `DeallocationWindowTooShort()` |
| `0xd40f0da0` | `ExitNotRequested()` |
| `0x2fbafd87` | `ExitRequestLapsed()` |
| `0xe0e95f30` | `InsufficientMutualPremium(uint256,uint256)` |
| `0x64b1e133` | `InvalidCreditedValue()` |
| `0x8c7933ae` | `MemberStrategyForbidden()` |
| `0xb6093cb5` | `MemberUnsettled()` |
| `0x1cdb7bd1` | `MutualArbiterMismatch()` |
| `0x1d1d4e48` | `MutualBeneficiaryMismatch()` |
| `0x2e377f89` | `MutualChallengeWindowActive()` |
| `0xb7b4d8b2` | `MutualChallengeWindowTooShort()` |
| `0x4209d367` | `MutualExhausted()` |
| `0x9f550c92` | `MutualIsTerminal()` |
| `0xb352c1e0` | `MutualLossPending()` |
| `0x1ec88ab2` | `MutualNotActive()` |
| `0x4555d8d1` | `MutualNotFound()` |
| `0xe6c99a1b` | `NoActiveCover()` |
| `0xbaca7843` | `NoMutualLossPending()` |
| `0xcc488837` | `NotMutualArbiter()` |
| `0x6c985651` | `NotMutualMember()` |
| `0xd0e1bab8` | `NumeraireMismatch()` |
| `0x52700180` | `PremiumRateDecreased()` |
| `0xcd706c87` | `PremiumStreamUnderfunded()` |
| `0x4f35b508` | `ReinitTooSoon()` |
| `0x5736e150` | `RewardRateOverflow()` |
| `0x72c36382` | `StreamDurationOutOfBounds()` |
| `0x26e9a535` | `TotalSharesOverflow()` |

### `ILinkedMutualPolicy`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x3a6ce73e` | `bindCover(uint256,uint256,uint64)` |
| `0xe5ada483` | `expireBinding(uint256)` |
| `0x3c555f09` | `fundStandby(uint256,uint64)` |
| `0x8eaf2363` | `getActiveNotionalSold(uint256)` |
| `0x26017819` | `getCoverBinding(uint256)` |

## ERC-COMMITMENTS-MESH — Mesh

### `IFanIn`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x485cc955` | `initialize(address,address)` |
| `0x207a9200` | `registerProvider(address,bytes32,bytes32,uint16,uint64)` |
| `0xe9dab6d0` | `releaseStake(bytes32,uint256)` |
| `0x6f37a2c9` | `stake(address,bytes32,uint256)` |
| `0x7ae2aa5a` | `totalStake(bytes32)` |

### `IFanOut`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x5d044b7e` | `claimRewards(bytes32,address)` |
| `0x132bb268` | `distributeRewards(bytes32,address,uint256)` |
| `0xc5799e4a` | `getLien(address,bytes32,address)` |
| `0x7a0f4072` | `getOutflows(address,bytes32)` |
| `0x03e044d8` | `getUserInfo(address,bytes32)` |
| `0x485cc955` | `initialize(address,address)` |
| `0x2b2528d6` | `releaseStake(address,bytes32,uint256)` |
| `0x1813b921` | `setOutflows(bytes32,(address,uint16,uint256)[])` |
| `0x8caa5230` | `stake(bytes32,uint256)` |

### `IMeshFactory`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x1a781193` | `deployFanIn(address,address)` |
| `0x4fc48f06` | `deployFanInAt(bytes32,address,address)` |
| `0xc1f1598a` | `deployFanOut(address,address)` |
| `0xadbcb26b` | `deployFanOutAt(bytes32,address,address)` |
| `0xc6c329e4` | `deployTokenWeighting(address,address)` |
| `0xd0345cdd` | `deployTokenWeightingAt(bytes32,address,address)` |
| `0x0b86a8b4` | `fanInImpl()` |
| `0x635269ec` | `fanOutImpl()` |
| `0x9524310e` | `predictFanInAddress(bytes32)` |
| `0xf91ac8d2` | `predictFanOutAddress(bytes32)` |
| `0xf649994b` | `predictTokenWeightingAddress(bytes32)` |
| `0xc0388a3c` | `tokenWeightingImpl()` |

#### Event topic0

| topic0 | Signature |
|---|---|
| `0xa3c11352e051b084be07acc41332880e964a23de663ad3898a935c8eb9c700a7` | `NodeDeployed(address,address,string)` |

### `ITokenWeighting`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x5d044b7e` | `claimRewards(bytes32,address)` |
| `0x9fd2f3f4` | `currentStake(address,bytes32)` |
| `0x7affea87` | `denomCount()` |
| `0x132bb268` | `distributeRewards(bytes32,address,uint256)` |
| `0x53976a26` | `getTotalPower()` |
| `0x4a1e9b9e` | `getTotalPowerAt(uint256)` |
| `0xbb4d4436` | `getVotingPower(address)` |
| `0xeaeded5f` | `getVotingPowerAt(address,uint256)` |
| `0x485cc955` | `initialize(address,address)` |
| `0xa9bef2a5` | `isDenomRetired(bytes32)` |
| `0x2b2528d6` | `releaseStake(address,bytes32,uint256)` |
| `0xd793d929` | `retireDenom(bytes32)` |
| `0x6f37a2c9` | `stake(address,bytes32,uint256)` |
| `0xd38bfff4` | `transferGovernance(address)` |
| `0x2c498007` | `updateWeight(bytes32,uint256)` |

#### Event topic0

| topic0 | Signature |
|---|---|
| `0x0c64496bc99089a65823738c57fecc391258e0abca7900c4cb5f3dcb24372102` | `DenomPurged(bytes32)` |
| `0x79c6036f8b39e8ed5a09019f4db65d916e4c6e2e0ca0809077785d013fda10ec` | `DenomRetired(bytes32,uint256)` |
| `0x5f56bee8cffbe9a78652a74a60705edede02af10b0bbb888ca44b79a0d42ce80` | `GovernanceTransferred(address,address)` |
| `0x3cd5ec01b1ae7cfec6ca1863e2cd6aa25d6d1702825803ff2b7cc95010fffdc2` | `Initialized(address,address)` |
| `0x0c5fca4c27bb4b6b140fc363a8b11afd1abafbe9f4feb99e523f48d2399a2e99` | `RewardsClaimed(address,bytes32,address,uint256)` |
| `0xf10c7eca064d79e5798376592d7cadf5c7c57ad09c22523bdd91dc7b7a64fdfd` | `RewardsDistributed(bytes32,address,uint256)` |
| `0xfc2d9b93b83e1232818f893e0419179caf3822f647b27552cf59828e44caf538` | `StakeReleased(address,bytes32,uint256)` |
| `0xb46febe4efbbb5c019390b465ed6683766acdecdef421175b285b18932c27e2c` | `Staked(address,bytes32,uint256)` |
| `0x028e3bc2e5361810dd993ff2bcf8d858f9c3081319bf3e7d3acc50b624ac784d` | `WeightUpdated(bytes32,uint256,uint256)` |

#### Error selectors

| Selector | Signature |
|---|---|
| `0x0dc149f0` | `AlreadyInitialized()` |
| `0x0ac03ea0` | `AlreadyRetired()` |
| `0xfe7002b4` | `DenomCapReached()` |
| `0xdbbd4a35` | `DenomIsRetired()` |
| `0xf1bc94d2` | `InsufficientStake()` |
| `0x54348f03` | `OnlyGovernance()` |
| `0xeb79da3b` | `OnlyProvider()` |
| `0xf32b8755` | `RewardTokenLimit()` |
| `0x662c52c0` | `RewardTooSmall()` |
| `0xdc66ffd9` | `UnregisteredDenom()` |
| `0x1f2a2005` | `ZeroAmount()` |
| `0x4ff06ca0` | `ZeroGovernance()` |
| `0x25a8b67e` | `ZeroTotalStake()` |
| `0x005e5eb3` | `ZeroWeightBps()` |

## ERC-COMMITMENTS-SERVICES — Operator Services

### `IOperatorRegistry`

#### Function selectors

| Selector | Signature |
|---|---|
| `0xe3fcf037` | `commitmentManager()` |
| `0x026e402b` | `delegate(address,uint256)` |
| `0xa7b0ff9f` | `delegateWithSig(address,address,uint256,uint256,uint256,bytes)` |
| `0xaff5edb1` | `deregister()` |
| `0x34468675` | `getAcceptancePolicy()` |
| `0x5865c60c` | `getOperator(address)` |
| `0x1a4a7c61` | `getOperatorCount()` |
| `0x2ee663b8` | `getOperatorMetadata(address)` |
| `0x3eb22c95` | `getOperatorSet()` |
| `0xc53a0292` | `increaseNonce()` |
| `0x6d70f7ae` | `isOperator(address)` |
| `0x67c1def9` | `isStrategyAllowed(address)` |
| `0xc8ded9e2` | `maxDelegationsPerOperator()` |
| `0xd775cb61` | `minOperatorStake()` |
| `0x11e3e9b3` | `onDelegationForfeited(uint256,uint256,uint256)` |
| `0x8bf9af4f` | `onDelegationReleased(uint256,uint256)` |
| `0x8c7405a0` | `operatorFanIn(address)` |
| `0xb5cdfa9c` | `operatorForCommitment(uint256)` |
| `0xf68b84f7` | `reconcile(uint256)` |
| `0xf207564e` | `register(uint256)` |
| `0xe9f45373` | `registerWithSig(address,uint256,uint256,uint256,bytes)` |
| `0xca15d3db` | `setMeshWiring(address,address)` |
| `0xfac9d381` | `setOperatorMetadata(string,bytes32)` |
| `0x56a13690` | `setStrategyAllowed(address,bool)` |
| `0xf990ccd7` | `sigNonces(address)` |
| `0x938bbb67` | `stakeDenom()` |
| `0xdf3d665f` | `sweepForfeitProceeds(address,uint256,address)` |
| `0x9a039718` | `tightenPolicy(uint16)` |
| `0x53c241a9` | `tokenWeighting()` |
| `0xa9666ace` | `trackedCommitmentCount()` |

#### Event topic0

| topic0 | Signature |
|---|---|
| `0xfbe72a196b568723d74002ae535674a0a90a515b6214517110886d626b04dd16` | `AcceptancePolicyTightened(uint16,uint16)` |
| `0x309ca083e74e3c0429759d9f435e557c24afc92d774ce7800051257548f3a41a` | `DelegationCreated(address,address,uint256,uint256)` |
| `0x93412d03a247d2f32f1d48b37682ea8015657650ae808cfe92087ee821b9366b` | `DelegationForfeited(address,address,uint256,uint256)` |
| `0x5fc718b93b69cdc1f6eaa224945c43d2fed38b347c1e2dec7224f03fa8170888` | `DelegationReleased(address,address,uint256,uint256)` |
| `0xc5bb2099531ead43de8d78c85a3c0b9e37125f06e85fed645293ac621034228d` | `ForfeitRecipientPending(address,uint256,uint256)` |
| `0x44e4593b24b930fec954b8faf7b405dd7d60250bda2b24f2ed47f585fa0d38c6` | `ForfeitRecipientSwept(address,address,uint256)` |
| `0x03f684200ae70f5d0fb94dc5819b42eb183c29d9df166bfdb777e78959d78ec7` | `MaxDelegationsPerOperatorUpdated(uint256,uint256)` |
| `0xb5657d8ef32a3157e386285cdc1cb660249f5a397be4e2f066001876b7fe0b1e` | `MeshWired(address,address)` |
| `0xf6eefd49a83d72df0cc9ddb5557cfa6a047393b8d4a85163a8cefe7aa490a30f` | `MinOperatorStakeUpdated(uint256,uint256)` |
| `0xfc69110dd11eb791755e4abd6b7d281bae236de95736d38a23782814be5e10db` | `NonceIncreased(address,uint256)` |
| `0xbb04adc59760b78a6dc21adb47a87a0a10bbfef3c56a6a2d1eac39ff2d091402` | `OperatorBelowMinStake(address,uint256,uint256)` |
| `0x6dd4ca66565fb3dee8076c654634c6c4ad949022d809d0394308617d6791218d` | `OperatorDeregistered(address)` |
| `0x1dcb8baca72aad6cc1cc9c707f6585754f8a287d386d3563d20c293416c5993d` | `OperatorFanInDeployed(address,address,bytes32)` |
| `0xa999aefed31c97e6504590dbba8f7166ca2fa7d8b5775da168afba82ad260232` | `OperatorMetadataUpdated(address,string,bytes32,uint64)` |
| `0x2d45a98f9905b134cf6865a4353130b6928e3bc644f9f98382d3a8c4dd3e7278` | `OperatorRegistered(address,uint256,uint256)` |
| `0x6d6b32867e11fd93560ef473cd0783f2cdada733078ebb1d21e473d8b444a1cd` | `StrategyAllowlistUpdated(address,bool)` |

#### Error selectors

| Selector | Signature |
|---|---|
| `0xfe7b7cca` | `ActiveDelegationsExist()` |
| `0x3a81d6fc` | `AlreadyRegistered()` |
| `0x69aa9522` | `CommitmentAlreadyDelegated()` |
| `0xe7584546` | `CommitmentClosed()` |
| `0x0906c21a` | `CommitmentNotTracked()` |
| `0xafa5a317` | `CommitmentStillOpen()` |
| `0x45be0a26` | `InsufficientStake(uint256,uint256)` |
| `0x756688fe` | `InvalidNonce()` |
| `0x8baa579f` | `InvalidSignature()` |
| `0x7935263f` | `MaxDelegationsExceeded(uint256,uint256)` |
| `0x32e8d125` | `MeshAlreadyWired()` |
| `0xd362e480` | `NotCommitmentOwner()` |
| `0xaba47339` | `NotRegistered()` |
| `0x1a8660cb` | `OperatorNotActive()` |
| `0x8d6f12a9` | `PenaltyExceedsMax()` |
| `0x94803a7c` | `PenaltyTooLow(uint16,uint16)` |
| `0x1f9e9b25` | `PolicyNotTightening(uint16,uint16)` |
| `0x241cfeb5` | `RegistryNotWired(address)` |
| `0x8e47e406` | `SameBlockToggle()` |
| `0x0819bdcd` | `SignatureExpired()` |
| `0xd34941f0` | `StrategiesNotAllowed()` |
| `0x8b8d204c` | `URITooLong()` |
| `0x5c427cd9` | `UnauthorizedCaller()` |
| `0xc42a4d25` | `WrongArbiter(address,address)` |
| `0xbc40a1c6` | `WrongCounterparty()` |
| `0x2d6ac127` | `WrongToken(address,address)` |
| `0xe09e5412` | `ZeroArbiter()` |
| `0x6507eb68` | `ZeroMeshAddress()` |
| `0x9d8db791` | `ZeroPayoutAddress()` |
| `0x442aad05` | `ZeroStrategy()` |
| `0xad1991f5` | `ZeroToken()` |

### `IOperatorServiceRegistry`

#### Function selectors

| Selector | Signature |
|---|---|
| `0xca5f69d7` | `enrollServiceOperator()` |
| `0xa2ce5fd1` | `getLatestOperatorSigningKey(address)` |
| `0xdabcbbb6` | `getOperatorSigningKeyAtBlock(address,uint32)` |
| `0xec7fbb31` | `operatorRegistered(address)` |
| `0x58c2225b` | `operatorRegistry()` |
| `0x84e038e2` | `setVotingPowerSource(address)` |
| `0x6dc7458d` | `updateOperatorSigningKey(address,bytes)` |
| `0xa7748a30` | `votingPowerSource()` |
| `0x4845b77b` | `withdrawServiceOperator(address)` |

#### Event topic0

| topic0 | Signature |
|---|---|
| `0x739254a9462c078e4156959e45a30a34977d1067c7f0568843ed70d438e4c9bf` | `MaxReferenceBlockAgeUpdated(uint96,uint96)` |
| `0x6dd4ca66565fb3dee8076c654634c6c4ad949022d809d0394308617d6791218d` | `OperatorDeregistered(address)` |
| `0x4d0eb1f4bac8744fd2be119845e23b3befc88094b42bcda1204c65694a00f9e5` | `OperatorRegistered(address)` |
| `0xc05080fd447442c3e67d448efd658261f295a7827b151cc246e1faa46c70e2be` | `OperatorSigningKeyUpdated(address,address,address)` |
| `0x99c5af1f811b150d39d592621f8f23f4df7e5664642f227684973847eb2888be` | `StakeThresholdUpdated(uint256)` |
| `0xdf0b542f723b7a3b71971a581414abc14ab527874b63d1be08be517eee70bad7` | `VotingPowerSourceUpdated(address,address)` |

#### Error selectors

| Selector | Signature |
|---|---|
| `0x3a81d6fc` | `AlreadyRegistered()` |
| `0xb5eba9f0` | `InvalidAdmin()` |
| `0x9eaabd59` | `InvalidOperatorRegistry()` |
| `0x81254030` | `InvalidSigningKey()` |
| `0xfbd040ca` | `InvalidSigningKeySignature()` |
| `0x796185db` | `InvalidVotingPowerSource()` |
| `0x3d738b2e` | `NotActiveOperator()` |
| `0x72941b80` | `NotAdminOrSelf()` |
| `0xaba47339` | `NotRegistered()` |
| `0x29f11e76` | `SigningKeyAlreadyAssigned()` |

### `IServiceHandler`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x4dda0b43` | `getServiceManager()` |
| `0xf969ff33` | `handleSignedEnvelope((bytes20,bytes12,bytes),(address[],bytes[],uint32))` |

### `IServiceManager`

#### Function selectors

| Selector | Signature |
|---|---|
| `0xac7cbfd9` | `getLatestOperatorForSigningKey(address)` |
| `0x98ec1ac9` | `getOperatorWeight(address)` |
| `0xcc922c6a` | `getServiceURI()` |
| `0xbef4c839` | `getStakeRegistry()` |
| `0x5f11301b` | `setServiceURI(string)` |
| `0xcd71589e` | `validate((bytes20,bytes12,bytes),(address[],bytes[],uint32))` |

#### Event topic0

| topic0 | Signature |
|---|---|
| `0xc33728fb6bc64ec1c5596c946e1406ccdfb7369404098c1d6a5f4a7a29c97b63` | `QuorumThresholdUpdated(uint256,uint256)` |
| `0xd2f056df94c31bdb3b4e16080f2ac6dbd4233c6001058d94afc3ad1242dff488` | `ServiceURIUpdated(string)` |

#### Error selectors

| Selector | Signature |
|---|---|
| `0x86b16091` | `InsufficientQuorum(uint256,uint256,uint256)` |
| `0x2f41f79b` | `InsufficientQuorumZero()` |
| `0xe121632f` | `InsufficientSignedStake()` |
| `0x947d5a84` | `InvalidLength()` |
| `0xcc0d6871` | `InvalidQuorumParameters()` |
| `0xe64f180f` | `InvalidReferenceBlock()` |
| `0x8baa579f` | `InvalidSignature()` |
| `0xd349279d` | `InvalidThresholdWeight()` |
| `0xff633a38` | `LengthMismatch()` |
| `0xba50f911` | `NotSorted()` |
| `0x3dda1739` | `SignerNotRegistered()` |
| `0x48ff4104` | `StaleReferenceBlock(uint32,uint96)` |
| `0x1f2a2005` | `ZeroAmount()` |

### `IVotingPowerSource`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x53976a26` | `getTotalPower()` |
| `0x4a1e9b9e` | `getTotalPowerAt(uint256)` |
| `0xbb4d4436` | `getVotingPower(address)` |
| `0xeaeded5f` | `getVotingPowerAt(address,uint256)` |

## ERC-COMMITMENTS-REWARDS — Merkle Rewards

### `ICommitmentsRewardsCoordinator`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x0c9cbf0e` | `claimed(address,address)` |
| `0x97ad1cce` | `depositRewards(address,uint256)` |
| `0x62a5af3b` | `freeze()` |
| `0x054f7d9c` | `frozen()` |
| `0xa607f34e` | `processClaim(bytes32,address,uint256,bytes32[])` |
| `0xd598d4c9` | `service()` |
| `0x9711715a` | `snapshot()` |
| `0x6a28f000` | `unfreeze()` |

#### Event topic0

| topic0 | Signature |
|---|---|
| `0xdbd84c86d66cc508ad40b9a3634190a70ef7f9a069c04c7120a4d2836bdc4800` | `ClaimsFrozenSet(address)` |
| `0x875fae2d3e640041d4de1a34cff58c85ee95cc863b76c9c1e6f8b4ccb096d5e0` | `ClaimsUnfrozen(address)` |
| `0x206d35928cbbeaa37364572e14b9b4b7bc93afacf7c0783095d3afa5801ac175` | `RewardsClaimed(bytes32,address,address,uint256,uint256)` |
| `0xd66544dd5ed3eb02982a905e9b45d8eecc72f6af1db4d34d43d4f774307eda51` | `RewardsDeposited(address,address,uint256)` |

#### Error selectors

| Selector | Signature |
|---|---|
| `0x5289653e` | `AlreadyFrozen()` |
| `0xf1e4190b` | `ClaimsFrozen()` |
| `0x19169b62` | `CumulativeRegression()` |
| `0x09bde339` | `InvalidProof()` |
| `0x00219cf1` | `NoOp()` |
| `0x8208cbe5` | `NotFrozen()` |
| `0xa8b00c9a` | `NotService()` |
| `0x332f684a` | `RootNotActive()` |
| `0xd92e233d` | `ZeroAddress()` |
| `0x1f2a2005` | `ZeroAmount()` |

### `IMerkleSnapshot`

#### Function selectors

| Selector | Signature |
|---|---|
| `0x797c6860` | `activateUpdater()` |
| `0x3a8c0786` | `activationDelay()` |
| `0x31c5c1aa` | `activeUpdater()` |
| `0x28afd4af` | `cancelStagedUpdater()` |
| `0xc3621f0a` | `disableRoot(bytes32)` |
| `0x5c36901c` | `isActive(bytes32)` |
| `0x88b06baa` | `minActivationDelay()` |
| `0xb4ff314b` | `pendingUpdater()` |
| `0x65c0240b` | `rootById(bytes32)` |
| `0xd598d4c9` | `service()` |
| `0x96b896eb` | `setActivationDelay(uint64)` |
| `0x83401c40` | `stageUpdater(address)` |
| `0xd33a28b2` | `submitRoot(bytes32)` |

#### Event topic0

| topic0 | Signature |
|---|---|
| `0x25de4a4e6df8250c1388db816d81bfd9e74b30813c55e6e1c768b1c5bc6a3039` | `ActivationDelayUpdated(uint64,uint64)` |
| `0x4dfe48ab658f2302f88168fb48cc916e6a821f156c32a90b3a67ebf0c89e0454` | `RootDisabled(bytes32)` |
| `0xb4336c6750237190875f13e2ba0a3efe5298afbaac118e1f9d7373d9f203737e` | `RootSubmitted(bytes32,uint64,uint64)` |
| `0xc918fd3d8fa8e2644ecb6932c4eb27e539e5d408d92a623f298c103811dcdd71` | `UpdaterActivated(address,address)` |
| `0x99a8bd7416969fe28d89c6aeff22f21cacd9ad26d1b4164e39641f1eea1410e8` | `UpdaterPending(address,uint64)` |
| `0xd2f512773da0d7aab70939113c1df2b04da53a10ed7ecab50c89191985c8da2f` | `UpdaterStageCancelled(address)` |

#### Error selectors

| Selector | Signature |
|---|---|
| `0x4f1fe399` | `ActivationDelayBelowFloor()` |
| `0xd5d0cac0` | `NoStagedUpdater()` |
| `0xa8b00c9a` | `NotService()` |
| `0x9a280f39` | `NotUpdater()` |
| `0x5ee0899e` | `RootAlreadyActive()` |
| `0x5e335740` | `RootAlreadyDisabled()` |
| `0x4da1448b` | `RootAlreadySubmitted()` |
| `0x3033b0ff` | `RootNotFound()` |
| `0x823da57c` | `StagedUpdaterAlreadyExists()` |
| `0xa2493b76` | `StagedUpdaterNotReady()` |
| `0xd92e233d` | `ZeroAddress()` |
| `0xb263ae73` | `ZeroRoot()` |

## Shared arbitration capability

### `IArbiter`

**ERC-165 interface id:** `0x6000eb97` (`type(IArbiter).interfaceId`)

#### Function selectors

| Selector | Signature |
|---|---|
| `0x0c9ff2c2` | `arbiterCapabilities()` |
| `0x8f63e962` | `arbiterMetadataURI()` |
| `0xe3fcf037` | `commitmentManager()` |
| `0x01ffc9a7` | `supportsInterface(bytes4)` |

