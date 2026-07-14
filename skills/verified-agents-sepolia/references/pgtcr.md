# Verified Agents PGTCR operations

This reference is adapted from the PGTCR-only parts of Kleros' MIT-licensed [`kleros-curate`](https://github.com/kleros/kleros-skills/tree/73fd2fd034a73dc50530651c03fba74e9e0c84c7/kleros-curate) skill at commit `73fd2fd034a73dc50530651c03fba74e9e0c84c7`. The upstream license is bundled as `LICENSE.kleros-skills`.

Install or load the **complete, current** [Kleros Skills package](https://skills.kleros.io/) before using this reference. Read its `kleros-curate/SKILL.md` and current `references/stake-curate.md` plus the shared MetaEvidence, item JSON, deposit, ABI, and IPFS references routed by that skill. This file adds Verified Agents-specific safeguards and exact registry assumptions; it is not a substitute for the upstream operational package. Light Curate, Scout, factory deployment, and registry administration are intentionally not duplicated here.

## Contents

- [PGTCR model](#pgtcr-model)
- [Registry and item queries](#registry-and-item-queries)
- [MetaEvidence and item JSON](#metaevidence-and-item-json)
- [Live value and transaction sequence](#live-value-and-transaction-sequence)
- [Disputes, appeals, and withdrawal](#disputes-appeals-and-withdrawal)
- [Minimal ABIs](#minimal-abis)

## PGTCR model

`PermanentGTCR` is Stake Curate. An item carries ERC20 collateral plus a recorded native arbitration deposit. Submission is `approve` followed by `addItem(string,uint256)`. Challenge also uses ERC20 collateral plus native arbitration cost. Withdrawal is `startWithdrawItem`, a live waiting period, then `withdrawItem`; an unchallenged final withdrawal returns both recorded deposits to the submitter.

Use Goldsky as the primary indexed view and the chain as the source of truth for writes. Never infer accepted status from the raw enum alone:

- `Absent`: rejected or removed; distinguish with history.
- `Submitted`: pending until `includedAt + submissionPeriod`, then accepted.
- `Reincluded`: pending until `includedAt + reinclusionPeriod`, then accepted.
- `Disputed`: inspect the latest challenge and appeal round.
- Any included item with a withdrawal timestamp becomes pending withdrawal according to the contract's live withdrawal rules.

## Registry and item queries

Use the endpoint and lowercase registry ID from `registry.md`.

```graphql
query VerifiedRegistry($id: String!) {
  registry(id: $id) {
    id
    token
    arbitrator { id }
    submissionMinDeposit
    submissionPeriod
    reinclusionPeriod
    withdrawingPeriod
    arbitrationParamsCooldown
    challengeStakeMultiplier
    winnerStakeMultiplier
    loserStakeMultiplier
    sharedStakeMultiplier
    arbitrationSettings(orderBy: timestamp, orderDirection: desc) {
      id
      timestamp
      arbitratorExtraData
      metaEvidenceURI
      metadata { policyURI }
    }
  }
}
```

Page until a page contains fewer than `first` rows; do not duplicate-check only the newest page.

```graphql
query VerifiedItems($first: Int!, $skip: Int!, $where: Item_filter) {
  items(first: $first, skip: $skip, orderBy: includedAt, orderDirection: desc, where: $where) {
    id
    itemID
    data
    status
    stake
    submitter
    includedAt
    withdrawingTimestamp
  }
}
```

Use `where: { registry: "<lowercase-registry>" }`. Fetch every `data` URI, parse `item.json`, and compare normalized values. Treat an unreachable active item as a blocking duplicate-check error, not as proof that no duplicate exists.

### Deterministic duplicate rules

Normalize the proposed and existing values as follows:

- Agent Number: parse as a non-negative integer and serialize in base-10 without leading zeroes.
- Owner: parse CAIP-10, require namespace `eip155`, serialize the decimal chain ID canonically, validate the EVM address, and compare addresses case-insensitively.
- Agent URI: trim it; for IPFS forms compare the CID plus path after converting `ipfs://`, `/ipfs/`, and gateway URLs to one `/ipfs/<CID-and-path>` form. Do not discard query/path data for non-IPFS URLs.

The registry identity is `(Owner source chain ID, Agent Number)`. An item in `Submitted`, `Reincluded`, or `Disputed` status with the same identity is an active duplicate even when its URI or current owner address differs. Stop and report it. Also stop for manual review when an active item reuses the same normalized URI or the exact same CAIP-10 Owner with conflicting identity fields. An `Absent` match is historical, not active; report its outcome and use the contract's reinclusion path only if the current policy and simulation permit it. If an active item payload is missing, malformed, or unreachable, the scan is incomplete and submission must stop.

For challenges and appeals, query the single item entity ID used by the subgraph, normally `<itemID>@<registryAddress>`:

```graphql
query VerifiedItem($id: String!) {
  item(id: $id) {
    itemID data status stake submitter includedAt withdrawingTimestamp
    submissions(orderBy: createdAt, orderDirection: desc) {
      creationTx withdrawingTimestamp withdrawingTx submitter initialStake arbitrationDeposit
    }
    challenges(orderBy: createdAt, orderDirection: desc) {
      id disputeID creationTx resolutionTx challenger challengerStake disputeOutcome
      arbitrationSetting { id timestamp arbitratorExtraData }
      rounds(orderBy: creationTime, orderDirection: desc) {
        appealPeriodStart appealPeriodEnd ruling rulingTime
        hasPaidRequester hasPaidChallenger amountPaidRequester amountPaidChallenger
      }
    }
    evidences(orderBy: number, orderDirection: desc) { party URI timestamp txHash }
    registry {
      id token arbitrator { id } submissionMinDeposit withdrawingPeriod
      challengeStakeMultiplier winnerStakeMultiplier loserStakeMultiplier sharedStakeMultiplier
    }
  }
}
```

If the subgraph lags, do not resend. Confirm the receipt and contract logs, then wait for indexing.

## MetaEvidence and item JSON

PGTCR has one MetaEvidence stream. Prefer the latest applicable Goldsky `metaEvidenceURI`. As fallback, retrieve registry `MetaEvidence(uint256,string)` logs using topic `0x61606860eb6c87306811e2695215385101daab53bd6ab4e9f9049aead9363c7d`, sort by block, transaction index, and log index, and take the latest valid event. Fetch IPFS paths by prepending a gateway host without adding a second `/ipfs/`.

Require a reachable, parseable MetaEvidence object containing `fileURI` and `metadata.columns`. Fetch and read the complete policy. Then build:

```json
{
  "columns": "<verbatim deep copy of live metadata.columns>",
  "values": "<object keyed by the exact column labels in the same order>"
}
```

The example above describes structure; replace both strings with the actual array and object. Enforce:

- `columns` deep-equals current `metadata.columns`.
- `Object.keys(values)` exactly equals the ordered column labels.
- Values contain no blanks or placeholders unless the live policy explicitly allows them.
- `number`, `rich address`, URI, file, and image encodings match live types and policy.
- The agent URI resolves and its registration data matches the proposed ID and owner.
- The uploaded item uses `/ipfs/<CID>`, is fetched back, parses, and logically matches the approved JSON.

Do not upload until the user approves the complete draft. Use durable IPFS pinning suitable for a dispute lifecycle. A disappearing item or evidence file can put stake or a case at risk.

## Live value and transaction sequence

Never cache monetary amounts. Immediately before a submission:

1. Read `token()`, `submissionMinDeposit()`, `arbitrator()`, `MULTIPLIER_DIVISOR()`, periods, and multipliers.
2. Determine the active arbitration setting from Goldsky ordered by timestamp. Derive its change index from the indexed setting ID or matching MetaEvidence ID, read that exact `arbitrationParamsChanges(index)`, and require its extra data to match. Goldsky's entity timestamp is ordering/event time; activation uses the onchain change timestamp. Index `0` with onchain timestamp `0` is the valid initial active setting. For later indices, require `onchainTimestamp + arbitrationParamsCooldown <= current block timestamp` and use the newest applicable change. Stop if the index, extra data, or cooldown state disagree; do not compare the Goldsky timestamp numerically to the onchain activation timestamp, probe an unbounded array, or blindly assume index zero.
3. Call `arbitrator.arbitrationCost(extraData)` live.
4. Read token `symbol`, `decimals`, sender balance, allowance, and native balance.
5. Validate `stake >= submissionMinDeposit`. Never silently replace malformed input with the minimum.
6. Simulate `approve(registry, stake)`, send after explicit approval, wait for a successful receipt, and re-read allowance.
7. Simulate `addItem(itemURI, stake)` with `msg.value = arbitrationCost`. Show all values, obtain final approval, send, and wait for a successful receipt.

Approval success means a successful mined receipt, not a transaction hash. Likewise, an `addItem` broadcast is not a submission until its receipt succeeds.

## Disputes, appeals, and withdrawal

### Challenge

Compute ERC20 challenge stake with live values:

```text
challengeStake = item.stake * challengeStakeMultiplier / MULTIPLIER_DIVISOR
```

Prepare ERC-1497 evidence and round-trip it through IPFS. Complete and confirm the ERC20 approval. Resolve arbitration cost live, simulate `challengeItem(itemID,evidenceURI)` with that ETH value, then obtain final approval.

### Evidence

Use a durable `/ipfs/<CID>` ERC-1497 evidence object. Fetch it back before simulating and sending `submitEvidence(itemID,evidenceURI)`.

### Appeal

Use the arbitration extra data attached to the challenge, not merely the registry's current setting. Read `appealPeriod`, `appealCost`, `currentRuling`, live fee multipliers, and round contributions.

```text
required = appealCost + appealCost * sideMultiplier / MULTIPLIER_DIVISOR
remaining = max(required - alreadyPaidForSide, 0)
```

Use shared multiplier when there is no ruling, winner multiplier for the current winning side, and loser multiplier for the losing side. The loser must fully fund before `(appealPeriodStart + appealPeriodEnd) / 2`. Never fund side `0`. Simulate `fundAppeal(itemID,side)` with only `remaining`.

### Withdrawal

Withdrawal is always two transactions:

1. Simulate and confirm `startWithdrawItem(itemID)`.
2. Read the resulting timestamp and current `withdrawingPeriod`.
3. Wait until the contract permits finalization. The item remains disputable during this period.
4. In a new confirmation step, simulate and confirm `withdrawItem(itemID)`.

For the deployed Verified Agents implementations, `_doWithdrawItem` returns the item's full recorded ERC20 `stake` and native `arbitrationDeposit` to the submitter. Describe that as a 100% refund only for a successfully finalized voluntary withdrawal: gas and IPFS/upload costs are separate, and a challenge may delay withdrawal or award funds to the challenger. Do not describe withdrawal as immediate or guaranteed; re-check bytecode, state, and simulation first.

## Minimal ABIs

```solidity
function token() external view returns (address)
function submissionMinDeposit() external view returns (uint256)
function submissionPeriod() external view returns (uint256)
function reinclusionPeriod() external view returns (uint256)
function withdrawingPeriod() external view returns (uint256)
function arbitrationParamsCooldown() external view returns (uint256)
function arbitrator() external view returns (address)
function MULTIPLIER_DIVISOR() external view returns (uint256)
function challengeStakeMultiplier() external view returns (uint256)
function winnerStakeMultiplier() external view returns (uint256)
function loserStakeMultiplier() external view returns (uint256)
function sharedStakeMultiplier() external view returns (uint256)
function items(bytes32) external view returns (uint8,uint128,uint120,address,uint48,uint48,uint256)
function challenges(bytes32,uint256) external view returns (uint80,uint8,uint8,address,uint256,uint256)
function arbitrationParamsChanges(uint256) external view returns (uint48,bytes)
function getRoundAmountPaid(bytes32,uint256,uint256) external view returns (uint256[3])

function addItem(string,uint256) external payable
function challengeItem(bytes32,string) external payable
function submitEvidence(bytes32,string) external
function fundAppeal(bytes32,uint8) external payable
function startWithdrawItem(bytes32) external payable
function withdrawItem(bytes32) external payable
function withdrawFeesAndRewards(address,bytes32,uint120,uint256) external

function approve(address,uint256) external returns (bool)
function allowance(address,address) external view returns (uint256)
function balanceOf(address) external view returns (uint256)
function symbol() external view returns (string)
function decimals() external view returns (uint8)

function arbitrationCost(bytes) external view returns (uint256)
function appealCost(uint256,bytes) external view returns (uint256)
function appealPeriod(uint256) external view returns (uint256,uint256)
function currentRuling(uint256) external view returns (uint256)
```
