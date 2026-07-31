#!/usr/bin/env bash
# Self-driving FV-toolchain rebuild. Designed for flaky/slow links: every
# download step either resumes partial progress (curl -C -) or retries
# patiently (git/gradle/cargo make incremental progress via their own
# caches). Installs under /workspace/.fv-toolchain, which survives container
# restarts — $HOME does not. Idempotent: each step drops a markers/*.done
# file and is skipped on rerun, so relaunch freely after failure or restart.
# Detach with:
#   nohup verification/certora/fv-toolchain-rebuild.sh >> /workspace/.fv-toolchain/rebuild.log 2>&1 &
set -uo pipefail

T=/workspace/.fv-toolchain
mkdir -p "$T/bin" "$T/markers"
ts() { date -u '+%Y-%m-%d %H:%M:%S'; }
say() { echo "[$(ts)] $*"; }
done_f() { [ -f "$T/markers/$1.done" ]; }
mark() { touch "$T/markers/$1.done"; say "step $1 DONE"; }

# fetch <url> <dest> — resumable download; loops until curl reports complete.
# curl -C - picks up where the last attempt died, so a trickle link still
# converges. Capped at 200 attempts (~worst case a weekend, not forever).
fetch() {
    local url=$1 dest=$2 i
    for i in $(seq 1 200); do
        curl -sL -C - --max-time 3600 --retry 3 "$url" -o "$dest" && return 0
        say "fetch attempt $i incomplete ($(stat -c%s "$dest" 2>/dev/null || echo 0) bytes so far): $url"
        sleep 60
    done
    return 1
}

# patient <n> <sleep> <cmd...> — retry with a pause; for tools with their own
# incremental caches (git objects aren't resumable per-attempt, but gradle and
# cargo both keep per-artifact caches across reruns).
patient() {
    local n=$1 pause=$2; shift 2
    local i
    for i in $(seq 1 "$n"); do "$@" && return 0; say "attempt $i failed: $1"; sleep "$pause"; done
    return 1
}

# --- 1. JDK 21 (Temurin, aarch64) ---
if ! done_f jdk; then
    # pin a concrete release asset: the adoptium "latest" API endpoint redirects
    # to a signed URL that changes per call, which breaks -C - resume.
    JDK_URL="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.7%2B6/OpenJDK21U-jdk_aarch64_linux_hotspot_21.0.7_6.tar.gz"
    fetch "$JDK_URL" "$T/jdk21.tar.gz" || exit 1
    rm -rf "$T/jdk21"; mkdir -p "$T/jdk21"
    tar xzf "$T/jdk21.tar.gz" -C "$T/jdk21" --strip-components=1 || { say "jdk tarball corrupt — deleting for refetch"; rm -f "$T/jdk21.tar.gz"; exit 1; }
    rm -f "$T/jdk21.tar.gz"
    "$T/jdk21/bin/java" -version || exit 1
    mark jdk
fi

# --- 2. solvers: z3 + cvc5 (arm64 static) ---
if ! done_f solvers; then
    fetch "https://github.com/Z3Prover/z3/releases/download/z3-4.13.4/z3-4.13.4-arm64-glibc-2.34.zip" "$T/z3.zip" || exit 1
    (cd "$T" && unzip -oq z3.zip && cp z3-*/bin/z3 bin/z3 && chmod +x bin/z3 && rm -rf z3.zip z3-*) \
        || { say "z3 zip corrupt — deleting for refetch"; rm -f "$T/z3.zip"; exit 1; }
    "$T/bin/z3" --version || exit 1
    fetch "https://github.com/cvc5/cvc5/releases/download/cvc5-1.2.1/cvc5-Linux-arm64-static.zip" "$T/cvc5.zip" || exit 1
    (cd "$T" && unzip -oq cvc5.zip && find . -maxdepth 3 -name cvc5 -type f -path "*bin*" \
        -exec cp {} bin/cvc5 \; && chmod +x bin/cvc5 && rm -rf cvc5.zip cvc5-Linux*) \
        || { say "cvc5 zip corrupt — deleting for refetch"; rm -f "$T/cvc5.zip"; exit 1; }
    "$T/bin/cvc5" --version | head -1 || exit 1
    mark solvers
fi

# --- 3. CertoraProver shallow clone + submodules (not resumable per-attempt;
#        just very patient) ---
if ! done_f clone; then
    git config --global url."https://github.com/".insteadOf "git@github.com:"
    clone_once() { rm -rf "$T/CertoraProver"; git clone --depth 1 --quiet https://github.com/Certora/CertoraProver.git "$T/CertoraProver"; }
    patient 50 300 clone_once || exit 1
    submod_once() { (cd "$T/CertoraProver" && git submodule update --init --recursive --depth 1 --quiet); }
    patient 50 300 submod_once || exit 1   # submodule fetch IS incremental across reruns
    mark clone
fi

# --- 4. solc 0.8.27 via foundry svm (forge build re-fetches it) ---
if ! done_f solc; then
    build_once() { (cd /workspace && forge build >/dev/null 2>&1); }
    patient 30 120 build_once || exit 1
    cp "$HOME/.local/share/svm/0.8.27/solc-0.8.27" "$T/bin/solc0.8.27" || exit 1
    chmod +x "$T/bin/solc0.8.27"
    mkdir -p "$HOME/.local/bin" && ln -sf "$T/bin/solc0.8.27" "$HOME/.local/bin/solc0.8.27"
    mark solc
fi

# --- 5. python venv (uv caches wheels across reruns) ---
if ! done_f venv; then
    patient 10 60 uv venv "$T/venv" --python 3.12 || exit 1
    pipinst() { uv pip install --python "$T/venv" -r "$T/CertoraProver/scripts/certora_cli_requirements.txt"; }
    patient 30 120 pipinst || exit 1
    mark venv
fi

# --- 6. gradle assemble (--no-daemon: no lingering 5GB daemons; gradle's
#        dependency cache makes each rerun strictly incremental) ---
if ! done_f gradle; then
    mkdir -p "$T/certora-bin"
    assemble_once() { (cd "$T/CertoraProver" && env JAVA_HOME="$T/jdk21" PATH="$T/jdk21/bin:$PATH" \
        CERTORA="$T/certora-bin" ./gradlew assemble --no-daemon); }
    patient 20 300 assemble_once || exit 1
    [ -f "$T/certora-bin/emv.jar" ] || { say "emv.jar missing after assemble"; exit 1; }
    ln -sfn "$T/certora-bin/certora_jars" "$T/CertoraProver/certora_jars"
    mark gradle
fi

# --- 7. fried-egg tac_optimizer (cargo registry cache is incremental) ---
if ! done_f friedegg; then
    friedegg_once() { (cd "$T/CertoraProver/fried-egg" && cargo build --release \
        && cp target/release/tac_optimizer "$T/certora-bin/"); }
    patient 20 300 friedegg_once || exit 1
    mark friedegg
fi

# --- 8. killall shim (prover cleanup thread shells out to it) ---
if ! done_f shims; then
    printf '#!/bin/sh\nexec pkill -x "$@"\n' > "$T/bin/killall" && chmod +x "$T/bin/killall"
    mkdir -p "$HOME/.local/bin"
    printf '#!/bin/sh\nexec pkill -x "$@"\n' > "$HOME/.local/bin/killall" && chmod +x "$HOME/.local/bin/killall"
    mark shims
fi

say "ALL DONE — toolchain ready. Run: verification/certora/certora-local.sh <conf>"
touch "$T/READY"
