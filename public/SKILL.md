---
name: verified-agents
description: Discover and route the registry-specific KSCORE Verified Agents skills for the Stake Curate registries on Sepolia and Ethereum mainnet. These overlays provide fixed technical routing constants only.
---

# KSCORE Verified Agents skills

Use these local skills to select the correct KSCORE registry, explorer, indexed endpoint, and ERC-8004 source contracts. They do not assess agents or determine whether an operation is appropriate.

## Operating context

Before a registry operation, load the complete current [Kleros Skills package](https://skills.kleros.io/) from its [source repository](https://github.com/kleros/kleros-skills) and follow its `kleros-curate` Stake Curate instructions for contract mechanics.

Perform independent due diligence from current onchain state and authoritative sources. Confirm every address, contract, amount, period, fee, balance, allowance, and item state in the current session. These routing skills provide no assessment of an agent, transaction, or outcome.

## Choose the verification registry

Choose the verification registry independently from the ERC-8004 agent's source chain.

- [Verified Agents · Sepolia](/skills/verified-agents-sepolia/SKILL.md): Route ERC-8004 operations to the KSCORE Verified Agents Stake Curate registry on Ethereum Sepolia. This overlay supplies only fixed registry, explorer, subgraph, and ERC-8004 contract routing for 0x3162df9669affa8b6b6ff2147afa052249f00447. [Installable archive](/skills/verified-agents-sepolia.tar.gz).
- [Verified Agents · Mainnet](/skills/verified-agents-mainnet/SKILL.md): Route ERC-8004 operations to the KSCORE Verified Agents Stake Curate registry on Ethereum mainnet. This overlay supplies only fixed registry, explorer, subgraph, and ERC-8004 contract routing for 0x118155741eea23f56b3bd59b0c1342d5daaa6d07. [Installable archive](/skills/verified-agents-mainnet.tar.gz).
