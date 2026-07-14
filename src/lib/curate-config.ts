import {
  DEFAULT_VERIFICATION_ENVIRONMENT,
  getVerificationDeployment,
  type VerificationDeployment,
  type VerificationEnvironment,
} from "@/lib/verification-environment";

export type CurateMode = "gtcr" | "pgtcr";
export type PgtcrDeployment = VerificationDeployment;

function first(...values: Array<string | null | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean);
}

function unique(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => value?.trim() || "")
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}

/**
 * Resolves one Stake Curate / PermanentGTCR deployment. Testnet accepts the
 * original single-registry environment variables as backwards-compatible aliases.
 */
export function getPgtcrDeployment(
  environment: VerificationEnvironment = DEFAULT_VERIFICATION_ENVIRONMENT
): PgtcrDeployment {
  const publicDeployment = getVerificationDeployment(environment);

  if (environment === "mainnet") {
    const registryAddress = first(
      process.env.PGTCR_MAINNET_REGISTRY_ADDRESS,
      process.env.NEXT_PUBLIC_PGTCR_MAINNET_REGISTRY_ADDRESS,
      publicDeployment.registryAddress
    ) as `0x${string}`;
    return {
      ...publicDeployment,
      registryAddress,
      subgraphUrl:
        first(
          process.env.PGTCR_MAINNET_GOLDSKY_SUBGRAPH_URL,
          process.env.NEXT_PUBLIC_PGTCR_MAINNET_GOLDSKY_SUBGRAPH_URL,
          publicDeployment.subgraphUrl
        ) || publicDeployment.subgraphUrl,
      rpcUrls: unique([
        process.env.ETHEREUM_RPC_URL,
        process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL,
        ...publicDeployment.rpcUrls,
      ]),
      curateRegistryUrl: `https://curate.kleros.io/tcr/${publicDeployment.chainId}/${registryAddress}`,
    };
  }

  const registryAddress = first(
    process.env.PGTCR_SEPOLIA_REGISTRY_ADDRESS,
    process.env.PGTCR_TESTNET_REGISTRY_ADDRESS,
    process.env.PGTCR_REGISTRY_ADDRESS,
    process.env.NEXT_PUBLIC_PGTCR_SEPOLIA_REGISTRY_ADDRESS,
    publicDeployment.registryAddress
  ) as `0x${string}`;
  return {
    ...publicDeployment,
    registryAddress,
    subgraphUrl:
      first(
        process.env.PGTCR_SEPOLIA_GOLDSKY_SUBGRAPH_URL,
        process.env.PGTCR_TESTNET_GOLDSKY_SUBGRAPH_URL,
        process.env.PGTCR_GOLDSKY_SUBGRAPH_URL,
        process.env.NEXT_PUBLIC_PGTCR_SEPOLIA_GOLDSKY_SUBGRAPH_URL,
        publicDeployment.subgraphUrl
      ) || publicDeployment.subgraphUrl,
    rpcUrls: unique([
      process.env.SEPOLIA_RPC_URL,
      process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
      ...publicDeployment.rpcUrls,
    ]),
    curateRegistryUrl: `https://curate.kleros.io/tcr/${publicDeployment.chainId}/${registryAddress}`,
  };
}

export function getCurateMode(): CurateMode {
  const raw = process.env.CURATE_MODE?.trim().toLowerCase();
  if (!raw) return "pgtcr";
  if (raw === "gtcr" || raw === "pgtcr") return raw;
  throw new Error(`Invalid CURATE_MODE: ${process.env.CURATE_MODE}`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

/** @deprecated Use getPgtcrDeployment(environment).subgraphUrl for PGTCR. */
export function getCurateSubgraphUrl(
  mode = getCurateMode(),
  environment: VerificationEnvironment = DEFAULT_VERIFICATION_ENVIRONMENT
): string {
  return mode === "gtcr" ? requireEnv("ENVIO_SUBGRAPH_URL") : getPgtcrDeployment(environment).subgraphUrl;
}

/** @deprecated Use getPgtcrDeployment(environment).registryAddress for PGTCR. */
export function getCurateRegistryAddress(
  mode = getCurateMode(),
  environment: VerificationEnvironment = DEFAULT_VERIFICATION_ENVIRONMENT
): string {
  return mode === "gtcr" ? requireEnv("GTCR_REGISTRY_ADDRESS") : getPgtcrDeployment(environment).registryAddress;
}

export function getGoldskyApiKey(environment?: VerificationEnvironment): string | undefined {
  if (environment === "mainnet") {
    return first(process.env.PGTCR_MAINNET_GOLDSKY_API_KEY, process.env.GOLDSKY_API_KEY);
  }
  if (environment === "testnet") {
    return first(process.env.PGTCR_SEPOLIA_GOLDSKY_API_KEY, process.env.GOLDSKY_API_KEY);
  }
  return first(process.env.GOLDSKY_API_KEY);
}
