import { useState } from 'react'
import { useChainId } from 'wagmi'
import { type Address, type Hex, zeroHash } from 'viem'
import { Input, Notice } from '../../ui'
import { commitmentManagerAbi, operatorRegistryAbi } from '../../../generated'
import { getContractAddresses } from '../../../config/contracts'
import { useDevWallet } from '../../../contexts/devWallet'
import { AdminActionPanel } from '../AdminActionPanel'
import { useAdminAction } from '../../../hooks/useAdminAction'
import { anvil } from '../../../config/anvil'


export function OperatorsTab() {
  const chainId = useChainId()
  const { operatorRegistry, commitmentManager } = getContractAddresses(chainId)

  if (!operatorRegistry) {
    return (
      <Notice tone="warn" title="Registry not configured">
        VITE_OPERATOR_REGISTRY_ADDRESS is unset. Run `just dev-up` to deploy + sync env.
      </Notice>
    )
  }

  return (
    <div className="ds-stack ds-stack-4">
      <RegisterPanel registry={operatorRegistry} />
      <DelegatePanel registry={operatorRegistry} />
      <DeregisterPanel registry={operatorRegistry} />
      <SetMetadataPanel registry={operatorRegistry} />
      <TightenPolicyPanel registry={operatorRegistry} />
      <SetMinStakePanel registry={operatorRegistry} />
      <SetMaxDelegationsPanel registry={operatorRegistry} />
      {commitmentManager ? (
        <SetOperatorRegistryPanel manager={commitmentManager} />
      ) : (
        <Notice tone="warn" size="sm">
          VITE_COMMITMENT_MANAGER_ADDRESS unset — manager admin actions disabled.
        </Notice>
      )}
    </div>
  )
}

function RegisterPanel({ registry }: { registry: Address }) {
  const action = useAdminAction()
  const [id, setId] = useState('1')

  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: registry,
        abi: operatorRegistryAbi,
        functionName: 'register',
        args: [BigInt(id)],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Register operator"
      description="Operator self-registers with a commitment they own as their stake bond. Caller becomes msg.sender; commitment must be theirs."
      submitLabel="Register"
      onSubmit={submit}
      disabled={!id}
      state={action.state}
    >
      <Input
        aria-label="commitment id"
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="commitment id"
        style={{ maxWidth: 220 }}
      />
    </AdminActionPanel>
  )
}

function DeregisterPanel({ registry }: { registry: Address }) {
  const action = useAdminAction()
  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: registry,
        abi: operatorRegistryAbi,
        functionName: 'deregister',
        args: [],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Deregister operator"
      description="Operator self-deregisters. Releases the underlying delegation; commitment continues until released or unbonded."
      submitLabel="Deregister"
      onSubmit={submit}
      disabled={false}
      state={action.state}
    />
  )
}

function DelegatePanel({ registry }: { registry: Address }) {
  const action = useAdminAction()
  const { actors } = useDevWallet()
  const [operator, setOperator] = useState(
    actors.find((a) => a.id === 'depositor-2')?.address ?? '',
  )
  const [id, setId] = useState('1')

  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: registry,
        abi: operatorRegistryAbi,
        functionName: 'delegate',
        args: [operator as Address, BigInt(id)],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Delegate to operator"
      description="Depositor delegates a commitment they own to a registered operator. Caller is the commitment delegator."
      submitLabel="Delegate"
      onSubmit={submit}
      disabled={!operator || !id}
      state={action.state}
    >
      <div className="ds-row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Input
          aria-label="operator address"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          placeholder="operator"
          style={{ minWidth: 320 }}
        />
        <Input
          aria-label="commitment id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="commitment id"
          style={{ maxWidth: 200 }}
        />
      </div>
    </AdminActionPanel>
  )
}

function SetMetadataPanel({ registry }: { registry: Address }) {
  const action = useAdminAction()
  const [uri, setUri] = useState('ipfs://operator-metadata')
  const [hash, setHash] = useState<string>(zeroHash)

  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: registry,
        abi: operatorRegistryAbi,
        functionName: 'setOperatorMetadata',
        args: [uri, hash as Hex],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Set operator metadata"
      description="Operator publishes a metadata URI + content hash. Caller must be a registered operator."
      submitLabel="Set metadata"
      onSubmit={submit}
      disabled={!uri}
      state={action.state}
    >
      <div className="ds-row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Input
          aria-label="metadata uri"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder="metadata URI"
          style={{ minWidth: 320 }}
        />
        <Input
          aria-label="content hash"
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder="content hash (bytes32)"
          style={{ minWidth: 360 }}
        />
      </div>
    </AdminActionPanel>
  )
}

function TightenPolicyPanel({ registry }: { registry: Address }) {
  const action = useAdminAction()
  const [floor, setFloor] = useState('500')

  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: registry,
        abi: operatorRegistryAbi,
        functionName: 'tightenPolicy',
        args: [Number(floor)],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Tighten acceptance policy"
      description="Admin raises the maxPenaltyBps floor required for new operator commitments. Monotonic — can only tighten."
      submitLabel="Tighten"
      onSubmit={submit}
      disabled={!floor}
      state={action.state}
    >
      <Input
        aria-label="newFloor (bps)"
        value={floor}
        onChange={(e) => setFloor(e.target.value)}
        placeholder="new floor"
        suffix="bps"
        style={{ maxWidth: 220 }}
      />
    </AdminActionPanel>
  )
}

function SetMinStakePanel({ registry }: { registry: Address }) {
  const action = useAdminAction()
  const [minStake, setMinStake] = useState('0')

  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: registry,
        abi: operatorRegistryAbi,
        functionName: 'setMinOperatorStake',
        args: [BigInt(minStake)],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Set min operator stake"
      description="Admin sets the minimum stake (in vault SHARES) required for register/delegate. 0 = no minimum."
      submitLabel="Set min stake"
      onSubmit={submit}
      disabled={false}
      state={action.state}
    >
      <Input
        aria-label="minStake"
        value={minStake}
        onChange={(e) => setMinStake(e.target.value)}
        placeholder="min stake (shares)"
        suffix="shares"
        style={{ maxWidth: 260 }}
      />
    </AdminActionPanel>
  )
}

function SetOperatorRegistryPanel({ manager }: { manager: Address }) {
  const action = useAdminAction()
  const { operatorRegistry } = getContractAddresses(anvil.id)
  const [registry, setRegistry] = useState<string>(operatorRegistry ?? '')

  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: manager,
        abi: commitmentManagerAbi,
        functionName: 'setOperatorRegistry',
        args: [registry as Address],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Manager.setOperatorRegistry"
      description="Admin only. Wires which OperatorRegistry the manager notifies on release/forfeit."
      submitLabel="Set registry"
      onSubmit={submit}
      disabled={!registry}
      state={action.state}
    >
      <Input
        aria-label="registry address"
        value={registry}
        onChange={(e) => setRegistry(e.target.value)}
        placeholder="registry address"
        style={{ minWidth: 360 }}
      />
    </AdminActionPanel>
  )
}

function SetMaxDelegationsPanel({ registry }: { registry: Address }) {
  const action = useAdminAction()
  const [max, setMax] = useState('64')

  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: registry,
        abi: operatorRegistryAbi,
        functionName: 'setMaxDelegationsPerOperator',
        args: [BigInt(max)],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Set max delegations per operator"
      description="Admin caps the number of separate commitments any one operator can hold delegated."
      submitLabel="Set max"
      onSubmit={submit}
      disabled={!max}
      state={action.state}
    >
      <Input
        aria-label="maxDelegations"
        value={max}
        onChange={(e) => setMax(e.target.value)}
        placeholder="max"
        style={{ maxWidth: 220 }}
      />
    </AdminActionPanel>
  )
}
