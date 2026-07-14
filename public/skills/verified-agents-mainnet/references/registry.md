# Ethereum mainnet Verified Agents registry

Use these constants only for routing. Read all mutable values live immediately before relying on them.

| Field | Value |
| --- | --- |
| Verification environment | Mainnet |
| Chain | Ethereum mainnet |
| Chain ID | `1` |
| Registry flavor | Stake Curate / `PermanentGTCR` / PGTCR |
| Registry | `0x118155741eea23f56b3bd59b0c1342d5daaa6d07` |
| Goldsky | `https://api.goldsky.com/api/public/project_cmgx9all3003atlp2bqha1zif/subgraphs/pgtcr-mainnet/v0.0.1/gn` |
| Explorer | `https://etherscan.io/address/0x118155741eea23f56b3bd59b0c1342d5daaa6d07` |
| Curate | `https://curate.kleros.io/tcr/1/0x118155741eea23f56b3bd59b0c1342d5daaa6d07` |

## Live retrieval

1. Call `eth_chainId` and require `0x1`.
2. Call `eth_getCode` for the registry and stop if the result is `0x`. The deployed registry is expected to be an EIP-1167 proxy: verify the `363d3d373d3d3d363d73<20-byte implementation>5af43d82803e903d91602b57fd5bf3` runtime shape, extract the implementation address, require non-empty implementation code, and then confirm the PGTCR hallmark reads. Stop if that shape or behavior changes unexpectedly.
3. Confirm the PGTCR hallmarks `token()` and `submissionMinDeposit()`.
4. Query the Goldsky registry entity using the lowercase registry address. Retrieve token, arbitrator, arbitration settings, MetaEvidence URI, periods, minimum stake, and all multipliers.
5. Fetch the latest applicable MetaEvidence URI, parse it, then fetch and read its `fileURI` policy.
6. Cross-check every transaction-critical mutable value onchain. Treat Goldsky as indexed discovery, not a substitute for current contract reads.

At the 2026-07-14 integration snapshot, Goldsky returned MetaEvidence `/ipfs/QmdUQpQWxUZashHxA2eHgE8DhKGGnx9ugj2LJAhHxva3Cy` and policy `/ipfs/QmVa4PtFVHHiDLG5iH42MZpn1Xfb97U6zQd6cGP7LGF5sK`. These are diagnostic anchors only; do not assume they remain current.

## Agent source chain is separate

The verification registry is on Ethereum mainnet, but the ERC-8004 agent may be registered on another supported chain. Verify the agent against the source chain selected by the user. Encode the owner using that source chain in CAIP-10 form:

```text
eip155:<erc8004-source-chain-id>:<owner-address>
```

Use the fixed source-registry routing and ABI in [erc8004-source.md](erc8004-source.md). The source chain is mandatory because numeric ERC-8004 IDs are not globally unique.

## Schema sanity check only

The snapshot contained `Agent Number`, `Agent URI`, `Owner`, and `Additional Info`, in that order. Never construct from this list. Deep-copy the current `metadata.columns` objects, including descriptions, types, and identifier flags, from live MetaEvidence.

## Real-funds warning

This registry uses production assets and ETH. Before any upload or write, show the sender, token symbol and address, stake amount, native arbitration fee, gas estimate, registry, and chain. Values must come from the current session's live reads.
