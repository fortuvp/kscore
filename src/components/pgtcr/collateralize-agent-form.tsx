"use client";

import * as React from "react";
import {
  Copy,
  ExternalLink,
  Rocket,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits, parseEventLogs } from "viem";

import PermanentGTCRAbi from "@/lib/abi/PermanentGTCR.json";
import { ERC20_ABI } from "@/lib/abi/erc20";
import { IARBITRATOR_ABI } from "@/lib/abi/iArbitrator";
import { getAgentSubgraphLabel, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { executeConfirmedTransaction } from "@/lib/confirmed-transaction";
import { fetchIpfsJson, ipfsToGatewayUrl, uploadJsonToIpfs } from "@/lib/ipfs";
import {
  buildPgtcrItemValues,
  isPgtcrAddressColumn,
  normalizePgtcrColumnKey,
  parseStakeDeposit,
  type PgtcrSchemaColumn,
} from "@/lib/pgtcr-submission";

import { InfoTooltip } from "@/components/info-tooltip";
import {
  SubmissionReviewDialog,
  type SubmissionPreview,
  type SubmissionSigningPhase,
} from "@/components/pgtcr/submission-review-dialog";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type MetaEvidenceJson = {
  fileURI?: string;
  metadata?: { columns?: PgtcrSchemaColumn[] };
};

type RegistryApiResponse =
  | {
      success: true;
      verificationEnvironment?: "testnet" | "mainnet";
      chainId?: number;
      registry: {
        id: string;
        token: string;
        tokenSymbol?: string | null;
        tokenDecimals?: number | null;
        submissionMinDeposit: string;
        withdrawingPeriod?: string;
        arbitrator: { id: string };
        arbitrationSettings: Array<{
          metaEvidenceURI: string;
          arbitratorExtraData: string;
          metadata?: { policyURI?: string | null } | null;
        }>;
      };
    }
  | { success: false; error: string };

type CollateralizeAgentFormProps = {
  agentId: string;
  sourceNetwork: AgentSubgraphNetwork;
  sourceChainId: number;
  prefill?: {
    agentURI?: string | null;
    owner?: string | null;
    chainId?: string | number | null;
    additionalInfo?: string | null;
  };
  autoFilledAgentId?: string | null;
  autoFillLoading?: boolean;
  onAutoFill?: (agentId: string) => void | Promise<void>;
  onSubmitted?: () => void;
  onCancel?: () => void;
};

const FORM_CONTROL_CLASS =
  "border-white/15 bg-[#0b1220] shadow-inner shadow-black/20 hover:border-white/25 focus-visible:border-cyan-400/60";

const CAIP_EIP155_CHAIN_OPTIONS = [
  { label: "Ethereum", chainId: 1 },
  { label: "Sepolia", chainId: 11155111 },
  { label: "Gnosis", chainId: 100 },
  { label: "Arbitrum One", chainId: 42161 },
  { label: "Optimism", chainId: 10 },
  { label: "Moonbeam", chainId: 1284 },
  { label: "MegaETH", chainId: 4326 },
  { label: "PulseChain", chainId: 369 },
  { label: "Avalanche C-Chain", chainId: 43114 },
  { label: "Base", chainId: 8453 },
  { label: "Linea", chainId: 59144 },
  { label: "Scroll", chainId: 534352 },
  { label: "Celo", chainId: 42220 },
  { label: "Zk Sync", chainId: 324 },
  { label: "Blast", chainId: 81457 },
  { label: "Hyperliquid", chainId: 998 },
  { label: "BSC", chainId: 56 },
  { label: "Polygon", chainId: 137 },
] as const;

function getPrefillChainId(value: string | number | null | undefined, fallbackChainId: number) {
  const raw = String(value || "").trim();
  if (!raw) return String(fallbackChainId);
  if (raw.startsWith("eip155:")) return raw.split(":")[1] || String(fallbackChainId);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : String(fallbackChainId);
}

function getPrefillTextValue(
  label: string,
  prefill: CollateralizeAgentFormProps["prefill"]
) {
  const normalized = label.trim().toLowerCase();
  if (normalized === "key1" || normalized.includes("agent uri") || normalized.includes("registration uri")) {
    return prefill?.agentURI?.trim() || "";
  }
  if (normalized.includes("additional") || normalized.includes("summary")) {
    return prefill?.additionalInfo?.trim() || "";
  }
  return "";
}

function formatPeriod(value?: string) {
  const seconds = Number(value || "0");
  if (!Number.isFinite(seconds) || seconds <= 0) return "the registry's live waiting period";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days) return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours}h` : ""}`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h${minutes ? ` ${minutes}m` : ""}`;
}

export function CollateralizeAgentForm(props: CollateralizeAgentFormProps) {
  const { environment, deployment } = useVerificationEnvironment();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: deployment.chainId });
  const { writeContractAsync } = useWriteContract();
  const [draftAgentId, setDraftAgentId] = React.useState(props.agentId);
  const [loading, setLoading] = React.useState(false);
  const [registry, setRegistry] = React.useState<RegistryApiResponse | null>(null);
  const [columns, setColumns] = React.useState<PgtcrSchemaColumn[] | null>(null);
  const [policyUri, setPolicyUri] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [approvalConfirmed, setApprovalConfirmed] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [submissionPreview, setSubmissionPreview] = React.useState<SubmissionPreview | null>(null);
  const [signingPhase, setSigningPhase] = React.useState<SubmissionSigningPhase>("idle");
  const [signingError, setSigningError] = React.useState<string | null>(null);

  React.useEffect(() => setDraftAgentId(props.agentId), [props.agentId]);

  const registryAddress = registry && registry.success ? (registry.registry.id as `0x${string}`) : undefined;
  const tokenAddress = registry && registry.success ? (registry.registry.token as `0x${string}`) : undefined;
  const arbitrationSetting = registry && registry.success ? registry.registry.arbitrationSettings?.[0] : undefined;
  const arbitratorAddress =
    registry && registry.success ? (registry.registry.arbitrator.id as `0x${string}`) : undefined;
  const arbitratorExtraData = arbitrationSetting?.arbitratorExtraData as `0x${string}` | undefined;
  const submissionMinDeposit = registry && registry.success ? BigInt(registry.registry.submissionMinDeposit || "0") : 0n;
  const onRequiredChain = chainId === deployment.chainId;

  const decimalsRead = useReadContract({
    chainId: deployment.chainId,
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: Boolean(tokenAddress) },
  });
  const symbolRead = useReadContract({
    chainId: deployment.chainId,
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "symbol",
    query: { enabled: Boolean(tokenAddress) },
  });
  const resolvedTokenDecimals =
    (decimalsRead.data as number | undefined) ??
    (registry && registry.success ? registry.registry.tokenDecimals ?? undefined : undefined) ??
    18;
  const resolvedTokenSymbol =
    (symbolRead.data as string | undefined) ||
    (registry && registry.success ? registry.registry.tokenSymbol || undefined : undefined) ||
    "TOKEN";

  const allowanceRead = useReadContract({
    chainId: deployment.chainId,
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && registryAddress ? [address, registryAddress] : undefined,
    query: { enabled: Boolean(address && tokenAddress && registryAddress) },
  });
  const tokenBalanceRead = useReadContract({
    chainId: deployment.chainId,
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && tokenAddress) },
  });
  const arbitrationCostRead = useReadContract({
    chainId: deployment.chainId,
    address: arbitratorAddress,
    abi: IARBITRATOR_ABI,
    functionName: "arbitrationCost",
    args: arbitratorExtraData ? [arbitratorExtraData] : undefined,
    query: { enabled: Boolean(arbitratorAddress && arbitratorExtraData) },
  });
  const nativeBalance = useBalance({
    address,
    chainId: deployment.chainId,
    query: { enabled: Boolean(address) },
  }).data?.value;

  React.useEffect(() => {
    setApprovalConfirmed(false);
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const query = new URLSearchParams({ verificationEnvironment: environment });
        const response = await fetch(`/api/pgtcr/registry?${query}`, { cache: "no-store" });
        const json = (await response.json()) as RegistryApiResponse;
        if (cancelled) return;
        if (!json.success) throw new Error(json.error);
        setRegistry(json);

        const setting = json.registry.arbitrationSettings?.[0];
        const metaEvidenceUri = setting?.metaEvidenceURI;
        if (!metaEvidenceUri) throw new Error("Registry meta-evidence URI is missing.");
        const metaEvidence = await fetchIpfsJson<MetaEvidenceJson>(metaEvidenceUri);
        if (cancelled) return;
        const nextColumns = (metaEvidence?.metadata?.columns || []).filter((column) => column?.label?.trim());
        setColumns(nextColumns);
        setPolicyUri(setting?.metadata?.policyURI || metaEvidence?.fileURI || null);

        const prefill = props.prefill;
        const initial: Record<string, string> = {};
        for (const column of nextColumns) {
          const key = normalizePgtcrColumnKey(column.label);
          initial[key] = getPrefillTextValue(column.label, prefill);
          if (isPgtcrAddressColumn(column)) {
            initial[`${key}__chain`] = getPrefillChainId(prefill?.chainId, props.sourceChainId);
            initial[`${key}__address`] = prefill?.owner?.trim() || "";
          }
        }
        if (nextColumns[0]) initial[normalizePgtcrColumnKey(nextColumns[0].label)] = props.agentId;
        setValues(initial);
      } catch (error) {
        if (!cancelled) {
          setRegistry(null);
          setColumns([]);
          toast.error(error instanceof Error ? error.message : "Failed to load the verification registry.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [environment, props.agentId, props.prefill, props.sourceChainId]);

  const depositInput = values.__deposit ?? "";
  const depositResult = React.useMemo(
    () => parseStakeDeposit(depositInput, resolvedTokenDecimals, submissionMinDeposit),
    [depositInput, resolvedTokenDecimals, submissionMinDeposit]
  );
  React.useEffect(() => {
    setApprovalConfirmed(false);
  }, [address, depositInput, environment, registryAddress, tokenAddress]);
  const deposit = depositResult.value ?? 0n;
  const allowance = allowanceRead.data as bigint | undefined;
  const tokenBalance = tokenBalanceRead.data as bigint | undefined;
  const arbitrationCost = arbitrationCostRead.data as bigint | undefined;
  const needsApproval = Boolean(depositResult.value !== null && allowance !== undefined && allowance < deposit);
  const hasEnoughTokenBalance = tokenBalance === undefined || tokenBalance >= deposit;
  const hasEnoughNativeBalance =
    arbitrationCost === undefined || nativeBalance === undefined || nativeBalance >= arbitrationCost;

  async function approveStake(approvedDeposit: bigint) {
    if (!publicClient || !address || !tokenAddress || !registryAddress) {
      throw new Error("Token approval data is not ready.");
    }
    toast.message("Confirm the collateral approval in your wallet…");
    await executeConfirmedTransaction({
      simulate: async () =>
        (
          await publicClient.simulateContract({
            account: address,
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [registryAddress, approvedDeposit],
          })
        ).request,
      write: (request) => writeContractAsync(request),
      wait: (hash) => publicClient.waitForTransactionReceipt({ hash }),
    });
    await allowanceRead.refetch();
    setApprovalConfirmed(true);
    toast.success(`${resolvedTokenSymbol} collateral approved.`);
  }

  async function copyTokenAddress() {
    if (!tokenAddress) return;
    try {
      await navigator.clipboard.writeText(tokenAddress);
      toast.success("Stake token address copied.");
    } catch {
      toast.error("Failed to copy the token address.");
    }
  }

  async function confirmNoDuplicate(agentId: string) {
    const query = new URLSearchParams({
      agentId,
      network: props.sourceNetwork,
      verificationEnvironment: environment,
    });
    const response = await fetch(`/api/kleros/verification?${query}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok || !json?.success) {
      throw new Error(json?.error || "Could not confirm whether this agent is already submitted.");
    }
    if (json.found && json.status !== "Absent") {
      throw new Error(`This agent already has a ${String(json.status || "current").toLowerCase()} registry item.`);
    }
  }

  function prepareSubmission(): SubmissionPreview | null {
    if (!isConnected || !address) {
      toast.error("Connect your wallet to submit.");
      return null;
    }
    if (!onRequiredChain) {
      toast.error(`Switch to ${deployment.chainName}.`);
      return null;
    }
    if (!publicClient || !registryAddress || !tokenAddress) {
      toast.error("Registry data is not ready.");
      return null;
    }
    if (arbitrationCost === undefined) {
      toast.error("The live arbitration fee is not available.");
      return null;
    }
    if (allowance === undefined) {
      toast.error("The token approval status is still loading.");
      return null;
    }
    if (depositResult.error || depositResult.value === null) {
      toast.error(depositResult.error || "Invalid stake.");
      return null;
    }
    if (!hasEnoughTokenBalance) {
      toast.error(`Insufficient ${resolvedTokenSymbol} balance.`);
      return null;
    }
    if (!hasEnoughNativeBalance) {
      toast.error("Insufficient ETH for the arbitration fee.");
      return null;
    }
    if (!columns?.length) {
      toast.error("Registry schema columns are unavailable.");
      return null;
    }

    const built = buildPgtcrItemValues({ columns, agentId: draftAgentId, values });
    if (!built.values) {
      toast.error(built.error || "Review the form fields.");
      return null;
    }
    if (props.onAutoFill && props.autoFilledAgentId !== draftAgentId.trim()) {
      toast.error("Auto-fill and review the current agent number before submitting.");
      return null;
    }

    return {
      values: built.values,
      deposit: depositResult.value,
      arbitrationCost,
      approvalRequired: needsApproval && !approvalConfirmed,
    };
  }

  function openSubmissionReview() {
    const nextPreview = prepareSubmission();
    if (!nextPreview) return;
    setSubmissionPreview(nextPreview);
    setSigningPhase("idle");
    setSigningError(null);
    setReviewOpen(true);
  }

  async function startSigning() {
    const nextPreview = prepareSubmission();
    if (!nextPreview || !columns || !publicClient || !address || !registryAddress) return;

    setSubmissionPreview(nextPreview);
    setSigningError(null);
    setSigningPhase("checking");
    setLoading(true);
    try {
      const canonicalAgentId = nextPreview.values[normalizePgtcrColumnKey(columns[0].label)];
      await confirmNoDuplicate(canonicalAgentId);

      if (needsApproval && !approvalConfirmed) {
        setSigningPhase("approving");
        await approveStake(nextPreview.deposit);
      }

      const itemUri = await uploadJsonToIpfs(
        { columns, values: nextPreview.values },
        { operation: "item", pinToGraph: false, filename: "item.json" }
      );
      setSigningPhase("submitting");
      toast.message("Confirm the registry submission in your wallet…");
      const { hash, receipt } = await executeConfirmedTransaction({
        simulate: async () =>
          (
            await publicClient.simulateContract({
              account: address,
              address: registryAddress,
              abi: PermanentGTCRAbi,
              functionName: "addItem",
              args: [itemUri, nextPreview.deposit],
              value: nextPreview.arbitrationCost,
            })
          ).request,
        write: (request) => writeContractAsync(request),
        wait: (transactionHash) => publicClient.waitForTransactionReceipt({ hash: transactionHash }),
      });

      let registryStateRefreshed = false;
      try {
        const newItemLog = parseEventLogs({
          abi: PermanentGTCRAbi,
          eventName: "NewItem",
          logs: receipt.logs,
          strict: true,
        })[0];
        const itemID = (
          newItemLog as typeof newItemLog & { args?: { _itemID?: `0x${string}` } }
        )?.args?._itemID;
        await Promise.all([
          allowanceRead.refetch(),
          itemID
            ? publicClient.readContract({
                address: registryAddress,
                abi: PermanentGTCRAbi,
                functionName: "items",
                args: [itemID],
              })
            : Promise.reject(new Error("Confirmed submission did not expose a NewItem event.")),
        ]);
        registryStateRefreshed = true;
      } catch {
        // The receipt is authoritative. Public RPC/indexer reads can lag briefly after confirmation.
      }

      toast.success("Agent submission confirmed.");
      if (!registryStateRefreshed) {
        toast.message("Confirmed on-chain; the registry state refresh is still catching up.");
      }
      toast.message(
        <a
          href={`${deployment.explorerBaseUrl}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          View transaction
        </a>
      );
      setSigningPhase("complete");
      props.onSubmitted?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed.";
      setSigningError(message);
      setSigningPhase("idle");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const hasCurrentAutoFill = Boolean(
    draftAgentId.trim() && props.autoFilledAgentId === draftAgentId.trim()
  );
  const balanceIssues = [
    isConnected && onRequiredChain && !hasEnoughTokenBalance
      ? `Need ${formatUnits(deposit, resolvedTokenDecimals)} ${resolvedTokenSymbol} for the stake.`
      : null,
    isConnected && onRequiredChain && !hasEnoughNativeBalance
      ? `Need ${formatEther(arbitrationCost || 0n)} ETH for the arbitration fee.`
      : null,
  ].filter((issue): issue is string => Boolean(issue));

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-3 rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm leading-relaxed text-amber-100/90">
          <p>Review the registry policy and confirm that every editable field remains accurate before using real funds.</p>
          <InfoTooltip label="About policy review">
            The live registry policy defines compliance. Auto-fill and field validation only prepare a draft; they do not establish that the agent satisfies the policy.
          </InfoTooltip>
        </div>
        {policyUri ? (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <a href={ipfsToGatewayUrl(policyUri)} target="_blank" rel="noreferrer">
              Read policy <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="submission-agent-number">Agent number</Label>
          <InfoTooltip label="About the agent number">
            Use the numeric ERC-8004 token ID on the agent network selected above.
          </InfoTooltip>
          {hasCurrentAutoFill ? (
            <UiBadge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
              Draft loaded
            </UiBadge>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            id="submission-agent-number"
            inputMode="numeric"
            placeholder="ERC-8004 agent number"
            value={draftAgentId}
            onChange={(event) => setDraftAgentId(event.target.value)}
            className={`${FORM_CONTROL_CLASS} font-mono`}
          />
          {props.onAutoFill ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => void props.onAutoFill?.(draftAgentId.trim())}
                disabled={props.autoFillLoading || !/^\d+$/.test(draftAgentId.trim())}
                className="min-w-40"
              >
                <WandSparkles className={`mr-2 h-4 w-4 ${props.autoFillLoading ? "animate-pulse" : ""}`} />
                {props.autoFillLoading ? "Loading" : "Auto-fill"}
              </Button>
              <InfoTooltip label="How auto-fill works">
                Auto-fill creates an editable draft from indexed and on-chain registration data. It does not prove that the agent complies with the policy; you remain responsible for reviewing every field.
              </InfoTooltip>
            </div>
          ) : null}
        </div>
      </div>

      {(columns || []).slice(1).map((column) => {
        const key = normalizePgtcrColumnKey(column.label);
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{column.label}</Label>
              <InfoTooltip label={`About ${column.label}`}>
                {column.description?.trim() || `Enter the ${column.label} value required by the live registry schema.`}
              </InfoTooltip>
            </div>
            {isPgtcrAddressColumn(column) ? (
              <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                <Select
                  value={values[`${key}__chain`] || String(props.sourceChainId)}
                  onValueChange={(value) => setValues((previous) => ({ ...previous, [`${key}__chain`]: value }))}
                >
                  <SelectTrigger className={`w-full ${FORM_CONTROL_CLASS}`}>
                    <SelectValue placeholder="Chain" />
                  </SelectTrigger>
                  <SelectContent className="z-[60]">
                    {CAIP_EIP155_CHAIN_OPTIONS.map((option) => (
                      <SelectItem key={option.chainId} value={String(option.chainId)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={`${column.label} address`}
                  placeholder="0x…"
                  value={values[`${key}__address`] || ""}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, [`${key}__address`]: event.target.value }))
                  }
                  className={FORM_CONTROL_CLASS}
                />
              </div>
            ) : (
              <Input
                aria-label={column.label}
                value={values[key] || ""}
                onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))}
                className={FORM_CONTROL_CLASS}
              />
            )}
          </div>
        );
      })}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="stake-deposit">Stake deposit ({resolvedTokenSymbol})</Label>
          <InfoTooltip label="About the stake deposit">
            This ERC-20 stake backs the listing in Stake Curate. It must meet the live registry minimum and can be affected by a successful challenge.
          </InfoTooltip>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                How to boost
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] border-cyan-300/20 bg-[#09121d] leading-relaxed shadow-2xl">
              <p className="text-sm font-semibold text-cyan-100">Stake more. Rank higher.</p>
              <p className="mt-1.5 text-xs leading-5 text-white/62">
                Increase collateral above the minimum to gain leaderboard visibility and attract more clients.
              </p>
            </PopoverContent>
          </Popover>
          {tokenAddress ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void copyTokenAddress()}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  <Copy className="h-3 w-3" /> Token
                </button>
              </TooltipTrigger>
              <TooltipContent className="break-all font-mono">{tokenAddress}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="relative">
          <Rocket
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300"
            aria-hidden="true"
          />
          <Input
            id="stake-deposit"
            inputMode="decimal"
            placeholder={formatUnits(submissionMinDeposit, resolvedTokenDecimals)}
            value={depositInput}
            onChange={(event) => setValues((previous) => ({ ...previous, __deposit: event.target.value }))}
            className={`${FORM_CONTROL_CLASS} pl-10 pr-20 font-mono`}
            aria-invalid={Boolean(depositResult.error)}
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
            {resolvedTokenSymbol}
          </span>
        </div>
        <p className={`text-xs ${depositResult.error ? "text-red-300" : "text-muted-foreground"}`}>
          {depositResult.error || "Leave empty to use the current minimum stake."}
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-cyan-400/20 bg-gradient-to-b from-cyan-500/[0.08] to-cyan-500/[0.025] p-5 sm:p-6" aria-labelledby="before-submit-title">
        <div>
          <h2 id="before-submit-title" className="font-semibold text-cyan-100">Before you submit</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Review the two assets posted to Stake Curate. They remain separate and keep their own token units.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#080e19]/75 shadow-inner shadow-black/20">
          <dl className="divide-y divide-white/[0.08] text-sm">
            <CheckoutRow
              label="Collateralized stake"
              detail="ERC-20 collateral held while your agent is listed"
              amount={`${formatUnits(deposit, resolvedTokenDecimals)} ${resolvedTokenSymbol}`}
            />
            <CheckoutRow
              label="Arbitration fee deposit"
              detail="Native ETH posted with the registry submission"
              amount={arbitrationCost !== undefined ? `${formatEther(arbitrationCost)} ETH` : "Loading…"}
            />
          </dl>
          <div className="flex flex-col gap-2 border-t border-cyan-300/20 bg-cyan-400/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Due at submission</span>
            <div className="flex flex-wrap gap-2 font-mono text-xs font-semibold text-cyan-50">
              <span className="rounded-md border border-cyan-300/15 bg-black/20 px-2 py-1">
                {formatUnits(deposit, resolvedTokenDecimals)} {resolvedTokenSymbol}
              </span>
              <span className="rounded-md border border-cyan-300/15 bg-black/20 px-2 py-1">
                {arbitrationCost !== undefined ? `${formatEther(arbitrationCost)} ETH` : "Loading ETH…"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4 text-xs leading-relaxed text-emerald-50/80">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
          <div>
            <p className="font-semibold text-emerald-100">100% refundable on voluntary withdrawal</p>
            <p className="mt-1">
              If no challenge succeeds, the contract returns both your {resolvedTokenSymbol} stake and ETH arbitration deposit after the {registry && registry.success ? formatPeriod(registry.registry.withdrawingPeriod) : "live"} waiting period and final withdrawal transaction. The listing remains challengeable while you wait. Network gas is not refunded.
            </p>
          </div>
        </div>
        {environment === "mainnet" ? (
          <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-xs font-medium leading-relaxed text-red-100">
            Mainnet uses real {resolvedTokenSymbol} and ETH. Simulate, verify every value, and confirm the selected wallet before signing.
          </div>
        ) : null}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={openSubmissionReview}
          disabled={
            loading ||
            !isConnected ||
            !onRequiredChain ||
            !columns?.length ||
            arbitrationCost === undefined ||
            allowance === undefined ||
            Boolean(depositResult.error) ||
            balanceIssues.length > 0 ||
            Boolean(props.onAutoFill && !hasCurrentAutoFill)
          }
          className="sm:flex-1"
        >
          {loading
            ? "Working…"
            : balanceIssues.length
              ? "Insufficient balance"
              : `Submit on ${deployment.chainName}`}
        </Button>
        {props.onCancel ? <Button variant="outline" onClick={props.onCancel} disabled={loading}>Cancel</Button> : null}
      </div>

      {!isConnected ? <p className="text-xs text-muted-foreground">Connect your wallet to continue.</p> : null}
      {isConnected && !onRequiredChain ? <p className="text-xs text-red-300">Wrong network. Switch to {deployment.chainName}.</p> : null}
      {balanceIssues.map((issue) => <p key={issue} className="text-xs text-red-300">{issue}</p>)}

      <SubmissionReviewDialog
        open={reviewOpen}
        onOpenChange={(nextOpen) => {
          if (loading) return;
          setReviewOpen(nextOpen);
          if (!nextOpen && signingPhase !== "complete") {
            setSigningError(null);
            setSigningPhase("idle");
          }
        }}
        preview={submissionPreview}
        columns={columns || []}
        agentNetwork={getAgentSubgraphLabel(props.sourceNetwork)}
        submitter={address}
        tokenSymbol={resolvedTokenSymbol}
        tokenDecimals={resolvedTokenDecimals}
        chainName={deployment.chainName}
        approvalRequired={submissionPreview?.approvalRequired ?? (needsApproval && !approvalConfirmed)}
        approvalConfirmed={approvalConfirmed}
        phase={signingPhase}
        error={signingError}
        loading={loading}
        onStart={() => void startSigning()}
        onDone={() => setReviewOpen(false)}
      />
    </div>
  );
}

function CheckoutRow({ label, detail, amount }: { label: string; detail: string; amount: string }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <dt>
        <span className="block font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </dt>
      <dd className="shrink-0 font-mono font-semibold text-cyan-50">{amount}</dd>
    </div>
  );
}
