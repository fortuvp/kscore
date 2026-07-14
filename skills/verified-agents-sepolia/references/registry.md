# Sepolia Verified Agents registry

Use these constants only for routing. Read all mutable values live immediately before relying on them.

| Field | Value |
| --- | --- |
| Verification environment | Testnet |
| Chain | Ethereum Sepolia |
| Chain ID | `11155111` |
| Registry flavor | Stake Curate / `PermanentGTCR` / PGTCR |
| Registry | `0x3162df9669affa8b6b6ff2147afa052249f00447` |
| Goldsky | `https://api.goldsky.com/api/public/project_cmgx9all3003atlp2bqha1zif/subgraphs/pgtcr-sepolia/v0.0.2/gn` |
| Explorer | `https://sepolia.etherscan.io/address/0x3162df9669affa8b6b6ff2147afa052249f00447` |
| Curate | `https://curate.kleros.io/tcr/11155111/0x3162df9669affa8b6b6ff2147afa052249f00447` |

## Live retrieval

1. Call `eth_chainId` and require `0xaa36a7`.
2. Call `eth_getCode` for the registry and stop if the result is `0x`. The deployed registry is expected to be an EIP-1167 proxy: verify the `363d3d373d3d3d363d73<20-byte implementation>5af43d82803e903d91602b57fd5bf3` runtime shape, extract the implementation address, require non-empty implementation code, and then confirm the PGTCR hallmark reads. Stop if that shape or behavior changes unexpectedly.
3. Confirm the PGTCR hallmarks `token()` and `submissionMinDeposit()`.
4. Query the Goldsky registry entity using the lowercase registry address. Retrieve token, arbitrator, arbitration settings, MetaEvidence URI, periods, minimum stake, and all multipliers.
5. Fetch the latest applicable MetaEvidence URI, parse it, then fetch and read its `fileURI` policy.
6. Cross-check every transaction-critical mutable value onchain. Treat Goldsky as indexed discovery, not a substitute for current contract reads.

At the 2026-07-14 integration snapshot, Goldsky returned MetaEvidence `/ipfs/QmfTvSRuHowSXEHg7UHCQwi66hcUxsGmArjKRaJgYe2HV5` and policy `/ipfs/QmRP6M55GazrgyMpjsVNJ4HXFqZHqrrJzKXEyMJDEvBV4H`. These are diagnostic anchors only; do not assume they remain current.

## Agent source chain is separate

The registry is on Sepolia, but the ERC-8004 agent may be registered on another supported chain. Verify the agent against the source chain selected by the user. Encode the owner using that source chain in CAIP-10 form:

```text
eip155:<erc8004-source-chain-id>:<owner-address>
```

Use the fixed source-registry routing and ABI in [erc8004-source.md](erc8004-source.md). The source chain is mandatory because numeric ERC-8004 IDs are not globally unique.

## Known policy mismatch

The integration snapshot's Sepolia policy describes Agent Number as curator-assigned/not onchain. The live MetaEvidence simultaneously defines a numeric `Agent Number` column. Warn about the mismatch and use the numeric ERC-8004 agent ID as directed by this integration. Do not suppress the warning or treat it as permission to ignore any other policy requirement.

## Schema sanity check only

The snapshot contained `Agent Number`, `Agent URI`, `Owner`, and `Additional Info`, in that order. Never construct from this list. Deep-copy the current `metadata.columns` objects, including descriptions, types, and identifier flags, from live MetaEvidence.
