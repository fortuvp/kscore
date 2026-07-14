---
name: verified-agents
description: Discover and route the registry-specific DEX8004 Verified Agents skills for the permissionless Stake Curate (PermanentGTCR/PGTCR) registries on Sepolia and Ethereum mainnet. Always load the complete current Kleros Skills package before submissions, challenges, evidence, appeals, or withdrawals.
---

# DEX8004 Verified Agents skills

This is a product and registry routing overlay for two permissionless, policy-governed PGTCR registries. It does not replace Kleros' operational instructions.

## Required Kleros context

Before any registry action, install or load the **complete** [Kleros Skills package](https://skills.kleros.io/) from its [source repository](https://github.com/kleros/kleros-skills). Start with [the upstream router](https://skills.kleros.io/SKILL.md), then load `kleros-curate/SKILL.md` and the current Stake Curate, MetaEvidence, item JSON, deposit, ABI, and IPFS references it routes to. Do not proceed with a write when those files cannot be loaded.

These local skills follow the registry-context pattern demonstrated by [`scout-registries.md`](https://github.com/kleros/kleros-skills/blob/master/kleros-curate/references/scout-registries.md): upstream Kleros Skills owns contract operations; DEX8004 supplies fixed Verified Agents addresses, ERC-8004 identity rules, product states, and additional safeguards. Verified Agents is PGTCR, not Scout or Light Curate.

## Choose the verification registry

Choose the verification registry independently from the ERC-8004 agent's source chain.

- [Verified Agents · Sepolia](/skills/verified-agents-sepolia/SKILL.md) — Operate the permissionless Verified Agents Stake Curate (PermanentGTCR/PGTCR) registry on Ethereum Sepolia for ERC-8004 submissions, inspection, challenges, evidence, appeals, and withdrawals. Always load the complete current Kleros Skills package for live PGTCR mechanics; use this overlay for fixed routing, source identity, policy checks, state labels, economics, and duplicate safeguards at 0x3162df9669affa8b6b6ff2147afa052249f00447. [Installable archive](/skills/verified-agents-sepolia.tar.gz).
- [Verified Agents · Mainnet](/skills/verified-agents-mainnet/SKILL.md) — Operate the permissionless Verified Agents Stake Curate (PermanentGTCR/PGTCR) registry on Ethereum mainnet for ERC-8004 submissions, inspection, challenges, evidence, appeals, and withdrawals. Always load the complete current Kleros Skills package for live PGTCR mechanics; use this overlay for fixed routing, source identity, policy checks, state labels, economics, and duplicate safeguards at 0x118155741eea23f56b3bd59b0c1342d5daaa6d07. [Installable archive](/skills/verified-agents-mainnet.tar.gz).

## Interpret the signal conservatively

- **Pending** is not verified. **Active / verified** means collateral is active and the item currently complies with this registry's policy; it is not a universal safety guarantee. **Disputed** is unresolved. **Removed** means an adverse challenge/dispute found the item non-compliant. **Withdrawn** is a voluntary exit without an adverse ruling and is not evidence of non-compliance.
- Optional collateral above the minimum can improve placement in stake-ranked DEX8004 views and signal confidence, but it does not prove compliance or guarantee trust, usage, or clients.
- A successful challenger may earn collateral; an unsuccessful challenger can lose stake and incur fees. Never describe challenging as guaranteed profit.
- A successfully finalized, voluntary, unchallenged withdrawal returns 100% of the recorded ERC20 item stake and recorded native arbitration deposit after the live withdrawal period. Gas and upload costs are separate, and a dispute can delay or prevent recovery.
