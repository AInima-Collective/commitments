# Verification — how to run every layer

Property catalog: `PROPERTIES.md`. Layers:

The manager proof scene targets `src/core/manager/CommitmentManager.sol`, its
Core libraries under `src/core/manager/libraries/`, and the Agreement/Mutual
delegatecall libraries under `src/extensions/`. The periphery scenes target the
final Mesh, Rewards, Services, and Vault paths recorded in the harness imports
and Certora `files` lists.

| Layer | Tool | Pinned version | Cadence |
|---|---|---|---|
| Foundry invariants | forge (exists, `test/manager/conformance/`) | foundry 1.7.x | every PR |
| Medusa | crytic/medusa | **1.5.1** | nightly |
| Halmos | a16z/halmos | **0.3.3** | every PR |
| Certora | certora-cli | **8.16.2** | on covered-contract change |
| hevm | (situational, equivalence on refactors) | — | on refactor |

## Install (linux-arm64 notes included — this repo's dev container is aarch64)

```bash
# Halmos 0.3.3 — the yices-solver dep has no linux-arm64 wheel, so install
# without deps and use z3 (or bitwuzla) as the solver:
uv venv ~/.venvs/halmos --python 3.12
uv pip install --python ~/.venvs/halmos 'sortedcontainers>=2.4.0' 'toml>=0.10.2' \
  'z3-solver==4.12.6.0' 'eth_hash[pysha3]>=0.7.0' 'rich>=14.0.0,<14.1.0' \
  'xxhash>=3.5.0' 'psutil>=6.1.0' 'requests>=2.32.3' 'python-dotenv>=1.1.0'
uv pip install --python ~/.venvs/halmos --no-deps 'halmos==0.3.3'
ln -sf ~/.venvs/halmos/bin/halmos ~/.local/bin/halmos
# (on x86-64: plain `uv tool install halmos==0.3.3` works and yices is the default solver)

# Certora CLI (cloud prover; local typecheck needs Java 19+)
uv tool install certora-cli==8.16.2

# Medusa — no linux-arm64 release binary; build from source:
GOBIN=~/.local/bin go install github.com/crytic/medusa@v1.5.1
uv tool install crytic-compile   # medusa's compilation driver

# solc for certoraRun: reuse foundry's managed binary
ln -sf ~/.local/share/svm/0.8.27/solc-0.8.27 ~/.local/bin/solc0.8.27
```

## Run

### Halmos (per PR)

```bash
FOUNDRY_PROFILE=halmos halmos
```

Options live in the repo-root `halmos.toml`: the solver is pinned to z3 (see
install notes) and `forge-build-out` points at the profile's isolated
`out-halmos/` dir — halmos enumerates every artifact in its build dir, and
sharing the default `out/` leaks the Foundry-only conformance invariant suite
into that scan, which crashes halmos 0.3.3's invariant-target pass.

The `halmos` foundry profile points `test` at `verification/halmos/` and
statically links the manager's five external DELEGATECALL libraries at fixed
addresses (halmos cannot link/deploy libraries itself). Every harness inherits
`HalmosBase` and must call `_etchManagerLibs()` first in `setUp` — it
CREATE-deploys each library and etches its runtime at the pinned address
(`vm.getDeployedCode` is unsupported by halmos; `type(Lib).creationCode` is
the workaround). Keep the address list in `HalmosBase.sol` in sync with
`foundry.toml [profile.halmos] libraries`.

### Certora (on change to covered contracts)

```bash
# local compile + CVL typecheck (no key needed):
certoraRun verification/certora/confs/ManagerSmoke.conf --compilation_steps_only

# FULLY LOCAL proof run via the open-source CertoraProver build (no key,
# no cloud, no prover-minute budget):
verification/certora/certora-local.sh verification/certora/confs/ManagerSmoke.conf

# cloud proof (needs CERTORAKEY in env; free tier = 2,000 CPU-min/month):
certoraRun verification/certora/confs/ManagerSmoke.conf
```

**Local prover setup** (one-time; Certora open-sourced the Prover in 2025 —
github.com/Certora/CertoraProver):

```bash
git config --global url."https://github.com/".insteadOf "git@github.com:"  # submodules use ssh urls
git clone https://github.com/Certora/CertoraProver.git ~/CertoraProver
cd ~/CertoraProver && git submodule update --init --recursive
# deps: Temurin JDK 21 → ~/.local/jdk21; z3 + cvc5 arm64 release binaries →
# ~/.local/bin; rust toolchain; python venv:
uv venv ~/.venvs/certora-local --python 3.12
uv pip install --python ~/.venvs/certora-local -r ~/CertoraProver/scripts/certora_cli_requirements.txt
# build (≈6 min on 8 cores; ~2GB):
JAVA_HOME=~/.local/jdk21 PATH=~/.local/jdk21/bin:$PATH CERTORA=~/certora-bin ./gradlew assemble
(cd fried-egg && cargo build --release && cp target/release/tac_optimizer ~/certora-bin/)
ln -sfn ~/certora-bin/certora_jars ~/CertoraProver/certora_jars  # local typechecker lookup
# the prover's cleanup thread shells out to `killall` (absent in this container):
printf '#!/bin/sh\nexec pkill -x "$@"\n' > ~/.local/bin/killall && chmod +x ~/.local/bin/killall
```

`certora-local.sh` (this directory) wires CERTORA/JAVA_HOME/PATH and invokes
the repo's `certoraRun.py`; local mode engages automatically when
`$CERTORA/emv.jar` exists. Reports land in `.certora_internal/<run>/Reports/`.
Memory note: the container has ~11GB — stop gradle daemons before proving
(`pkill -f GradleDaemon` — but never from a shell whose own command line
contains that string; pkill -f matches it and self-terminates) and run one
conf at a time.

**Persistence warning**: in this dev container `$HOME` does NOT survive a
container restart — a restart wipes `~/CertoraProver`, `~/certora-bin`,
`~/.local/jdk21`, the venvs and solver binaries. Only `/workspace` persists, so the canonical install target is
the gitignored `/workspace/.fv-toolchain/` — `certora-local.sh` auto-detects
it (env overrides `PROVER_SRC`/`CERTORA`/`JAVA_HOME`/`CERTORA_PY` still win).
`verification/certora/fv-toolchain-rebuild.sh` (canonical, version-controlled
copy) automates the whole setup: it polls bandwidth (the big downloads need a
real connection), then runs every step above idempotently (`markers/*.done`
skip completed steps; `READY` appears at the end). Detach it with
`nohup verification/certora/fv-toolchain-rebuild.sh >> /workspace/.fv-toolchain/rebuild.log 2>&1 &`.

Known-benign noise: "Encountered an exception generating autofinder …
Stack too deep" — the prover falls back to un-instrumented sources and only
loses internal-variable visibility in counterexample traces.

### Medusa (nightly)

```bash
FOUNDRY_PROFILE=medusa medusa fuzz --config verification/medusa/medusa.json --timeout 3600
```

Config has `timeout: 0` / `testLimit: 0` (unbounded) — always pass `--timeout`
seconds on the CLI. The corpus persists in `verification/medusa/corpus/`
(gitignored; cached in CI). The harness reuses the conformance
`ManagerHandler` verbatim — extend the handler, not the harness, when adding
operations.

**P3-PARK (Wave 6, gas-precise "park, don't block").** `medusa/AdversarialStrategies.sol`
holds a mode-switchable hostile strategy (revert / gas-burn / return-bomb /
fail-N-then-succeed); Wave 6 of `MedusaManagerHarness.sol` binds it to
commitments, drives release/forfeit/finalize over them, and calls
`sweepFailedHook`. The `property_park_*` methods assert the lifecycle
transition always lands, the parked marker is well-formed (closed +
residual-free), and a sweep re-drives — with `property_partition_inv1`
surviving the whole flow. This is the ONE property Certora/Halmos can't own
(they abstract the 500k hook gas cap), so it lives here with real gas. Reachability
of the adversarial park path was confirmed with a temporary `property_REACH_probe`
that fails once a parked closure is recorded (Medusa hit it in <10s across all 10
workers; the shrunk witness is `deposit → setAdversaryMode(Revert) →
createAdversarialCommitment → releaseAdversarial`, trace shows `StrategyHookFailed`
+ `CommitmentReleased` co-emitted); the probe was then removed.

## Keeping specs in sync

Specs version with the code (Morpho/OZ pattern). If you change a contract
listed in any `certora/confs/*.conf` or imported by a `halmos/` harness, CI
runs the corresponding layer; a red rule blocks merge. Found a violation?
Bug-capture workflow: minimal `// FV-FINDING` repro test +
`formal-verification` GitHub issue + keep the rule failing (expected-fail,
linked issue) until the fix PR flips it green.
