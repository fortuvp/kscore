---
name: verified-agents-sepolia
description: Operate the permissionless Verified Agents Stake Curate (PermanentGTCR/PGTCR) registry on Ethereum Sepolia for ERC-8004 submissions, inspection, challenges, evidence, appeals, and withdrawals. Always load the complete current Kleros Skills package for live PGTCR mechanics; use this overlay for fixed routing, source identity, policy checks, state labels, economics, and duplicate safeguards at 0x3162df9669affa8b6b6ff2147afa052249f00447.
---

# Verified Agents on Sepolia

Operate only the fixed Ethereum Sepolia Verified Agents registry documented in [references/registry.md](references/registry.md). It is Stake Curate, implemented by `PermanentGTCR` (PGTCR), not Light Curate. Keep the verification registry chain independent from the ERC-8004 chain where the submitted agent is registered.

## Load the full Kleros package first

Before every registry operation, install or load the **complete** [Kleros Skills package](https://skills.kleros.io/) from its [source repository](https://github.com/kleros/kleros-skills); do not copy only one reference file. Start with `https://skills.kleros.io/SKILL.md`, then load `kleros-curate/SKILL.md` and the current `references/stake-curate.md`, `references/shared-metaevidence.md`, `references/shared-item-json.md`, `references/shared-deposits.md`, and `references/shared-ipfs-upload.md` files required by the action. Use those files for operational Kleros mechanics and this skill for the Verified Agents routing, identity, duplicate, product-state, and policy safeguards. Stop before a write if the package or a required reference cannot be loaded.

This is a registry-specific overlay in the spirit of Kleros Curate's [`scout-registries.md`](https://github.com/kleros/kleros-skills/blob/master/kleros-curate/references/scout-registries.md), but these registries are **Stake Curate / PermanentGTCR (PGTCR)**, not Scout or Light Curate.

## Registry map and product meaning

Verified Agents uses two permissionless, policy-governed generalized TCR registries:

| Environment | Verification chain | Registry |
| --- | --- | --- |
| Testnet (this skill) | Ethereum Sepolia (`11155111`) | `0x3162df9669affa8b6b6ff2147afa052249f00447` |
| Mainnet | Ethereum (`1`) | `0x118155741eea23f56b3bd59b0c1342d5daaa6d07` |

Anyone may submit a candidate or challenge one with evidence. Treat inclusion as a live signal that the listed item currently satisfies this registry's policy—not as a universal safety guarantee, audit, or Kleros endorsement. Derive state from current contract and dispute history before describing an agent:

- **Pending:** The submission or reinclusion period has not elapsed. The agent is not yet verified.
- **Active / verified:** The period has elapsed, collateral remains active, and there is no active withdrawal or unresolved/adverse dispute. Say it complies with this registry's policy; make no broader claim.
- **Disputed:** A challenge is unresolved. Do not call the agent compliant or non-compliant until the ruling is final.
- **Removed:** A challenge/dispute ended against the item. Say it was removed as non-compliant with the registry policy, with the ruling context.
- **Withdrawn:** The submitter voluntarily left without an adverse ruling. It is no longer active, but withdrawal alone is not evidence of non-compliance.

## Economic context

- A submitter may collateralize more than `submissionMinDeposit()`. On KSCORE, more collateral can improve placement in stake-ranked views and signal confidence, but it does not prove compliance or guarantee trust, usage, or clients. The full stake is exposed to a valid challenge.
- Anyone may challenge a non-compliant item. A successful challenger may earn collateral under the live PGTCR rules; an unsuccessful challenger can lose stake and incur arbitration and gas costs. Never present challenging as guaranteed profit.
- A voluntary, unchallenged two-step withdrawal returns **100% of the recorded ERC20 item stake and recorded native arbitration deposit** to the submitter after the live `withdrawingPeriod`. Gas and upload costs are not refunded, and an unresolved or successful challenge can delay or prevent that recovery. Verify the deployed implementation and simulate before promising an amount.

## Non-negotiable safeguards

- Load the full Kleros package as required above. Read [references/registry.md](references/registry.md) before every task. Read [references/erc8004-source.md](references/erc8004-source.md) and [references/pgtcr.md](references/pgtcr.md) before constructing a submission or transaction.
- Confirm chain ID `11155111`, registry bytecode, and the exact registry address before contract calls.
- Read current MetaEvidence, policy, schema, token, periods, multipliers, stake minimum, arbitrator, extra data, and arbitration or appeal cost live. Never quote or transact from cached amounts.
- Copy `metadata.columns` verbatim into `item.json`; only `values` may be authored. Do not infer the schema from this skill, the UI, or an older item.
- Treat the ERC20 stake and native ETH arbitration fee as separate assets. Never combine them.
- Simulate every write. Obtain explicit user approval before uploads or transactions. Wait for each receipt and verify success before the next transaction.
- Stop on an unreachable policy, malformed metadata, incomplete values, duplicate active item, failed IPFS round trip, failed simulation, wrong chain, or insufficient balance/allowance.

## Sepolia policy conflict

Warn the user before drafting or submitting: the current Sepolia policy describes the Agent Number as curator-assigned/not onchain, while the live MetaEvidence requires a numeric `Agent Number`. For this integration, populate it with the numeric ERC-8004 agent ID. Record that warning in the handoff, continue with the ERC-8004 ID, and still stop for any other unresolved policy conflict.

## Submit an agent

Follow this workflow in order:

1. Verify the registry using the fixed routing data and PGTCR hallmark reads `token()` and `submissionMinDeposit()`.
2. Query Goldsky for the registry's latest arbitration setting, then cross-check critical values onchain. Fetch the current MetaEvidence JSON and its `fileURI` policy through at least one working IPFS gateway.
3. Read the complete policy. Apply the Sepolia conflict rule above.
4. Require an explicit ERC-8004 source chain, then verify the numeric agent ID, current agent URI, and current owner at one pinned source-chain block using [references/erc8004-source.md](references/erc8004-source.md). Encode Owner as `eip155:<sourceChainId>:<ownerAddress>`; do not substitute Sepolia merely because the verification registry is on Sepolia.
5. Page through every item for this registry and apply the deterministic duplicate rules in [references/pgtcr.md](references/pgtcr.md). Stop for an active item with the same source-chain-and-agent-ID identity; report an absent historical match before attempting resubmission.
6. Deep-copy the live `metadata.columns`. Fill all values in the same order. Validate numeric ID, reachable URI, checksum-capable EVM owner address, CAIP-10 shape, no placeholders, and policy compliance. Treat Additional Info as an editable factual summary, not proof of safety.
7. Show the exact fetched columns and final draft. Obtain approval, upload the JSON to durable IPFS, retain `/ipfs/<CID>`, fetch it back, parse it, and byte-for-byte compare the logical JSON.
8. Read `submissionMinDeposit()` and token metadata live. Choose a stake at least the minimum and obtain explicit confirmation that it remains locked until the two-step withdrawal completes and may be at risk in a dispute.
9. Simulate `ERC20.approve(registry, stake)`, send it after approval, wait for a successful receipt, and re-read allowance.
10. Resolve the active arbitration extra data and call `arbitrator.arbitrationCost(extraData)` live. Simulate `addItem("/ipfs/<CID>", stake)` with exactly that ETH value.
11. Show chain, registry, token, stake, ETH fee, URI, and sender. Send only after final approval, wait for a successful receipt, extract the item ID/event, and verify onchain or indexed state without resubmitting during indexing lag.

## Other registry actions

- **Browse or inspect:** Use paginated Goldsky data, then cross-check transaction-critical state onchain. Derive display status using the PGTCR rules in [references/pgtcr.md](references/pgtcr.md).
- **Challenge:** Read the policy and item first. Prepare durable ERC-1497 evidence, calculate challenge stake from live item stake and multiplier, complete the ERC20 approval receipt, read arbitration cost live, simulate `challengeItem`, then request final approval.
- **Evidence:** Upload and round-trip-check ERC-1497 evidence, simulate `submitEvidence`, then request approval. Never claim an evidence URI proves its own assertions.
- **Appeal:** Use the challenge-scoped arbitration setting, live appeal period, current ruling, cost, multipliers, and prior contributions. Enforce the losing-side half-time rule; simulate `fundAppeal` with only the remaining amount.
- **Withdraw:** Explain that an owner may voluntarily leave without implying an adverse policy finding. Simulate and confirm `startWithdrawItem`, wait the live `withdrawingPeriod`, then separately simulate and confirm `withdrawItem`. If no dispute changes the outcome, finalization returns the recorded ERC20 item stake and recorded native arbitration deposit; exclude gas/upload costs and never promise recovery while a dispute can forfeit funds.
- **Rewards:** Use exact challenge and round identifiers and simulate `withdrawFeesAndRewards` before approval.

## Handoff

Report the live policy and MetaEvidence URIs, source agent chain, registry chain, duplicate-check result, item JSON URI, live token/stake/fee values with block context, simulations, transaction hashes and receipt statuses, and any warnings. Distinguish a prepared draft from an uploaded artifact and from an onchain submission.

## Attribution

This local overlay supplements—and never replaces—the complete, current [Kleros Skills package](https://skills.kleros.io/). Its bundled PGTCR reference was adapted from Kleros' `kleros-curate` skill at commit `73fd2fd034a73dc50530651c03fba74e9e0c84c7`; see [references/pgtcr.md](references/pgtcr.md), the [upstream source](https://github.com/kleros/kleros-skills), and [LICENSE.kleros-skills](LICENSE.kleros-skills).
