---
name: verified-agents-sepolia
description: Submit ERC-8004 agents to, inspect, challenge, appeal, provide evidence for, or withdraw from the Verified Agents Stake Curate (PermanentGTCR/PGTCR) registry on Ethereum Sepolia. Use for testnet Verified Agents registry operations, submission drafting, duplicate checks, policy and schema validation, live stake or arbitration-cost reads, and PGTCR dispute lifecycle work at registry 0x3162df9669affa8b6b6ff2147afa052249f00447.
---

# Verified Agents on Sepolia

Operate only the fixed Ethereum Sepolia Verified Agents registry documented in [references/registry.md](references/registry.md). It is Stake Curate, implemented by `PermanentGTCR` (PGTCR), not Light Curate. Keep the verification registry chain independent from the ERC-8004 chain where the submitted agent is registered.

## Non-negotiable safeguards

- Read [references/registry.md](references/registry.md) before every task. Read [references/erc8004-source.md](references/erc8004-source.md) and [references/pgtcr.md](references/pgtcr.md) before constructing a submission or transaction.
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
- **Withdraw:** Explain that an owner may start withdrawal when they no longer wish or are able to maintain compliance. Simulate and confirm `startWithdrawItem`, wait the live `withdrawingPeriod`, then separately simulate and confirm `withdrawItem`. The item remains visible and disputable during the waiting period; never promise recovery if a dispute can forfeit stake.
- **Rewards:** Use exact challenge and round identifiers and simulate `withdrawFeesAndRewards` before approval.

## Handoff

Report the live policy and MetaEvidence URIs, source agent chain, registry chain, duplicate-check result, item JSON URI, live token/stake/fee values with block context, simulations, transaction hashes and receipt statuses, and any warnings. Distinguish a prepared draft from an uploaded artifact and from an onchain submission.

## Attribution

This skill adapts only the Stake Curate/PGTCR guidance from Kleros' `kleros-curate` skill pinned at commit `73fd2fd034a73dc50530651c03fba74e9e0c84c7`. See [references/pgtcr.md](references/pgtcr.md) and [LICENSE.kleros-skills](LICENSE.kleros-skills).
