default:
    @just --list

# ---------------------------------------------------------------------------
# Foundry
# ---------------------------------------------------------------------------

build:
    forge build

test:
    forge test

# ---------------------------------------------------------------------------
# Formal verification (see verification/README.md)
# ---------------------------------------------------------------------------

# Bounded symbolic execution of verification/halmos/ harnesses (per-PR layer).
# Solver + build-out settings come from the repo-root halmos.toml.
fv-halmos:
    FOUNDRY_PROFILE=halmos halmos

# Local Certora validation: compiles the linked manager scene + typechecks the
# CVL specs. The full cloud proof needs CERTORAKEY in the environment.
fv-certora-check:
    for conf in verification/certora/confs/*.conf; do certoraRun "$conf" --compilation_steps_only; done

# Full Certora cloud proof run (consumes prover minutes; needs CERTORAKEY).
fv-certora:
    for conf in verification/certora/confs/*.conf; do certoraRun "$conf" --wait_for_results; done

# Fully local proof run via the open-source CertoraProver build (no key needed;
# setup in verification/README.md §Certora). Pass a conf path.
fv-certora-local conf:
    verification/certora/certora-local.sh {{conf}}

# Coverage-guided fuzz campaign reusing the conformance ManagerHandler.
# Pass seconds, e.g. `just fv-medusa 14400` for the nightly campaign's length.
fv-medusa timeout="120":
    FOUNDRY_PROFILE=medusa medusa fuzz --config verification/medusa/medusa.json --timeout {{timeout}}

# Regenerate Solidity reference docs from NatSpec.
# Output: docs/protocol/reference/contracts/<path>/<Name>.md (public, frontmattered).
docs-gen:
    forge doc --build
    node script/forge-doc-flatten.mjs

# Validate lifecycle metadata, links, literal repository paths, the standards
# manifest, public-reference coverage, and guide vocabulary.
docs-check:
    node script/check-docs.mjs

# Reject executable generic scale literals outside the canonical shared definitions
# and the explicitly documented domain-specific allowlist.
units-check:
    node script/check-unit-constants.mjs

# Regenerate the selector/topic0/interface-id appendix from the compiled ABIs.
# Run after any interface change (needs `forge build` output under out/).
selectors:
    node script/gen-selectors.mjs

# Deploy the protocol to a running Anvil node with the simulate script.
#
# --slow is required because Simulate.s.sol mutates state that depends on
# block.number advancing between txs (e.g. OpenZeppelin Checkpoints in
# TokenWeighting). Batched broadcast collapses those into a single block and
# under-estimates gas, causing mid-script reverts. --slow sends each tx in its
# own block so estimates match reality.
anvil-seed:
    # Pin the metadata FIRST. Simulate.s.sol is Solidity and cannot POST to
    # IPFS, and `metadataURI` is immutable once written, so the payloads have to
    # exist before the seed opens. Writes script/metadata-manifest.json, which
    # the script reads back. With no daemon this emits the catalogue's short
    # `data:` variants instead, so the seed still runs with Docker stopped.
    node script/pin-metadata.mjs
    forge script script/Simulate.s.sol \
        --rpc-url http://127.0.0.1:8545 \
        --broadcast \
        --slow \
        --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Drive the underwritten-agent-vault breach end to end (use-cases/agent-bonds.md):
# the agent's strategy loses 8% (punching through the 5% drawdown floor measured
# against the skim strategy's post-skim high-water mark), the shortfall below the
# floor is declared as a mutual loss on the cvaDAI coverage market, the unvetoed
# declaration executes after the mutual's 2-day challenge window (advanced on the
# LIVE anvil clock, because the window is a hard core floor that `vm.warp` inside
# a broadcast script cannot satisfy), the underwriters are marked down pro-rata
# via settleMembers, and the
# beneficiary sweep donates the settlement back into the vault — depositor NAV is
# restored to the floor on-chain, watchable in the UI.
# Run AFTER `just dev-up`. Idempotent: skips when the mutual already carries a
# loss declaration or an executed loss.
demo-agent-breach:
    #!/usr/bin/env bash
    set -euo pipefail
    env=frontend/.env.local
    rpc=http://127.0.0.1:8545
    admin_key=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
    admin=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    geten() { grep "^$1=" "$env" | cut -d= -f2; }
    vault=$(geten VITE_AGENT_VAULT_ADDRESS)
    strat=$(geten VITE_AGENT_STRATEGY_ADDRESS)
    arb=$(geten VITE_AGENT_MUTUAL_ARBITER_ADDRESS)
    ben=$(geten VITE_AGENT_VAULT_BENEFICIARY_ADDRESS)
    dai=$(geten VITE_DAI_TOKEN_ADDRESS)
    mgr=$(geten VITE_COMMITMENT_MANAGER_ADDRESS)
    reg=$(geten VITE_MUTUAL_REGISTRY_ADDRESS)
    if [ -z "$vault" ] || [ -z "$arb" ] || [ -z "$ben" ] || [ -z "$reg" ] || [ -z "$strat" ]; then
        echo "demo-agent-breach: missing agent-vault addresses in $env — run 'just dev-up' first" >&2
        exit 1
    fi
    # The cvaDAI coverage market = the LAST registered mutual (seeded after the three
    # cvUSDC mutuals).
    G=$(cast call --rpc-url "$rpc" "$reg" "allMutualIds()(uint256[])" | tr -d '[]' | tr ',' '\n' | sed 's/[^0-9]//g' | grep -v '^$' | tail -1)
    if [ -z "$G" ]; then echo "demo-agent-breach: no mutual registered" >&2; exit 1; fi
    echo "demo-agent-breach: vault=$vault mutualId=$G"
    # Idempotency: an arbiter claim already exists (proposer != 0) -> loss already driven.
    proposer=$(cast call --rpc-url "$rpc" "$arb" \
        "claims(uint256)(address,uint64,bool,uint256)" "$G" | head -1 | awk '{print $1}')
    if [ "$(echo "$proposer" | tr 'A-Z' 'a-z')" != "0x0000000000000000000000000000000000000000" ]; then
        echo "  mutual $G already has a loss claim ($proposer) — nothing to do (idempotent skip)"
        exit 0
    fi
    # One WHOLE cvaDAI share = 1e27 units (18-dec asset + the vault's 9-dec offset).
    nav1=$(cast call --rpc-url "$rpc" "$vault" "convertToAssets(uint256)(uint256)" 1000000000000000000000000000 | awk '{print $1}')
    # The drawdown floor: 95% of the skim strategy's post-skim high-water assets
    # (principal + chargedGains == totalAssets at the last fully-charged mark).
    principal=$(cast call --rpc-url "$rpc" "$strat" "principal()(uint256)" | awk '{print $1}')
    charged=$(cast call --rpc-url "$rpc" "$strat" "chargedGains()(uint256)" | awk '{print $1}')
    floor_assets=$(python3 -c "print(($principal + $charged) * 9500 // 10000)")
    # 1. The breach: the agent's strategy loses 8% — through the 5% floor.
    ta=$(cast call --rpc-url "$rpc" "$vault" "totalAssets()(uint256)" | awk '{print $1}')
    loss=$(python3 -c "print($ta * 8 // 100)")
    cast send --rpc-url "$rpc" --private-key "$admin_key" "$strat" "simulateLoss(uint256)" "$loss" > /dev/null
    echo "  strategy loss applied: $(python3 -c "print(f'{$loss/1e18:,.0f}')") DAI (8% of assets)"
    # 2. The declared loss = the shortfall below the floor, in cvaDAI shares.
    ta2=$(cast call --rpc-url "$rpc" "$vault" "totalAssets()(uint256)" | awk '{print $1}')
    shortfall=$(python3 -c "print(max($floor_assets - $ta2, 0))")
    if [ "$shortfall" = "0" ]; then echo "demo-agent-breach: no shortfall below the floor?" >&2; exit 1; fi
    loss_shares=$(cast call --rpc-url "$rpc" "$vault" "convertToShares(uint256)(uint256)" "$shortfall" | awk '{print $1}')
    # 3. Anyone declares: admin funds the 100-DAI declaration bond and proposes.
    bond=100000000000000000000
    cast send --rpc-url "$rpc" --private-key "$admin_key" "$dai" "mint(address,uint256)" "$admin" "$bond" > /dev/null
    cast send --rpc-url "$rpc" --private-key "$admin_key" "$dai" "approve(address,uint256)" "$arb" "$bond" > /dev/null
    cast send --rpc-url "$rpc" --private-key "$admin_key" "$arb" \
        "proposeLoss(uint256,uint256,bytes32,uint256)" "$G" "$loss_shares" "$(cast keccak "nav-drawdown-breach")" "$bond" > /dev/null
    echo "  loss declared: $(python3 -c "print(f'{$shortfall/1e18:,.0f}')") DAI below floor; 2-day challenge window open"
    # 4. Unvetoed: advance the LIVE clock past the mutual challenge window, execute,
    #    settle every underwriter (ids from MemberJoined logs — no indexer needed).
    cast rpc --rpc-url "$rpc" evm_increaseTime 172800 > /dev/null
    cast rpc --rpc-url "$rpc" evm_mine > /dev/null
    cast send --rpc-url "$rpc" --private-key "$admin_key" "$mgr" "executeMutualLoss(uint256)" "$G" > /dev/null
    # NB: cast logs' positional topic filter is unreliable here — filter mutualId
    # via jq on topics[1] instead.
    gtopic=$(printf '0x%064x' "$G")
    cids=$(cast logs --rpc-url "$rpc" --from-block 0 --address "$mgr" \
        'MemberJoined(uint256,uint256,address,uint128,uint256)' --json \
        | jq -r --arg g "$gtopic" '.[] | select(.topics[1] == $g) | .topics[2]' \
        | while read -r h; do cast to-dec "$h"; done | paste -sd, -)
    if [ -z "$cids" ]; then echo "demo-agent-breach: no underwriters found for mutual $G" >&2; exit 1; fi
    cast send --rpc-url "$rpc" --private-key "$admin_key" "$mgr" "settleMembers(uint256[])" "[$cids]" > /dev/null
    echo "  loss executed + underwriters settled (commitments $cids marked down)"
    # 5. Restitution: permissionless sweep, settled shares -> donation -> NAV back to the floor.
    cast send --rpc-url "$rpc" --private-key "$admin_key" "$ben" "sweep()" > /dev/null
    nav2=$(cast call --rpc-url "$rpc" "$vault" "convertToAssets(uint256)(uint256)" 1000000000000000000000000000 | awk '{print $1}')
    python3 -c "print(f'  NAV/share: {$nav1/1e18:.4f} -> {$nav2/1e18:.4f} DAI (settlement donated; floor = 95% of HWM)')"
    # 6. The honest proposer reclaims its declaration bond.
    cast send --rpc-url "$rpc" --private-key "$admin_key" "$arb" "reclaimBond(uint256)" "$G" > /dev/null
    echo "demo-agent-breach: done. See /app/marketplace/$G, /app/agents, and the cvaDAI vault page."

# ---------------------------------------------------------------------------
# Workspace (pnpm)
# ---------------------------------------------------------------------------

install:
    pnpm install

ws-test:
    pnpm test

ws-typecheck:
    pnpm -r --if-present typecheck

# ---------------------------------------------------------------------------
# Indexer
# ---------------------------------------------------------------------------

# Run the indexer in dev mode (pglite, port 65422). Requires contracts to be
# deployed via `just anvil-seed` first so `broadcast/` has addresses.
# The seed pins to the local node, so those CIDs are not necessarily
# retrievable from the public gateway the fetcher otherwise defaults to. Probe
# the conventional local gateway and trust it explicitly when it answers.
indexer-dev:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "${IPFS_GATEWAY:-}" ] && curl -sf -m 2 -o /dev/null http://127.0.0.1:8080/ipfs/bafkqaaa 2>/dev/null; then
        export IPFS_GATEWAY=http://127.0.0.1:8080/ipfs/
        echo "ipfs: local gateway detected, using trusted IPFS_GATEWAY=$IPFS_GATEWAY"
    fi
    pnpm --filter @commitments/indexer dev

indexer-typecheck:
    pnpm --filter @commitments/indexer typecheck

# Wipe the indexer's pglite database. Run after any schema change in
# `ponder.schema.ts` if your running indexer is showing stale data — Ponder's
# dev mode bumps an internal instance number on schema bumps, but doesn't
# clear the old instance's rows, so old runs can shadow new ones until the
# DB is dropped. Safe to run at any time; the next `just indexer-dev` will
# rebuild from scratch by replaying broadcast events.
indexer-reset:
    rm -rf indexer/.ponder/pglite
    @echo "indexer: pglite cleared — run 'just indexer-dev' to rebuild"

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

frontend-dev:
    pnpm --filter @commitments/frontend dev

frontend-build:
    pnpm --filter @commitments/frontend build

frontend-test:
    pnpm --filter @commitments/frontend test

# ---------------------------------------------------------------------------
# IPFS (optional — the dev loop works without it)
# ---------------------------------------------------------------------------

# Start a local Kubo node so metadata can be pinned as `ipfs://` instead of
# inlined into the URI. Without it, POST /metadata/pin falls back to a
# `data:application/json;base64,…` URI, which is self-contained but has to fit
# the whole document inside the contract's 512-byte URI cap (~360 bytes of JSON).
ipfs-up:
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose up -d ipfs
    echo "waiting for the gateway on :8080…"
    for _ in $(seq 1 30); do
        if curl -fsS -o /dev/null http://127.0.0.1:8080/ipfs/bafkqaaa 2>/dev/null; then break; fi
        sleep 1
    done
    echo ""
    echo "ipfs: ready. Export these before starting the indexer and frontend:"
    echo "  export IPFS_API_URL=http://127.0.0.1:5001"
    echo "  export IPFS_GATEWAY=http://127.0.0.1:8080/ipfs/"
    echo ""
    echo "IPFS_GATEWAY is trusted operator configuration for the indexer, and"
    echo "'just dev-up' copies it into frontend/.env.local as VITE_IPFS_GATEWAY."

ipfs-down:
    docker compose down ipfs

# ---------------------------------------------------------------------------
# Orchestrated dev
# ---------------------------------------------------------------------------

# One-shot: starts anvil in the background, waits for it to be ready, then
# deploys + seeds the full protocol. Skips the anvil start if :8545 is already
# bound, but always re-runs the deploy and seed. Logs go to
# /tmp/commitments-anvil.log, pid to /tmp/commitments-anvil.pid.
dev-up:
    #!/usr/bin/env bash
    set -euo pipefail
    rpc_ready() {
        curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
            --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
            http://127.0.0.1:8545
    }
    if rpc_ready; then
        echo "anvil: already running on :8545"
    else
        echo "anvil: starting (logs -> /tmp/commitments-anvil.log)"
        nohup anvil > /tmp/commitments-anvil.log 2>&1 &
        echo $! > /tmp/commitments-anvil.pid
        for i in $(seq 1 50); do
            if rpc_ready; then
                echo "anvil: ready (pid $(cat /tmp/commitments-anvil.pid))"
                break
            fi
            sleep 0.2
            if [ "$i" -eq 50 ]; then
                echo "anvil: failed to start — see /tmp/commitments-anvil.log" >&2
                exit 1
            fi
        done
    fi
    echo "seed: deploying + seeding protocol"
    just anvil-seed
    # Anvil stays in its default automine mode — every user tx (MetaMask, scripts)
    # mines a block instantly. Ponder's realtime sync picks it up via the newHeads
    # WebSocket subscription and runs handlers on unfinalized blocks immediately,
    # so the UI updates without waiting for finality.
    #
    # The one thing automine alone can't fix: Ponder's default finalityBlockCount
    # for unknown chains (anvil id 31337) is 30, so historical sync only covers
    # `latest - 30` and below. Realtime sync fills in newer blocks only when a NEW
    # block arrives. With nothing happening after the seed, the seed events would
    # sit unindexed until the first user tx triggered backfill. Mine 64 empty
    # blocks once to push the seed past the finality boundary so historical sync
    # picks it up on indexer startup.
    echo "finality: mining 64 empty blocks to backfill seed events"
    cast rpc --rpc-url http://127.0.0.1:8545 anvil_mine 0x40 > /dev/null
    # Switch from automine to interval mining (1 block per 2s) so governance
    # state transitions (Pending→Active, Active→Succeeded, etc.) advance
    # ambiently without needing every UI action to mine a fresh block.
    # User txs still mine within ~2s.
    echo "mining: interval mode (2s blocks) for ambient governance state transitions"
    # NB: evm_setIntervalMining takes SECONDS (it matches anvil's --block-time),
    # not milliseconds — 2000 here silently meant one block every ~33 minutes,
    # stalling every post-seed cast send until the next epoch tick.
    cast rpc --rpc-url http://127.0.0.1:8545 evm_setIntervalMining 2 > /dev/null
    echo "env: syncing frontend/.env.local with fresh deployment"
    node script/write-frontend-env.mjs

# Stop the background anvil started by `just dev-up`.
dev-down:
    #!/usr/bin/env bash
    if [ -f /tmp/commitments-anvil.pid ]; then
        pid=$(cat /tmp/commitments-anvil.pid)
        if kill "$pid" 2>/dev/null; then
            echo "anvil: stopped (pid $pid)"
        fi
        rm -f /tmp/commitments-anvil.pid
    else
        pid=$(lsof -ti tcp:8545 -sTCP:LISTEN 2>/dev/null || true)
        if [ -n "$pid" ] && kill $pid 2>/dev/null; then
            echo "anvil: stopped (pid $pid on :8545)"
        else
            echo "anvil: not running"
        fi
    fi

dev-guide:
    @echo "Dev stack:"
    @echo "  1. just dev-up        # anvil + deploy + seed"
    @echo "  2. just indexer-dev   # in a second terminal"
    @echo "  3. just frontend-dev  # in a third terminal"
    @echo "  (when done) just dev-down"
