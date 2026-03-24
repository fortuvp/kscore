# DEX8004

[ERC-8004](https://8004.org) · [Registration Guide](https://github.com/erc-8004/best-practices/blob/main/Registration.md) · [Reputation Guide](https://github.com/erc-8004/best-practices/blob/main/Reputation.md) · [Agent0 SDK](https://sdk.ag0.xyz/)

[![Project](https://img.shields.io/badge/Project-DEX8004-cyan)](#)

---

A demo application for exploring autonomous AI agents registered on the ERC-8004 protocol. Built as a learning resource for developers wanting to integrate with the ERC-8004 agent registry.

Maintainer: fortuvp

## What is ERC-8004?

[ERC-8004](https://8004.org) is a standard for registering autonomous AI agents on Ethereum. It provides:

- **On-chain registry** - Agents are registered with their metadata URI, owner, and operators
- **Off-chain metadata** - Agent capabilities, endpoints (MCP, A2A), and configuration stored on IPFS
- **Feedback system** - Users can leave feedback and ratings for agents
- **Protocol support** - Native support for MCP (Model Context Protocol) and A2A (Agent-to-Agent) endpoints

## Features

- 🔍 **Browse agents** - Paginated list with sorting and filtering
- 🔎 **Search** - Find agents by name
- 📋 **Agent details** - View full metadata, endpoints, statistics, and reviews
- 🏷️ **Protocol filtering** - Filter by MCP or A2A support
- ✅ **Kleros Curate verification (Sepolia)** - Agent ID (`key0`) ↔ registry item match
  - If **Registered**: green badge + **Claim violation** button (links to Curate item)
  - If **Not registered**: red badge + **Report an abuse** (Reality.eth workflow)
- 👛 **Wallet connect** - MetaMask / Rabby (injected) + WalletConnect
- 🛒 **Marketplace (Escrow)** - Make offers and complete sales via on-chain escrow
- 🧑‍⚖️ **Moderation** - View Reality questions, follow, answer, and request arbitration
- 🌙 **Dark/Light mode** - Theme toggle

## Getting Started

### Network
Browse supports ERC-8004 registries indexed on:
- Sepolia
- Ethereum mainnet
- Base mainnet
- BSC mainnet
- Polygon mainnet

Marketplace + moderation integrations (Escrow, Reality, Curate) remain **Sepolia-only**.

### Environment variables
Create `.env` (see existing patterns in the repo) with at least:

```bash
# WalletConnect (optional, enables WalletConnect button)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Optional: custom Sepolia RPC
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia.publicnode.com

# Optional: dedicated server-side RPCs for reputation freshness fallback
SEPOLIA_RPC_URL=
ETHEREUM_RPC_URL=
BASE_RPC_URL=
BSC_RPC_URL=
POLYGON_RPC_URL=

# Curate backend
ENVIO_SUBGRAPH_URL=

# The Graph gateway
THEGRAPH_API_KEY=

# Optional: override default ERC-8004 subgraph IDs per network
SEPOLIA_SUBGRAPH_KEY=
ETHEREUM_MAINNET_SUBGRAPH_KEY=
BASE_MAINNET_SUBGRAPH_KEY=
BSC_MAINNET_SUBGRAPH_KEY=
POLYGON_MAINNET_SUBGRAPH_KEY=

# Optional: on-chain reputation freshness fallback for agent detail APIs
FEATURE_REPUTATION_RPC_FALLBACK=1
FEATURE_REPUTATION_RPC_FALLBACK_SEPOLIA=
FEATURE_REPUTATION_RPC_FALLBACK_ETHEREUM=
FEATURE_REPUTATION_RPC_FALLBACK_BASE=
FEATURE_REPUTATION_RPC_FALLBACK_BSC=
FEATURE_REPUTATION_RPC_FALLBACK_POLYGON=
```

### Run
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Next.js 16** - App Router
- **React 19** - Client components where needed
- **TypeScript** - Full type safety
- **Tailwind CSS 4** - Styling
- **shadcn/ui** - UI components
- **graphql-request** - Subgraph queries
- **The Graph** - Indexed blockchain data

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Home page with search
│   ├── agents/
│   │   ├── page.tsx          # Agent list with filters
│   │   └── [id]/page.tsx     # Agent detail page
│   └── api/
│       └── agents/
│           ├── route.ts      # List/search agents API
│           └── [id]/route.ts # Single agent API
├── components/
│   ├── ui/                   # shadcn components
│   ├── navbar.tsx
│   ├── theme-provider.tsx
│   └── theme-toggle.tsx
├── lib/
│   ├── subgraph.handler.ts   # GraphQL queries & handlers
│   ├── format.ts             # Display formatters
│   └── utils.ts              # Tailwind utilities
└── types/
    └── agent.ts              # TypeScript interfaces
```

## Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  Next.js    │────▶│  The Graph  │
│  (React UI) │◀────│  API Routes │◀────│  Subgraph   │
└─────────────┘     └─────────────┘     └─────────────┘
```

1. UI components fetch from Next.js API routes
2. API routes call `subgraph.handler.ts` functions
3. Handler executes GraphQL queries against The Graph
4. Data flows back through the chain

## Key Files

| File | Purpose |
|------|---------|
| `lib/subgraph.handler.ts` | All GraphQL queries and data fetching |
| `types/agent.ts` | TypeScript interfaces matching subgraph schema |
| `lib/format.ts` | Address truncation, date formatting, protocol detection |

## Contracts (Sepolia)

- Kleros Escrow (Marketplace): `0x338f1A474e0FB0ae9E913cFA3d7c6Aa19b92015B`
- Reality proxy (arbitrator): `0x05B942fAEcfB3924970E3A28e0F230910CEDFF45`

## Kleros Curate toggle (GTCR vs PGTCR)

This demo supports **two different Curate backends**, toggled via env:

- **GTCR (Light Curate, Envio-indexed)**: items come from `LItem` and the agent is considered verified when `status === Registered`.
- **PGTCR (Permanent GTCR / Stake Curate, Goldsky)**: items come from `Item` and the frontend "Accepted" badge is computed **off-chain**.

**Important:** when switching between GTCR and PGTCR, both the **registry address** and the **subgraph schema mapping** change.

Env vars:
- `CURATE_MODE=gtcr|pgtcr`
- `GTCR_REGISTRY_ADDRESS=...`
- `PGTCR_REGISTRY_ADDRESS=...`

PGTCR acceptance rule (subgraph-side): an item displays as accepted when `status ∈ {Submitted, Reincluded}` and `includedAt + period < now` (where `period` is `submissionPeriod` for `Submitted` or `reinclusionPeriod` for `Reincluded`).

## Subgraph

Agent browsing is powered by The Graph gateway using the subgraph key for the selected network.
The API key is read from `.env` via `THEGRAPH_API_KEY`.

## Reputation Freshness Fallback

Agent detail APIs also support an optional on-chain fallback for feedback freshness on the supported browse networks:

- Sepolia
- Ethereum mainnet
- Base mainnet
- BSC mainnet
- Polygon mainnet

How it works:

- The app still uses the configured subgraph as the primary source of truth.
- If the subgraph is behind chain head, the detail fetch path merges newer `ReputationRegistry` events from RPC on top of the subgraph response.
- For review cards on the single-agent page, the detail fetch path also tries to hydrate missing `feedbackFile` content directly from `feedbackURI` when the subgraph has not populated that file entity yet.
- This currently applies to agent detail lookups, not bulk list/stat endpoints.

Configuration:

- `FEATURE_REPUTATION_RPC_FALLBACK=1|0` turns the fallback on or off globally.
- `FEATURE_REPUTATION_RPC_FALLBACK_<NETWORK>=1|0` overrides the global flag per network.
- `SEPOLIA_RPC_URL`, `ETHEREUM_RPC_URL`, `BASE_RPC_URL`, `BSC_RPC_URL`, and `POLYGON_RPC_URL` let you provide dedicated server-side RPCs.
- If a chain-specific RPC is not set, the server falls back to the default public RPC shipped by `viem` for that chain.

Operational note:

- This protects feedback/review freshness for single-agent detail requests when a subgraph lags.
- Review text hydration is best-effort and only works for fetchable JSON/IPFS feedback URIs. Null, custom-protocol, or access-controlled URIs remain unchanged.
- It is intentionally scoped to keep the runtime cost and blast radius low.

## Resources

Learn how to build and register on-chain agents:

| Resource | Description |
|----------|-------------|
| [ERC-8004 Spec](https://github.com/erc-8004/best-practices/blob/main/src/ERC8004SPEC.md) | Reference specification |
| [Registration Guide](https://github.com/erc-8004/best-practices/blob/main/Registration.md) | How to register agents with proper metadata |
| [Reputation Guide](https://github.com/erc-8004/best-practices/blob/main/Reputation.md) | Feedback system and reputation signals |
| [Agent0 SDK](https://sdk.ag0.xyz/) | SDK for building ERC-8004 agents |
