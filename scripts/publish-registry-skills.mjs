#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(root, "public");
const checkOnly = process.argv.includes("--check");
const skillNames = ["verified-agents-sepolia", "verified-agents-mainnet"];
const klerosSkillsUrl = "https://skills.kleros.io/";
const klerosSkillsSourceUrl = "https://github.com/kleros/kleros-skills";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function writeTarOctal(header, offset, length, value) {
  const octal = value.toString(8).padStart(length - 1, "0");
  if (octal.length > length - 1) throw new Error("Tar value is too large");
  header.write(`${octal}\0`, offset, length, "ascii");
}

function createDeterministicTarGz(files) {
  const chunks = [];
  for (const file of [...files].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  )) {
    if (Buffer.byteLength(file.relativePath) > 100) {
      throw new Error(`Tar path is too long: ${file.relativePath}`);
    }

    const header = Buffer.alloc(512);
    header.write(file.relativePath, 0, 100, "utf8");
    writeTarOctal(header, 100, 8, 0o644);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, file.contents.length);
    writeTarOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = "0".charCodeAt(0);
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    header.write("root", 265, 4, "ascii");
    header.write("root", 297, 4, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(
      `${checksum.toString(8).padStart(6, "0")}\0 `,
      148,
      8,
      "ascii",
    );

    chunks.push(header, file.contents);
    const padding = (512 - (file.contents.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));

  const archive = gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
  archive.fill(0, 4, 8);
  archive[9] = 255;
  return archive;
}

function parseDescription(skillMarkdown, name) {
  const frontmatter = skillMarkdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) throw new Error(`${name}/SKILL.md has no frontmatter`);
  const line = frontmatter[1]
    .split("\n")
    .find((candidate) => candidate.startsWith("description:"));
  if (!line) throw new Error(`${name}/SKILL.md has no description`);
  const raw = line.slice("description:".length).trim();
  return raw.replace(/^("|')([\s\S]*)\1$/, "$2");
}

async function walkFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".DS_Store") continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    }
  }
  return files;
}

const expected = new Map();
const skillMetadata = [];
const skillDocuments = [];

for (const name of skillNames) {
  const sourceDirectory = resolve(root, "skills", name);
  const sourceInfo = await stat(sourceDirectory).catch(() => null);
  if (!sourceInfo?.isDirectory()) throw new Error(`Missing source skill: ${name}`);

  const sourceFiles = [];
  for (const file of await walkFiles(sourceDirectory)) {
    const contents = await readFile(file.absolutePath);
    expected.set(`skills/${name}/${file.relativePath}`, contents);
    sourceFiles.push({ relativePath: file.relativePath, contents });
  }

  const skillMarkdown = await readFile(resolve(sourceDirectory, "SKILL.md"));
  const skillText = skillMarkdown.toString("utf8");
  const archive = createDeterministicTarGz(sourceFiles);
  expected.set(`skills/${name}.tar.gz`, archive);
  skillMetadata.push({
    name,
    description: parseDescription(skillText, name),
    displayName:
      name === "verified-agents-sepolia"
        ? "Verified Agents · Sepolia"
        : "Verified Agents · Mainnet",
    skillUrl: `/skills/${name}/SKILL.md`,
    url: `/skills/${name}.tar.gz`,
    digest: `sha256:${sha256(archive)}`,
  });
  skillDocuments.push({
    displayName:
      name === "verified-agents-sepolia"
        ? "Verified Agents · Sepolia"
        : "Verified Agents · Mainnet",
    text: skillText,
  });
}

const publicSkill = `---
name: verified-agents
description: Discover and route the registry-specific DEX8004 Verified Agents skills for the permissionless Stake Curate (PermanentGTCR/PGTCR) registries on Sepolia and Ethereum mainnet. Always load the complete current Kleros Skills package before submissions, challenges, evidence, appeals, or withdrawals.
---

# DEX8004 Verified Agents skills

This is a product and registry routing overlay for two permissionless, policy-governed PGTCR registries. It does not replace Kleros' operational instructions.

## Required Kleros context

Before any registry action, install or load the **complete** [Kleros Skills package](${klerosSkillsUrl}) from its [source repository](${klerosSkillsSourceUrl}). Start with [the upstream router](${klerosSkillsUrl}SKILL.md), then load \`kleros-curate/SKILL.md\` and the current Stake Curate, MetaEvidence, item JSON, deposit, ABI, and IPFS references it routes to. Do not proceed with a write when those files cannot be loaded.

These local skills follow the registry-context pattern demonstrated by [\`scout-registries.md\`](${klerosSkillsSourceUrl}/blob/master/kleros-curate/references/scout-registries.md): upstream Kleros Skills owns contract operations; DEX8004 supplies fixed Verified Agents addresses, ERC-8004 identity rules, product states, and additional safeguards. Verified Agents is PGTCR, not Scout or Light Curate.

## Choose the verification registry

Choose the verification registry independently from the ERC-8004 agent's source chain.

${skillMetadata
  .map(
    (skill) =>
      `- [${skill.displayName}](${skill.skillUrl}) — ${skill.description} [Installable archive](${skill.url}).`,
  )
  .join("\n")}

## Interpret the signal conservatively

- **Pending** is not verified. **Active / verified** means collateral is active and the item currently complies with this registry's policy; it is not a universal safety guarantee. **Disputed** is unresolved. **Removed** means an adverse challenge/dispute found the item non-compliant. **Withdrawn** is a voluntary exit without an adverse ruling and is not evidence of non-compliance.
- Optional collateral above the minimum can improve placement in stake-ranked DEX8004 views and signal confidence, but it does not prove compliance or guarantee trust, usage, or clients.
- A successful challenger may earn collateral; an unsuccessful challenger can lose stake and incur fees. Never describe challenging as guaranteed profit.
- A successfully finalized, voluntary, unchallenged withdrawal returns 100% of the recorded ERC20 item stake and recorded native arbitration deposit after the live withdrawal period. Gas and upload costs are separate, and a dispute can delay or prevent recovery.
`;

const llmsText = `# DEX8004 Verified Agents

> Agent-readable routing and safety overlay for two permissionless, policy-governed Stake Curate / PermanentGTCR / PGTCR registries.

## Load Kleros Skills first

Install or load the complete current Kleros Skills package before any registry operation:

- Package and agent router: ${klerosSkillsUrl}
- Source: ${klerosSkillsSourceUrl}
- Curate operations: ${klerosSkillsSourceUrl}/blob/master/kleros-curate/SKILL.md
- Stake Curate operations: ${klerosSkillsSourceUrl}/blob/master/kleros-curate/references/stake-curate.md

Use the upstream package for operational Kleros mechanics. Use the DEX8004 skills below as the fixed-registry overlay for addresses, ERC-8004 source identity, duplicate prevention, status language, economics, and policy safeguards. This mirrors the context-overlay pattern of ${klerosSkillsSourceUrl}/blob/master/kleros-curate/references/scout-registries.md, but Verified Agents is PGTCR—not Scout or Light Curate.

## Registry skills

${skillMetadata
  .map(
    (skill) =>
      `- [${skill.displayName}](${skill.skillUrl}): ${skill.description} Installable bundle: ${skill.url}`,
  )
  .join("\n")}

Sepolia registry (chain 11155111): 0x3162df9669affa8b6b6ff2147afa052249f00447
Ethereum mainnet registry (chain 1): 0x118155741eea23f56b3bd59b0c1342d5daaa6d07

## Product semantics and economics

- Pending is not verified. Active/verified means currently collateralized and compliant with this registry's policy only. Disputed is unresolved. Removed follows an adverse dispute. Withdrawn is voluntary and is not evidence of non-compliance.
- Stake above the live minimum may improve stake-ranked placement and signal confidence, but never proves compliance or guarantees clients.
- Correct challengers may earn collateral; incorrect challengers can lose stake and incur fees. Read every amount and rule live.
- After the live waiting period, a successfully finalized voluntary withdrawal returns 100% of the recorded ERC20 item stake and recorded native arbitration deposit. Gas/upload costs are excluded; disputes put recovery at risk.

Discovery index: /.well-known/agent-skills/index.json
`;

const llmsFullText = `${llmsText}
---

# Complete local skill router

${publicSkill}

${skillDocuments
  .map(
    (skill) => `---

# ${skill.displayName} overlay

${skill.text}`,
  )
  .join("\n\n")}
`;

const discoveryIndex = `${JSON.stringify(
  {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: skillMetadata.map(({ name, description, url, digest }) => ({
      name,
      type: "archive",
      description,
      url,
      digest,
    })),
  },
  null,
  2,
)}\n`;

expected.set("SKILL.md", Buffer.from(publicSkill));
expected.set("llms.txt", Buffer.from(llmsText));
expected.set("llms-full.txt", Buffer.from(llmsFullText));
expected.set(
  ".well-known/agent-skills/index.json",
  Buffer.from(discoveryIndex),
);

async function listUnexpectedFiles() {
  const unexpected = [];
  for (const name of skillNames) {
    const directory = resolve(publicRoot, "skills", name);
    const info = await stat(directory).catch(() => null);
    if (!info?.isDirectory()) continue;
    for (const file of await walkFiles(directory)) {
      const outputPath = `skills/${name}/${file.relativePath}`;
      if (!expected.has(outputPath)) unexpected.push(outputPath);
    }
  }
  return unexpected;
}

if (checkOnly) {
  const drift = [];
  for (const [outputPath, contents] of expected) {
    const actual = await readFile(resolve(publicRoot, outputPath)).catch(() => null);
    if (!actual) drift.push(`${outputPath} (missing)`);
    else if (!actual.equals(contents)) drift.push(`${outputPath} (changed)`);
  }
  drift.push(...(await listUnexpectedFiles()).map((path) => `${path} (unexpected)`));

  if (drift.length > 0) {
    process.stderr.write(
      `Published registry skills are stale:\n${drift
        .sort()
        .map((path) => `- ${path}`)
        .join("\n")}\nRun: node scripts/publish-registry-skills.mjs\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("Published registry skills match their sources.\n");
  }
} else {
  for (const name of skillNames) {
    await rm(resolve(publicRoot, "skills", name), {
      recursive: true,
      force: true,
    });
  }
  for (const [outputPath, contents] of expected) {
    const destination = resolve(publicRoot, outputPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
  process.stdout.write(
    `Published ${skillNames.length} registry skills with deployment-relative URLs.\n`,
  );
}
