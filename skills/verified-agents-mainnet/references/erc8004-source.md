# ERC-8004 source identity verification

The verification registry is fixed by `registry.md`, but the submitted ERC-8004 identity is selected independently. Never infer the source chain from the verification environment, and never merge same-numbered agents across chains.

## Supported source registries

| Source network | Chain ID | Scan from | Identity | Reputation | Validation |
| --- | ---: | ---: | --- | --- | --- |
| Ethereum | `1` | `24300000` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |
| Sepolia | `11155111` | `10000000` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |
| Base | `8453` | `41600000` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |
| BNB Smart Chain | `56` | `79000000` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |
| Polygon | `137` | `82000000` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |

Confirm the selected chain ID and non-empty code at the listed address before trusting it. Use a user-configured or reputable RPC for that chain and report the block number used. These routing constants are not permission to search all chains and pick a convenient registration: require an explicit source-chain choice.

## Minimal identity ABI

```solidity
function ownerOf(uint256 agentId) external view returns (address)
function tokenURI(uint256 agentId) external view returns (string)
```

At one pinned block, read `ownerOf(agentId)` and `tokenURI(agentId)`. A revert means the agent does not exist on that source chain. Fetch the URI through its native HTTPS location or multiple IPFS gateways, reject HTML/error bodies, parse JSON, and preserve the onchain URI even if metadata is unavailable. Do not substitute indexed owner or URI values for these live reads when preparing a write.

For `data:` URIs, split at the first comma and allow only JSON media types, or gzip whose decompressed body is JSON. Percent-decode a non-base64 payload; strictly base64-decode when the metadata contains `;base64`. Detect gzip from an explicit gzip media type/parameter or the `1f8b` magic bytes, decompress with a 5 MiB output ceiling, require valid UTF-8, then parse exactly one JSON value. Reject invalid padding, unknown encodings, trailing non-whitespace bytes, recursive `data:` indirection, decompression-limit overflow, HTML, or executable content. Hash and report the raw URI payload before decoding. Resolve `ar://<id>` through `https://arweave.net/<id>` with the same response checks.

Encode the submission owner as exactly one CAIP-10 account:

```text
eip155:<selected-source-chain-id>:<current-ownerOf-address>
```

The live schema has one rich-address value. If metadata lists registrations on other chains, mention them factually in Additional Info; do not concatenate multiple accounts into the Owner field. Re-read owner and URI immediately before final draft approval because either can change.

## Evidence checklist

Create a policy checklist with one row per live policy criterion, the supporting source, observation time/block, and an explicit pass, fail, or unknown result. Missing or contradictory evidence is `unknown`, not compliance. Do not turn the editable Additional Info summary into an unsupported assurance.

For reputation and validation evidence, query exact agent-scoped logs from the table's scan floor to the pinned block, using adaptive block ranges. Apply revocations before counting feedback and retain response links; do not invent a score when the policy does not define one.

```solidity
event NewFeedback(uint256 indexed agentId,address indexed clientAddress,uint64 feedbackIndex,int128 value,uint8 valueDecimals,string indexed indexedTag1,string tag1,string tag2,string endpoint,string feedbackURI,bytes32 feedbackHash)
event FeedbackRevoked(uint256 indexed agentId,address indexed clientAddress,uint64 indexed feedbackIndex)
event ResponseAppended(uint256 indexed agentId,address indexed clientAddress,uint64 feedbackIndex,address indexed responder,string responseURI,bytes32 responseHash)
event ValidationRequest(address indexed validatorAddress,uint256 indexed agentId,string requestURI,bytes32 indexed requestHash)
event ValidationResponse(address indexed validatorAddress,uint256 indexed agentId,bytes32 indexed requestHash,uint8 response,string responseURI,bytes32 responseHash,string tag)
```

For payment or service claims, inspect only endpoints declared by the registration using safe non-transactional requests; never send funds, credentials, or executable payloads. Record the endpoint, response time, TLS/result, and any x402 or service declaration. Metadata is a claim, not proof. Malware, operational safety, and offchain identity assertions require a named independent report or user-supplied evidence that the live policy accepts; otherwise mark them unknown and stop a submission whose policy requires them.
