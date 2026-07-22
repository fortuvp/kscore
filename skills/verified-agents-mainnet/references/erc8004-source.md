# ERC-8004 source-chain routing

Select the ERC-8004 source chain independently from the KSCORE verification registry. Never merge agents that share a numeric ID across different chains.

## Supported source registries

| Source network | Chain ID | Identity | Reputation | Validation |
| --- | ---: | --- | --- | --- |
| Ethereum | `1` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |
| Sepolia | `11155111` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |
| Base | `8453` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |
| BNB Smart Chain | `56` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |
| Polygon | `137` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004Cc8439f36fd5F9f049D9fF86523Df6dAAB58` |

## Identity reads

Confirm the selected chain ID and non-empty code at the identity address, then pin one block for these reads:

```solidity
function ownerOf(uint256 agentId) external view returns (address)
function tokenURI(uint256 agentId) external view returns (string)
```

A revert means that the numeric agent ID does not exist on the selected source chain. Report the source chain, block number, identity address, owner, and exact onchain URI.

Encode the owner as one CAIP-10 account:

```text
eip155:<source-chain-id>:<owner-address>
```

Re-read `ownerOf(agentId)` and `tokenURI(agentId)` immediately before preparing a registry write because either value can change.
