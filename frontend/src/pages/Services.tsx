import { useMemo } from "react";
import { useChainId } from "wagmi";
import { type Address } from "viem";
import { Card, EmptyState, EntityLogo, Notice, StatBlock, UsdAmount } from "../components/ui";
import { PageHeader, useServiceMeta } from "../components/protocol";
import { hostnameOf, twitterHandle } from "../lib/metadata";
import { chainName } from "../lib/chainName";
import { bigintToUsd } from "../lib/format";
import { getContractAddresses, getServiceRegistry, type ServiceDescriptor } from "../config/contracts";
import { useOperators } from "../hooks/useOperators";
import { useOperatorsIndexed } from "../hooks/useOperatorsIndexed";
import { useServiceOperators } from "../hooks/useServiceOperators";
import { useServiceMetadata } from "../hooks/useIndexerMetadata";
import { useServiceStakeSummary, type ServiceStakeDenom } from "../hooks/useServiceStakeSummary";
import { useAssetPrices } from "../hooks/useAssetPrices";

export default function Services() {
  const chainId = useChainId();
  const services = useMemo(() => getServiceRegistry(chainId), [chainId]);
  const { operatorRegistry: registryAddress } = getContractAddresses(chainId);

  // One operator query for the whole page — every service today shares the
  // single operator registry, so we fan it out to per-service rows below.
  const indexed = useOperatorsIndexed();
  const chain = useOperators({ registryAddress });
  const operators = indexed.isReady ? indexed.operators : chain.operators;
  const operatorAddresses = useMemo(() => operators.map((op) => op.address as Address), [operators]);

  const network = chainName(chainId);

  if (services.length === 0) {
    return (
      <div className="ds-page">
        <PageHeader title="Services" lead="Verifiable offchain services secured by commitments." />
        <EmptyState
          title={`No services on ${network}`}
          description="Deploy a service and it will appear here, or switch to a network that has services running."
        />
      </div>
    );
  }

  return (
    <div className="ds-page">
      <PageHeader eyebrow={`${network}`} title="Services" lead="Verifiable offchain services secured by commitments." />
      <div className="ds-stack ds-stack-3">
        {services.map((s) => (
          <ServiceListRow
            key={s.slug}
            service={s}
            operatorAddresses={operatorAddresses}
            totalOperators={operators.length}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceListRow({
  service,
  operatorAddresses,
  totalOperators,
}: {
  service: ServiceDescriptor;
  operatorAddresses: Address[];
  totalOperators: number;
}) {
  const { stakeRegistry } = service;
  const { serviceOperators, isLoading } = useServiceOperators({
    stakeRegistryAddress: stakeRegistry,
    operatorAddresses,
  });
  const meta = useServiceMetadata(stakeRegistry);

  // Per-row stake summary so the list matches the detail page's headline
  // metric (Total committed in USD) — operators scouting services compare
  // here, not on the detail.
  const stake = useServiceStakeSummary(stakeRegistry);
  const stakeSymbols = useMemo(
    () => Array.from(new Set(stake.denoms.map((d) => d.assetSymbol).filter((s): s is string => Boolean(s)))),
    [stake.denoms],
  );
  const { getPrice } = useAssetPrices({ symbols: stakeSymbols });

  const totalCommittedUsd = useMemo<bigint | null>(() => {
    if (stake.denoms.length === 0) return 0n;
    let acc = 0n;
    for (const denom of stake.denoms) {
      const usd = denomToUsd(denom, getPrice);
      if (usd === null) return null;
      acc += usd;
    }
    return acc;
  }, [stake.denoms, getPrice]);

  const serviceRegistered = serviceOperators.filter((w) => w.registeredInService).length;

  const {
    name: metaName,
    description: metaDescription,
    logoSrc,
    website,
    twitter,
  } = useServiceMeta(meta.content, service);

  // When the service isn't deployed on this network we render a non-anchor
  // <Card> instead of a navigable <a>. The Notice still explains why; the
  // card no longer pretends to navigate to a working detail page.
  const body = (
    <div className="ds-service-row-body">
      <header className="ds-service-row-header">
        <div className="ds-service-row-identity">
          <EntityLogo name={metaName} src={logoSrc ?? undefined} size="lg" />
          <div className="ds-stack ds-stack-2 ds-service-row-text">
            <div className="ds-stack ds-stack-1">
              <span className="ds-service-row-name">{metaName}</span>
              <span className="ds-service-row-lead">{metaDescription}</span>
            </div>
            {(website || twitter) && (
              <div className="ds-service-row-chips">
                {website && (
                  <span className="ds-token-chip" title="From off-chain metadata — verify before trusting">
                    <span aria-hidden>↗</span>
                    {hostnameOf(website)}
                    <span className="ds-sr-only"> (unverified link)</span>
                  </span>
                )}
                {twitter && (
                  <span className="ds-token-chip" title="From off-chain metadata — verify before trusting">
                    <span aria-hidden>↗</span>
                    {twitterHandle(twitter)}
                    <span className="ds-sr-only"> (unverified link)</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      {!stakeRegistry ? (
        <Notice tone="warn" size="sm">
          Not deployed on this network. Switch networks or check back later.
        </Notice>
      ) : (
        <div className="ds-service-row-stats">
          <StatBlock label="Total operators" value={String(totalOperators)} />
          <StatBlock label="Registered" value={isLoading ? "…" : String(serviceRegistered)} />
          <StatBlock
            label="Total committed"
            value={
              <UsdAmount
                amount={totalCommittedUsd}
                size="default"
                tone={totalCommittedUsd === null ? "unavailable" : "neutral"}
                compact
              />
            }
          />
        </div>
      )}
    </div>
  );

  if (!stakeRegistry) {
    return (
      <Card tone="neutral" density="regular" className="ds-service-row" aria-disabled>
        {body}
      </Card>
    );
  }

  return (
    <Card as="a" href={`/app/services/${service.slug}`} tone="neutral" density="regular" className="ds-service-row">
      {body}
    </Card>
  );
}

function denomToUsd(denom: ServiceStakeDenom, getPrice: ReturnType<typeof useAssetPrices>["getPrice"]): bigint | null {
  const symbol = denom.assetSymbol;
  const decimals = denom.assetDecimals;
  const amount = denom.totalAssets;
  if (!symbol || decimals === null || amount === null) return null;
  const price = getPrice(symbol);
  if (!price) return null;
  return bigintToUsd(amount, decimals, price.usd);
}
