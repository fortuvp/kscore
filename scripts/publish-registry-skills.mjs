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
const siteUrl = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
);

function normalizeSiteUrl(input) {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use http or https");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

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
    skillUrl: `${siteUrl}/skills/${name}/SKILL.md`,
    url: `${siteUrl}/skills/${name}.tar.gz`,
    digest: `sha256:${sha256(archive)}`,
  });
}

const publicSkill = `---
name: verified-agents
description: Discover the registry-specific Verified Agents Stake Curate skills for Sepolia testnet and Ethereum mainnet submissions, disputes, evidence, appeals, and withdrawals.
---

# Verified Agents registry skills

Choose the verification registry environment independently from the ERC-8004 agent's source chain.

${skillMetadata
  .map(
    (skill) =>
      `- [${skill.displayName}](${skill.skillUrl}) — ${skill.description} [Installable archive](${skill.url}).`,
  )
  .join("\n")}
`;

const llmsText = `# DEX8004 Verified Agents skills

> Registry-specific, submission-first instructions for the Verified Agents Stake Curate / PermanentGTCR / PGTCR registries.

${skillMetadata
  .map(
    (skill) =>
      `- [${skill.displayName}](${skill.skillUrl}): ${skill.description} Installable bundle: ${skill.url}`,
  )
  .join("\n")}

Discovery index: ${siteUrl}/.well-known/agent-skills/index.json
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
    `Published ${skillNames.length} registry skills for ${siteUrl}.\n`,
  );
}
