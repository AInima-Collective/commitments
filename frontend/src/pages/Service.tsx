import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useChainId } from "wagmi";
import { type Address, zeroAddress } from "viem";
import { getContractAddresses, getServiceDescriptor } from "../config/contracts";
import { useOperators } from "../hooks/useOperators";
import { useOperatorsIndexed } from "../hooks/useOperatorsIndexed";
import { useRegistryPolicy } from "../hooks/useRegistryPolicy";
import { useTokenMeta } from "../hooks/useTokenMeta";
import { useServiceMetadata } from "../hooks/useIndexerMetadata";
import { useServiceStakeUsd } from "../hooks/useServiceStakeSummary";
import { useServiceOperators } from "../hooks/useServiceOperators";
import { EmptyState, EntityLogo, Tabs, UsdAmount, VaultHeader, type VaultHeaderStat } from "../components/ui";
import { PageHeader, ServiceStakeBreakdown } from "../components/protocol";
import { useServiceMeta } from "../hooks/useServiceMeta";
import { rewriteIpfsURI } from "../lib/ipfs";
import { hostnameOf, twitterHandle } from "../lib/metadata";
import { chainName } from "../lib/chainName";
import { OperatorList } from "../components/mesh/OperatorList";
import { ServiceDetailsPanel } from "../components/mesh/ServiceDetailsPanel";

type Tab = "operators" | "details";

export default function Service() {
  const chainId = useChainId();
  const { slug } = useParams<{ slug: string }>();
  const service = getServiceDescriptor(chainId, slug);
  const { operatorRegistry: registryAddress, commitmentManager } = getContractAddresses(chainId);
  const stakeRegistryAddress = service?.stakeRegistry;

  // Both hooks are *always* called; the chain branch's read is gated on
  // `enabled: !!registryAddress`, so the wasted RPC cost is one
  // `getOperatorSet()` call when the indexer wins.
  const indexed = useOperatorsIndexed();
  const chain = useOperators({ registryAddress });
  const { operators, isLoading } = indexed.isReady
    ? { operators: indexed.operators, isLoading: indexed.isLoading }
    : { operators: chain.operators, isLoading: indexed.isLoading || chain.isLoading };

  const operatorAddresses = operators.map((op) => op.address as Address);
  // Stakes are in the registry's required token; with none required, tokens can mix.
  const policy = useRegistryPolicy(registryAddress);
  const stakeToken =
    policy.requiredToken && policy.requiredToken !== zeroAddress ? policy.requiredToken : undefined;
  const stakeMeta = useTokenMeta(stakeToken);
  const { serviceOperators, isLoading: isLoadingService } = useServiceOperators({
    stakeRegistryAddress,
    operatorAddresses,
  });
  const meta = useServiceMetadata(stakeRegistryAddress);
  const { stake, usdAmountFor, totalUsd: totalCommittedUsd } = useServiceStakeUsd(stakeRegistryAddress);

  const hasService = !!stakeRegistryAddress;
  const [activeTab, setActiveTab] = useState<Tab>("operators");

  const totalOperators = operators.length;
  const activeOperators = operators.filter((op) => op.status === "ACTIVE").length;

  if (!service) {
    return (
      <div className="ds-page">
        <nav aria-label="Breadcrumb" className="ds-breadcrumbs">
          <Link to="/app/services" className="ds-breadcrumb">
            ← All services
          </Link>
        </nav>
        <PageHeader eyebrow="topology" title="Service not found" />
        <EmptyState
          title="Service not found"
          description={`No service registered under "${slug ?? ""}". Return to all services to browse what's available on this network.`}
        />
      </div>
    );
  }

  if (!registryAddress) {
    return (
      <div className="ds-page">
        <nav aria-label="Breadcrumb" className="ds-breadcrumbs">
          <Link to="/app/services" className="ds-breadcrumb">
            ← All services
          </Link>
        </nav>
        <PageHeader eyebrow="topology" title={service.name} />
        <EmptyState
          title="Service not available on this network"
          description="The infrastructure for this service has not been deployed here. Switch networks or check back later."
        />
      </div>
    );
  }

  const serviceRegisteredCount = serviceOperators.filter((w) => w.registeredInService).length;

  // Operator-first ordering: a service surface is most useful to operators
  // scouting capacity, so the hero stats lead with operator counts. Total
  // committed (USD) is the headline economic signal and gets `emphasis` so
  // it paints in display size — Vault's hero pattern.
  const headerStats: VaultHeaderStat[] = [
    { label: "Total operators", value: String(totalOperators) },
    { label: "Active", value: String(activeOperators) },
    ...(hasService ? [{ label: "Registered", value: isLoadingService ? "…" : String(serviceRegisteredCount) }] : []),
    ...(hasService
      ? [
          {
            label: "Total committed",
            // size="inline" defers font-sizing to the parent stat-value
            // rule. The `emphasis: true` on this stat already bumps that
            // rule to --text-2xl; keeping the UsdAmount size="display"
            // would double up the rule and not survive the @<=720px
            // 2-column collapse at 360px viewport without overflow.
            value: (
              <UsdAmount
                amount={totalCommittedUsd}
                size="inline"
                compact
              />
            ),
            emphasis: true,
          },
        ]
      : []),
  ];

  return (
    <div className="ds-page">
      <nav aria-label="Breadcrumb" className="ds-breadcrumbs">
        <Link to="/app/services" className="ds-breadcrumb">
          ← All services
        </Link>
      </nav>

      <ServiceHero service={service} meta={meta.content} chainId={chainId} stats={headerStats} />

      {hasService && stakeRegistryAddress && (
        <section className="ds-stack ds-stack-3" aria-label="Committed stake by vault" aria-busy={stake.isLoading}>
          <header className="ds-section-header">
            <h2 className="ds-section-title">Committed stake</h2>
            <span className="ds-section-eyebrow">
              {stake.denoms.length === 0
                ? "no stake committed yet"
                : `${stake.operatorCount} operator${stake.operatorCount === 1 ? "" : "s"} staking via ${stake.denoms.length} vault${stake.denoms.length === 1 ? "" : "s"}`}
            </span>
          </header>
          <ServiceStakeBreakdown
            denoms={stake.denoms}
            usdAmountFor={usdAmountFor}
            isLoading={stake.isLoading}
            emptyHint={
              stake.indexerOffline
                ? "Stake data is temporarily unavailable. Refresh in a minute."
                : "No stake committed to this service yet."
            }
          />
        </section>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <Tabs.List aria-label="Service views">
          <Tabs.Trigger value="operators">operators</Tabs.Trigger>
          <Tabs.Trigger value="details">details</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Panel value="operators" className="ds-stack ds-stack-3" aria-label="Operators">
          <header className="ds-section-header">
            <h2 className="ds-section-title">Operators</h2>
            <span className="ds-section-eyebrow">
              {totalOperators} registered · {activeOperators} active
            </span>
          </header>
          <OperatorList
            operators={operators}
            isLoading={isLoading || policy.isLoading || (!!stakeToken && stakeMeta.isLoading)}
            serviceOperators={hasService ? serviceOperators : undefined}
            stakeDecimals={stakeToken ? stakeMeta.decimals : undefined}
          />
        </Tabs.Panel>

        <Tabs.Panel value="details" className="ds-stack ds-stack-3" aria-label="Details">
          <header className="ds-section-header">
            <div className="ds-stack ds-stack-1">
              <h2 className="ds-section-title">Details</h2>
              <span className="ds-section-eyebrow">contracts, policy, and parameters for this service</span>
            </div>
          </header>
          <ServiceDetailsPanel
            registryAddress={registryAddress}
            stakeRegistryAddress={stakeRegistryAddress}
            commitmentManager={commitmentManager}
          />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

type ServiceLike = { name: string; description: string };

function ServiceHero({
  service,
  meta,
  chainId,
  stats,
}: {
  service: ServiceLike;
  meta: Record<string, unknown> | null;
  chainId: number | undefined;
  stats: VaultHeaderStat[];
}) {
  const { name: metaName, description: metaDescription, logoSrc, website, twitter } = useServiceMeta(meta, service);
  const websiteHref = website ? rewriteIpfsURI(website) : null;
  const twitterHref = twitter ? rewriteIpfsURI(twitter) : null;
  // Compose website + twitter as token chips so the meta line picks up the
  // VaultHeader's existing meta typography (xs uppercase mono) and gives the
  // links real surface presence rather than reading as inline text.
  const metaLinks = (websiteHref || twitterHref) && (
    <>
      {websiteHref && (
        <a className="ds-token-chip ds-service-hero-chip" href={websiteHref} target="_blank" rel="noopener noreferrer">
          <span aria-hidden>↗</span>
          {hostnameOf(websiteHref)}
          <span className="ds-sr-only"> (website for {metaName})</span>
        </a>
      )}
      {twitterHref && (
        <a className="ds-token-chip ds-service-hero-chip" href={twitterHref} target="_blank" rel="noopener noreferrer">
          <span aria-hidden>↗</span>
          {twitterHandle(twitterHref)}
          <span className="ds-sr-only"> (Twitter for {metaName})</span>
        </a>
      )}
    </>
  );
  return (
    <VaultHeader
      accent="accent"
      icon={<EntityLogo name={metaName} src={logoSrc ?? undefined} size="xl" />}
      eyebrow={`SERVICE · ${chainName(chainId).toUpperCase()}`}
      title={metaName}
      subtitle={metaDescription}
      meta={metaLinks}
      stats={stats}
    />
  );
}
