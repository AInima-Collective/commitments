#!/usr/bin/env bash
# Run Certora proofs fully locally against the open-source CertoraProver
# build — no CERTORAKEY, no cloud, no prover-minute budget.
#
# One-time setup (documented in verification/README.md §Certora-local):
#   ~/CertoraProver           git clone (submodules via https rewrite)
#   ~/certora-bin             gradle assemble output: emv.jar, certora_jars/,
#                             tac_optimizer (fried-egg cargo build)
#   ~/.local/jdk21            Temurin JDK 21 (arm64)
#   ~/.local/bin              z3 + cvc5 arm64 binaries, solc0.8.27 symlink
#   ~/.venvs/certora-local    python venv w/ scripts/certora_cli_requirements.txt
#
# Usage: verification/certora/certora-local.sh <conf> [extra certoraRun args...]
set -euo pipefail

# Prefer the restart-surviving /workspace/.fv-toolchain install (gitignored;
# $HOME is wiped on container restart — see README persistence warning), fall
# back to the original $HOME layout. Every path takes an env override.
FVT="/workspace/.fv-toolchain"
if [ -z "${PROVER_SRC:-}" ] && [ -d "$FVT/CertoraProver" ]; then PROVER_SRC="$FVT/CertoraProver"; fi
if [ -z "${CERTORA:-}" ] && [ -d "$FVT/certora-bin" ]; then CERTORA="$FVT/certora-bin"; fi
if [ -z "${JAVA_HOME:-}" ] && [ -d "$FVT/jdk21" ]; then JAVA_HOME="$FVT/jdk21"; fi
if [ -z "${CERTORA_PY:-}" ] && [ -x "$FVT/venv/bin/python" ]; then CERTORA_PY="$FVT/venv/bin/python"; fi

PROVER_SRC="${PROVER_SRC:-$HOME/CertoraProver}"
export CERTORA="${CERTORA:-$HOME/certora-bin}"
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk21}"
CERTORA_PY="${CERTORA_PY:-$HOME/.venvs/certora-local/bin/python}"
export PATH="$JAVA_HOME/bin:$CERTORA:$FVT/bin:$HOME/.local/bin:$PATH"

if [ ! -f "$CERTORA/emv.jar" ]; then
    echo "error: $CERTORA/emv.jar not found — build CertoraProver first (see verification/README.md)" >&2
    exit 1
fi

exec "$CERTORA_PY" "$PROVER_SRC/scripts/certoraRun.py" "$@"
