# Sepolia Verified Agents registry

Use these constants for KSCORE routing. Read every mutable value live before relying on it.

| Field | Value |
| --- | --- |
| Verification environment | Testnet |
| Chain | Ethereum Sepolia |
| Chain ID | `11155111` (`0xaa36a7`) |
| Registry type | Stake Curate / `PermanentGTCR` / PGTCR |
| Registry | `0x3162df9669affa8b6b6ff2147afa052249f00447` |
| Goldsky | `https://api.goldsky.com/api/public/project_cmgx9all3003atlp2bqha1zif/subgraphs/pgtcr-sepolia/v0.0.2/gn` |
| Explorer | `https://sepolia.etherscan.io/address/0x3162df9669affa8b6b6ff2147afa052249f00447` |
| Curate | `https://curate.kleros.io/tcr/11155111/0x3162df9669affa8b6b6ff2147afa052249f00447` |

## Live checks

1. Call `eth_chainId` and require `0xaa36a7`.
2. Call `eth_getCode` for the registry and require non-empty bytecode.
3. Confirm the PGTCR reads `token()` and `submissionMinDeposit()`.
4. Use the lowercase registry address as the Goldsky registry entity ID.
5. Use Goldsky for indexed discovery and the chain for transaction-critical state.

The ERC-8004 source chain is selected independently from this verification chain. Numeric agent IDs are not globally unique, so always pair an agent ID with its explicit source chain.
