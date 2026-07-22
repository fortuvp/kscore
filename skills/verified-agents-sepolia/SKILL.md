---
name: verified-agents-sepolia
description: Route ERC-8004 operations to the KSCORE Verified Agents Stake Curate registry on Ethereum Sepolia. This overlay supplies only fixed registry, explorer, subgraph, and ERC-8004 contract routing for 0x3162df9669affa8b6b6ff2147afa052249f00447.
---

# Verified Agents on Sepolia

Use this skill only as a technical routing overlay for the KSCORE Verified Agents registry on Ethereum Sepolia. It does not assess agents or determine whether an operation is appropriate.

## Fixed registry routing

| Field | Value |
| --- | --- |
| Verification environment | Testnet |
| Chain | Ethereum Sepolia |
| Chain ID | `11155111` |
| Registry type | Stake Curate / `PermanentGTCR` / PGTCR |
| Registry | `0x3162df9669affa8b6b6ff2147afa052249f00447` |

Read [references/registry.md](references/registry.md) for the explorer, Curate URL, indexed endpoint, and live contract checks. Read [references/erc8004-source.md](references/erc8004-source.md) for the supported ERC-8004 source-chain addresses.

## Required operating context

Before a registry operation, load the complete current [Kleros Skills package](https://skills.kleros.io/) and follow its `kleros-curate` Stake Curate instructions for contract mechanics. This local skill supplies KSCORE routing constants only.

Perform independent due diligence from current onchain state and authoritative sources. Confirm every address, contract, amount, period, fee, balance, allowance, and item state in the current session. Do not treat this routing file as an assessment of an agent, transaction, or outcome.

## Operational sequence

1. Require chain ID `11155111`, verify non-empty bytecode at the registry address, and confirm the PGTCR reads `token()` and `submissionMinDeposit()`.
2. Use the Goldsky endpoint in [references/registry.md](references/registry.md) for indexed discovery. Cross-check every transaction-critical value onchain.
3. Require an explicit ERC-8004 source chain. Verify its registry bytecode, then read the agent owner and URI at a pinned block using [references/erc8004-source.md](references/erc8004-source.md).
4. Use the current Kleros Skills package for submission, challenge, evidence, appeal, withdrawal, and reward transaction construction.
5. Read all mutable inputs live, simulate each write, show the complete transaction parameters, obtain user approval, wait for the receipt, and verify success before continuing.

## Handoff

Report the verification chain and registry address, ERC-8004 source chain and contract addresses, RPC and indexed endpoints used, block numbers, mutable values read live, simulation result, transaction hash, and receipt status. Distinguish preparation, upload, broadcast, and confirmed onchain state.
