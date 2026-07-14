export const SEPOLIA_CHAIN_ID = 11155111;

const PUBLIC_ADDRESSES = {
  NEXT_PUBLIC_REALITY_PROXY_ADDRESS: process.env.NEXT_PUBLIC_REALITY_PROXY_ADDRESS,
  NEXT_PUBLIC_CURATE_REGISTRY_ADDRESS: process.env.NEXT_PUBLIC_CURATE_REGISTRY_ADDRESS,
  NEXT_PUBLIC_AGENT_REGISTRY_SEPOLIA_ADDRESS: process.env.NEXT_PUBLIC_AGENT_REGISTRY_SEPOLIA_ADDRESS,
} as const;

function requireAddress(name: keyof typeof PUBLIC_ADDRESSES): `0x${string}` {
  const value = PUBLIC_ADDRESSES[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value as `0x${string}`;
}

export const REALITY_PROXY_ADDRESS = requireAddress("NEXT_PUBLIC_REALITY_PROXY_ADDRESS");

// Curate registry (publicly readable and used in UI links)
export const CURATE_REGISTRY_ADDRESS = requireAddress("NEXT_PUBLIC_CURATE_REGISTRY_ADDRESS");

// ERC-8004 agent registry used for ownership transfer actions.
export const AGENT_REGISTRY_SEPOLIA_ADDRESS = requireAddress("NEXT_PUBLIC_AGENT_REGISTRY_SEPOLIA_ADDRESS");
