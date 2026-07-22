# Ethereum mainnet Verified Agents registry

Use these constants for KSCORE routing. Read every mutable value live before relying on it.

| Field | Value |
| --- | --- |
| Verification environment | Mainnet |
| Chain | Ethereum mainnet |
| Chain ID | `1` (`0x1`) |
| Registry type | Stake Curate / `PermanentGTCR` / PGTCR |
| Registry | `0x118155741eea23f56b3bd59b0c1342d5daaa6d07` |
| Goldsky | `https://api.goldsky.com/api/public/project_cmgx9all3003atlp2bqha1zif/subgraphs/pgtcr-mainnet/v0.0.1/gn` |
| Explorer | `https://etherscan.io/address/0x118155741eea23f56b3bd59b0c1342d5daaa6d07` |
| Curate | `https://curate.kleros.io/tcr/1/0x118155741eea23f56b3bd59b0c1342d5daaa6d07` |

## Live checks

1. Call `eth_chainId` and require `0x1`.
2. Call `eth_getCode` for the registry and require non-empty bytecode.
3. Confirm the PGTCR reads `token()` and `submissionMinDeposit()`.
4. Use the lowercase registry address as the Goldsky registry entity ID.
5. Use Goldsky for indexed discovery and the chain for transaction-critical state.

The ERC-8004 source chain is selected independently from this verification chain. Numeric agent IDs are not globally unique, so always pair an agent ID with its explicit source chain.
