#!/usr/bin/env node

/**
 * Capture and compare the protocol compatibility surface emitted by Foundry.
 *
 * Snapshot prerequisites:
 *   forge build --extra-output storageLayout
 *
 * Examples:
 *   node script/compat-snapshot.mjs snapshot \
 *     --root . --output /tmp/baseline.json --revision "$(git rev-parse HEAD)"
 *   node script/compat-snapshot.mjs compare \
 *     --baseline /tmp/baseline.json --candidate /tmp/candidate.json
 *
 * Snapshots intentionally key project-owned artifacts by contract/interface
 * name rather than fully-qualified source name. This makes a source-path-only
 * migration comparable while still rejecting duplicate names.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const SNAPSHOT_VERSION = 1;
const PROTECTED_CONTRACT_FIELDS = [
  "abi",
  "methodIdentifiers",
  "eventTopics",
  "errorSelectors",
  "storageLayout",
  "creationCode.normalizedHash",
  "creationCode.size",
  "runtimeCode.normalizedHash",
  "runtimeCode.size",
  "creationLinks",
  "runtimeLinks",
  "immutableReferences",
  "compilerSettings",
];

function usage(message) {
  if (message) console.error(message);
  console.error(
    "usage:\n" +
      "  compat-snapshot.mjs snapshot --root DIR --output FILE [--artifacts DIR] [--revision SHA]\n" +
      "  compat-snapshot.mjs compare --baseline FILE --candidate FILE [--output FILE]",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const command = argv.shift();
  if (!command || !["snapshot", "compare"].includes(command)) usage();
  const options = {};
  while (argv.length > 0) {
    const option = argv.shift();
    if (!option.startsWith("--") || argv.length === 0) usage(`invalid option: ${option}`);
    options[option.slice(2)] = argv.shift();
  }
  return { command, options };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function walk(directory) {
  const files = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function canonicalType(parameter) {
  if (!parameter.type.startsWith("tuple")) return parameter.type;
  const suffix = parameter.type.slice("tuple".length);
  return `(${(parameter.components ?? []).map(canonicalType).join(",")})${suffix}`;
}

function abiSignature(item) {
  if (!["function", "event", "error"].includes(item.type)) return item.type;
  return `${item.name}(${(item.inputs ?? []).map(canonicalType).join(",")})`;
}

const keccakCache = new Map();
function keccak(signature) {
  if (!keccakCache.has(signature)) {
    const digest = execFileSync("cast", ["keccak", signature], { encoding: "utf8" }).trim();
    keccakCache.set(signature, digest);
  }
  return keccakCache.get(signature);
}

function normalizeAbi(abi) {
  return abi
    .map(stable)
    .sort((left, right) => {
      const leftKey = `${left.type}:${abiSignature(left)}:${stableJson(left)}`;
      const rightKey = `${right.type}:${abiSignature(right)}:${stableJson(right)}`;
      return leftKey.localeCompare(rightKey);
    });
}

function selectors(abi, type, length) {
  return Object.fromEntries(
    abi
      .filter((item) => item.type === type)
      .map((item) => {
        const signature = abiSignature(item);
        return [signature, keccak(signature).slice(0, length)];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function stripMetadata(object) {
  if (!object || object === "0x") return object ?? "0x";
  const prefix = object.startsWith("0x") ? "0x" : "";
  const body = object.slice(prefix.length);
  if (body.length < 4 || !/^[0-9a-fA-F]{4}$/.test(body.slice(-4))) return object;
  const metadataBytes = Number.parseInt(body.slice(-4), 16) + 2;
  const metadataCharacters = metadataBytes * 2;
  if (metadataCharacters > body.length) return object;
  return prefix + body.slice(0, -metadataCharacters);
}

function normalizeEmbeddedMetadata(object) {
  // Factories that use `type(Contract).creationCode` contain the child's CBOR
  // metadata inside their own semantic bytecode. Keep offsets and sizes stable
  // while removing only the path-sensitive IPFS digest from every embedded
  // Solidity metadata trailer.
  return object.replace(
    /a2646970667358221220[0-9a-fA-F]{64}64736f6c6343[0-9a-fA-F]{6}0033/g,
    (metadata) => "0".repeat(metadata.length),
  );
}

function flattenLinks(linkReferences) {
  const flattened = [];
  for (const [source, libraries] of Object.entries(linkReferences ?? {})) {
    for (const [library, locations] of Object.entries(libraries)) {
      for (const location of locations) {
        flattened.push({
          library,
          source,
          start: location.start,
          length: location.length,
        });
      }
    }
  }
  return flattened.sort((left, right) =>
    `${left.library}:${left.start}:${left.length}:${left.source}`.localeCompare(
      `${right.library}:${right.start}:${right.length}:${right.source}`,
    ),
  );
}

function protectedLinks(links) {
  return links
    .map(({ library, start, length }) => ({ library, start, length }))
    .sort((left, right) =>
      `${left.library}:${left.start}:${left.length}`.localeCompare(`${right.library}:${right.start}:${right.length}`),
    );
}

function zeroLinkReferences(object, links) {
  const prefix = object.startsWith("0x") ? "0x" : "";
  const characters = object.slice(prefix.length).split("");
  for (const { start, length } of links) {
    characters.splice(start * 2, length * 2, ..."0".repeat(length * 2));
  }
  return prefix + characters.join("");
}

function bytecodeSummary(bytecode) {
  const object = bytecode?.object ?? "0x";
  const linksWithSources = flattenLinks(bytecode?.linkReferences);
  const stripped = stripMetadata(object);
  const normalized = zeroLinkReferences(normalizeEmbeddedMetadata(stripped), linksWithSources);
  return {
    rawHash: sha256(object),
    metadataStrippedHash: sha256(stripped),
    normalizedHash: sha256(normalized),
    size: Math.max(0, (object.length - (object.startsWith("0x") ? 2 : 0)) / 2),
    linksWithSources,
    protectedLinks: protectedLinks(linksWithSources),
  };
}

function normalizeStorage(value) {
  if (Array.isArray(value)) return value.map(normalizeStorage);
  if (!value || typeof value !== "object") return value;
  const normalized = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "astId") continue;
    if (key === "contract" && typeof child === "string") {
      normalized[key] = child.includes(":") ? child.slice(child.lastIndexOf(":") + 1) : child;
    } else {
      normalized[key] = normalizeStorage(child);
    }
  }
  return stable(normalized);
}

function canonicalStorageType(types, typeId, ancestors = new Set()) {
  if (!typeId) return null;
  const type = types[typeId];
  if (!type) return { label: typeId };
  if (ancestors.has(typeId)) return { recursive: type.label ?? typeId };
  const nextAncestors = new Set(ancestors).add(typeId);
  const result = {
    encoding: type.encoding ?? null,
    label: type.label ?? null,
    numberOfBytes: type.numberOfBytes ?? null,
  };
  if (type.base) result.base = canonicalStorageType(types, type.base, nextAncestors);
  if (type.key) result.key = canonicalStorageType(types, type.key, nextAncestors);
  if (type.value) result.value = canonicalStorageType(types, type.value, nextAncestors);
  if (type.members) {
    result.members = type.members.map((member) => ({
      contract:
        typeof member.contract === "string" && member.contract.includes(":")
          ? member.contract.slice(member.contract.lastIndexOf(":") + 1)
          : member.contract,
      label: member.label,
      offset: member.offset,
      slot: member.slot,
      type: canonicalStorageType(types, member.type, nextAncestors),
    }));
  }
  return stable(result);
}

function canonicalStorageLayout(layout) {
  const types = layout?.types ?? {};
  return (layout?.storage ?? []).map((entry) => ({
    contract:
      typeof entry.contract === "string" && entry.contract.includes(":")
        ? entry.contract.slice(entry.contract.lastIndexOf(":") + 1)
        : entry.contract,
    label: entry.label,
    offset: entry.offset,
    slot: entry.slot,
    type: canonicalStorageType(types, entry.type),
  }));
}

function canonicalImmutableReferences(references) {
  return Object.values(references ?? {})
    .map((locations) =>
      locations
        .map(({ start, length }) => ({ start, length }))
        .sort((left, right) => left.start - right.start || left.length - right.length),
    )
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

function extractStructDeclarations(root) {
  const declarations = [];
  for (const file of walk(join(root, "src")).filter((path) => path.endsWith(".sol"))) {
    const content = readFileSync(file, "utf8");
    const matcher = /\bstruct\s+(\w+)\s*\{/g;
    let match;
    while ((match = matcher.exec(content))) {
      const opening = content.indexOf("{", match.index);
      let depth = 1;
      let cursor = opening + 1;
      while (cursor < content.length && depth > 0) {
        if (content[cursor] === "{") depth += 1;
        else if (content[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      if (depth !== 0) throw new Error(`unbalanced struct ${match[1]} in ${file}`);
      const body = content
        .slice(opening + 1, cursor - 1)
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\s+/g, " ")
        .trim();
      declarations.push({ source: basename(file), name: match[1], body });
      matcher.lastIndex = cursor;
    }
  }
  return declarations.sort((left, right) =>
    `${left.source}:${left.name}`.localeCompare(`${right.source}:${right.name}`),
  );
}

function trackedGeneratedOutputs(root) {
  const outputs = {
    frontend: "frontend/src/generated.ts",
    frontendGovernance: "frontend/src/abi/governance.ts",
    frontendOptimisticArbiter: "frontend/src/abi/optimisticInsuranceArbiterAbi.ts",
    indexerGovernance: "indexer/src/governance-abis.ts",
    indexerAgent: "indexer/src/agent-abis.ts",
  };
  return Object.fromEntries(
    Object.entries(outputs).map(([name, path]) => {
      const absolute = join(root, path);
      return [name, existsSync(absolute) ? sha256(readFileSync(absolute)) : null];
    }),
  );
}

function sourceIntegrity(root) {
  const identityRegistry = walk(join(root, "src")).find(
    (path) => basename(path) === "IdentityRegistryUpgradeable.sol",
  );
  return {
    IdentityRegistryUpgradeable: identityRegistry ? sha256(readFileSync(identityRegistry)) : null,
  };
}

function compilerSettings(artifact) {
  const settings = artifact.metadata?.settings ?? {};
  return stable({
    compiler: artifact.metadata?.compiler?.version ?? null,
    evmVersion: settings.evmVersion ?? null,
    optimizer: settings.optimizer ?? null,
    viaIR: settings.viaIR ?? false,
    metadata: settings.metadata ?? null,
    debug: settings.debug ?? null,
  });
}

function sourceNamespaces(root) {
  const sourceRoot = join(root, "src");
  const results = [];
  for (const file of walk(sourceRoot).filter((path) => path.endsWith(".sol"))) {
    const content = readFileSync(file, "utf8");
    const annotations = [...content.matchAll(/@custom:storage-location\s+(\S+)/g)].map((match) => match[1]).sort();
    const slots = [...content.matchAll(/bytes32\s+(?:public|private|internal)?\s*constant\s+(\w+)\s*=\s*(0x[0-9a-fA-F]{64})/gs)]
      .map((match) => ({ name: match[1], value: match[2].toLowerCase() }))
      .filter(({ name }) => /STORAGE.*(?:SLOT|LOCATION)|(?:SLOT|LOCATION).*STORAGE/.test(name))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (annotations.length || slots.length) {
      results.push({ source: basename(file), annotations, slots });
    }
  }
  return results.sort((left, right) => left.source.localeCompare(right.source));
}

function readArtifacts(root, artifactDirectory) {
  const contracts = {};
  for (const file of walk(artifactDirectory).filter((path) => path.endsWith(".json"))) {
    let artifact;
    try {
      artifact = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const targets = Object.entries(artifact?.metadata?.settings?.compilationTarget ?? {});
    if (targets.length !== 1 || !targets[0][0].startsWith("src/")) continue;
    const [[source, contractName]] = targets;
    // Foundry writes imported contracts from an additional compiler profile as
    // `<Contract>.<profile>.json`. The unsuffixed artifact is the profile that
    // applies to that contract's own compilation target and is the compatibility
    // surface consumers resolve.
    const canonicalArtifact = join(basename(source), `${contractName}.json`);
    if (relative(artifactDirectory, file) !== canonicalArtifact) continue;
    const creation = bytecodeSummary(artifact.bytecode);
    const runtime = bytecodeSummary(artifact.deployedBytecode);
    const contract = {
      source,
      artifact: relative(root, file),
      compilerSettings: compilerSettings(artifact),
      abi: normalizeAbi(artifact.abi ?? []),
      methodIdentifiers: stable(artifact.methodIdentifiers ?? {}),
      eventTopics: selectors(artifact.abi ?? [], "event", 66),
      errorSelectors: selectors(artifact.abi ?? [], "error", 10),
      storageLayout: canonicalStorageLayout(artifact.storageLayout ?? { storage: [], types: {} }),
      creationCode: {
        rawHash: creation.rawHash,
        metadataStrippedHash: creation.metadataStrippedHash,
        normalizedHash: creation.normalizedHash,
        size: creation.size,
      },
      runtimeCode: {
        rawHash: runtime.rawHash,
        metadataStrippedHash: runtime.metadataStrippedHash,
        normalizedHash: runtime.normalizedHash,
        size: runtime.size,
      },
      creationLinks: creation.protectedLinks,
      creationLinkSources: creation.linksWithSources,
      runtimeLinks: runtime.protectedLinks,
      runtimeLinkSources: runtime.linksWithSources,
      immutableReferences: canonicalImmutableReferences(artifact.deployedBytecode?.immutableReferences),
    };
    if (contracts[contractName]) {
      throw new Error(
        `duplicate project-owned contract name ${contractName}: ${contracts[contractName].artifact} and ${contract.artifact}`,
      );
    }
    contracts[contractName] = contract;
  }
  return stable(contracts);
}

function snapshot(options) {
  const root = resolve(options.root ?? ".");
  const output = options.output && resolve(options.output);
  if (!output) usage("snapshot requires --output");
  const artifactDirectory = resolve(root, options.artifacts ?? "out");
  if (!existsSync(artifactDirectory)) throw new Error(`artifact directory does not exist: ${artifactDirectory}`);
  const revision =
    options.revision ?? execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const topologyPath = resolve(options.topology ?? join(root, "script/compat-topology.json"));
  if (!existsSync(topologyPath)) throw new Error(`topology manifest does not exist: ${topologyPath}`);
  const dependencyRevision = options["dependency-revision"] ?? "HEAD";
  const submodules = execFileSync("git", ["-C", root, "ls-tree", dependencyRevision, "lib"], { encoding: "utf8" });
  const result = stable({
    version: SNAPSHOT_VERSION,
    revision,
    generatedBy: "script/compat-snapshot.mjs",
    artifactDirectory: relative(root, artifactDirectory),
    dependencyTreeHash: sha256(submodules),
    forgeVersion: execFileSync("forge", ["--version"], { encoding: "utf8" }).trim(),
    generatedOutputs: trackedGeneratedOutputs(root),
    namespaceConstants: sourceNamespaces(root),
    sourceIntegrity: sourceIntegrity(root),
    structDeclarations: extractStructDeclarations(root),
    topology: JSON.parse(readFileSync(topologyPath, "utf8")),
    contracts: readArtifacts(root, artifactDirectory),
  });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${Object.keys(result.contracts).length} contracts to ${output}`);
}

function field(value, dottedPath) {
  return dottedPath.split(".").reduce((current, part) => current?.[part], value);
}

function compare(options) {
  if (!options.baseline || !options.candidate) usage("compare requires --baseline and --candidate");
  const baseline = JSON.parse(readFileSync(resolve(options.baseline), "utf8"));
  const candidate = JSON.parse(readFileSync(resolve(options.candidate), "utf8"));
  if (baseline.version !== SNAPSHOT_VERSION || candidate.version !== SNAPSHOT_VERSION) {
    throw new Error(`unsupported snapshot version; expected ${SNAPSHOT_VERSION}`);
  }

  const baselineNames = Object.keys(baseline.contracts).sort();
  const candidateNames = Object.keys(candidate.contracts).sort();
  const missing = baselineNames.filter((name) => !candidate.contracts[name]);
  const added = candidateNames.filter((name) => !baseline.contracts[name]);
  const protectedDifferences = [];
  const pathAndMetadataChanges = [];

  for (const name of baselineNames.filter((contractName) => candidate.contracts[contractName])) {
    const before = baseline.contracts[name];
    const after = candidate.contracts[name];
    for (const protectedField of PROTECTED_CONTRACT_FIELDS) {
      if (stableJson(field(before, protectedField)) !== stableJson(field(after, protectedField))) {
        protectedDifferences.push({ contract: name, field: protectedField });
      }
    }
    for (const expectedField of [
      "source",
      "artifact",
      "creationCode.rawHash",
      "creationCode.metadataStrippedHash",
      "runtimeCode.rawHash",
      "runtimeCode.metadataStrippedHash",
      "creationLinkSources",
      "runtimeLinkSources",
    ]) {
      if (stableJson(field(before, expectedField)) !== stableJson(field(after, expectedField))) {
        pathAndMetadataChanges.push({ contract: name, field: expectedField });
      }
    }
  }

  if (stableJson(baseline.namespaceConstants) !== stableJson(candidate.namespaceConstants)) {
    protectedDifferences.push({ contract: "<global>", field: "namespaceConstants" });
  }
  for (const globalField of [
    "dependencyTreeHash",
    "forgeVersion",
    "generatedOutputs",
    "sourceIntegrity",
    "structDeclarations",
    "topology",
  ]) {
    if (stableJson(baseline[globalField]) !== stableJson(candidate[globalField])) {
      protectedDifferences.push({ contract: "<global>", field: globalField });
    }
  }

  const result = stable({
    baselineRevision: baseline.revision,
    candidateRevision: candidate.revision,
    passed: missing.length === 0 && added.length === 0 && protectedDifferences.length === 0,
    counts: {
      baselineContracts: baselineNames.length,
      candidateContracts: candidateNames.length,
      missing: missing.length,
      added: added.length,
      protectedDifferences: protectedDifferences.length,
      pathAndMetadataChanges: pathAndMetadataChanges.length,
    },
    missing,
    added,
    protectedDifferences,
    pathAndMetadataChanges,
  });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) writeFileSync(resolve(options.output), serialized);
  process.stdout.write(serialized);
  if (!result.passed) process.exitCode = 1;
}

const { command, options } = parseArgs(process.argv.slice(2));
if (command === "snapshot") snapshot(options);
else compare(options);
