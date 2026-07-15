export type VerificationEnvironment = "testnet" | "mainnet";

export const DEFAULT_VERIFICATION_ENVIRONMENT: VerificationEnvironment = "testnet";
export const VERIFICATION_ENVIRONMENT_QUERY_PARAM = "verificationEnvironment";
export const VERIFICATION_ENVIRONMENT_STORAGE_KEY = "kscore.verificationEnvironment";

const SEPOLIA_CHAIN_ID = 11155111;
const ETHEREUM_CHAIN_ID = 1;

const DEFAULT_SEPOLIA_REGISTRY = "0x3162df9669affa8b6b6ff2147afa052249f00447" as const;
const DEFAULT_MAINNET_REGISTRY = "0x118155741eea23f56b3bd59b0c1342d5daaa6d07" as const;
const DEFAULT_SEPOLIA_SUBGRAPH =
  "https://api.goldsky.com/api/public/project_cmgx9all3003atlp2bqha1zif/subgraphs/pgtcr-sepolia/v0.0.2/gn";
const DEFAULT_MAINNET_SUBGRAPH =
  "https://api.goldsky.com/api/public/project_cmgx9all3003atlp2bqha1zif/subgraphs/pgtcr-mainnet/v0.0.1/gn";

export type VerificationDeployment = {
  environment: VerificationEnvironment;
  label: string;
  chainId: typeof SEPOLIA_CHAIN_ID | typeof ETHEREUM_CHAIN_ID;
  chainName: "Sepolia" | "Ethereum";
  registryAddress: `0x${string}`;
  subgraphUrl: string;
  rpcUrls: readonly string[];
  explorerBaseUrl: string;
  curateRegistryUrl: string;
  flavor: "pgtcr";
};

function unique(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => value?.trim() || "")
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}

const publicDeployments: Record<VerificationEnvironment, VerificationDeployment> = {
  testnet: {
    environment: "testnet",
    label: "Testnet",
    chainId: SEPOLIA_CHAIN_ID,
    chainName: "Sepolia",
    registryAddress: (process.env.NEXT_PUBLIC_PGTCR_SEPOLIA_REGISTRY_ADDRESS?.trim() ||
      DEFAULT_SEPOLIA_REGISTRY) as `0x${string}`,
    subgraphUrl:
      process.env.NEXT_PUBLIC_PGTCR_SEPOLIA_GOLDSKY_SUBGRAPH_URL?.trim() || DEFAULT_SEPOLIA_SUBGRAPH,
    rpcUrls: unique([
      process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://rpc.sepolia.org",
    ]),
    explorerBaseUrl: "https://sepolia.etherscan.io",
    curateRegistryUrl: `https://curate.kleros.io/tcr/${SEPOLIA_CHAIN_ID}/${
      process.env.NEXT_PUBLIC_PGTCR_SEPOLIA_REGISTRY_ADDRESS?.trim() || DEFAULT_SEPOLIA_REGISTRY
    }`,
    flavor: "pgtcr",
  },
  mainnet: {
    environment: "mainnet",
    label: "Mainnet",
    chainId: ETHEREUM_CHAIN_ID,
    chainName: "Ethereum",
    registryAddress: (process.env.NEXT_PUBLIC_PGTCR_MAINNET_REGISTRY_ADDRESS?.trim() ||
      DEFAULT_MAINNET_REGISTRY) as `0x${string}`,
    subgraphUrl:
      process.env.NEXT_PUBLIC_PGTCR_MAINNET_GOLDSKY_SUBGRAPH_URL?.trim() || DEFAULT_MAINNET_SUBGRAPH,
    rpcUrls: unique([
      process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL,
      "https://ethereum-rpc.publicnode.com",
      "https://eth.llamarpc.com",
    ]),
    explorerBaseUrl: "https://etherscan.io",
    curateRegistryUrl: `https://curate.kleros.io/tcr/${ETHEREUM_CHAIN_ID}/${
      process.env.NEXT_PUBLIC_PGTCR_MAINNET_REGISTRY_ADDRESS?.trim() || DEFAULT_MAINNET_REGISTRY
    }`,
    flavor: "pgtcr",
  },
};

export function isVerificationEnvironment(value: unknown): value is VerificationEnvironment {
  return value === "testnet" || value === "mainnet";
}

export function parseVerificationEnvironment(
  value: string | null | undefined,
  fallback: VerificationEnvironment = DEFAULT_VERIFICATION_ENVIRONMENT
): VerificationEnvironment {
  const normalized = value?.trim().toLowerCase();
  return isVerificationEnvironment(normalized) ? normalized : fallback;
}

export function getVerificationDeployment(
  environment: VerificationEnvironment = DEFAULT_VERIFICATION_ENVIRONMENT
): VerificationDeployment {
  return publicDeployments[environment];
}

export function getVerificationEnvironmentFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">
): VerificationEnvironment {
  return parseVerificationEnvironment(searchParams.get(VERIFICATION_ENVIRONMENT_QUERY_PARAM));
}

export function withVerificationEnvironment(
  href: string,
  environment: VerificationEnvironment
): string {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return href;

  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:\/\//i.test(href);
    const url = new URL(href, "https://kscore.local");
    url.searchParams.set(VERIFICATION_ENVIRONMENT_QUERY_PARAM, environment);
    return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}${VERIFICATION_ENVIRONMENT_QUERY_PARAM}=${environment}`;
  }
}

