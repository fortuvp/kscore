"use client";

import * as React from "react";
import Link from "next/link";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useAccount, useBalance, useChainId, useReadContract, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { formatEther, formatUnits, isAddress, parseUnits } from "viem";

import PermanentGTCRAbi from "@/lib/abi/PermanentGTCR.json";
import { ERC20_ABI } from "@/lib/abi/erc20";
import { IARBITRATOR_ABI } from "@/lib/abi/iArbitrator";
import { fetchIpfsJson, ipfsToGatewayUrl, uploadJsonToIpfs } from "@/lib/ipfs";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type MetaEvidenceJson = {
  fileURI?: string;
  metadata?: {
    columns?: Array<{
      label: string;
      type?: string;
      description?: string;
      isIdentifier?: boolean;
    }>;
  };
};

type RegistryApiResponse =
  | {
      success: true;
      registry: {
        id: string;
        token: string;
        submissionMinDeposit: string;
        arbitrator: { id: string };
        arbitrationSettings: Array<{ metaEvidenceURI: string; arbitratorExtraData: string; metadata?: { policyURI?: string | null } | null }>;
      };
    }
  | { success: false; error: string };

type CollateralizeAgentFormProps = {
  agentId: string;
  onSubmitted?: () => void;
  onCancel?: () => void;
  showNewPageLink?: boolean;
  newPageHref?: string;
};

function normalizeColumnKey(label: string) {
  return label.trim();
}

function isRichAddressColumn(col: { label: string; type?: string }) {
  const label = (col.label || "").trim().toLowerCase();
  const type = (col.type || "").trim().toLowerCase();

  return label === "key2" || label.includes("caip") || type.includes("rich") || type.includes("address");
}

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

export function CollateralizeAgentForm(props: CollateralizeAgentFormProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  const [loading, setLoading] = React.useState(false);
  const [registry, setRegistry] = React.useState<RegistryApiResponse | null>(null);
  const [columns, setColumns] = React.useState<NonNullable<NonNullable<MetaEvidenceJson["metadata"]>["columns"]> | null>(null);
  const [policyUri, setPolicyUri] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [approvalStepDone, setApprovalStepDone] = React.useState(false);

  const registryAddress = registry && registry.success ? (registry.registry.id as `0x${string}`) : undefined;
  const tokenAddress = registry && registry.success ? (registry.registry.token as `0x${string}`) : undefined;

  const arbitrationSetting = registry && registry.success ? registry.registry.arbitrationSettings?.[0] : undefined;
  const arbitratorAddress = registry && registry.success ? (registry.registry.arbitrator.id as `0x${string}`) : undefined;
  const arbitratorExtraData = arbitrationSetting?.arbitratorExtraData as `0x${string}` | undefined;

  const onSepolia = chainId === sepolia.id;
  const submissionMinDeposit = registry && registry.success ? BigInt(registry.registry.submissionMinDeposit || "0") : 0n;

  const tokenDecimals = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: Boolean(tokenAddress) },
  }).data as number | undefined;

  const tokenSymbol = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "symbol",
    query: { enabled: Boolean(tokenAddress) },
  }).data as string | undefined;

  const allowance = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && registryAddress ? [address, registryAddress] : undefined,
    query: { enabled: Boolean(address && tokenAddress && registryAddress) },
  }).data as bigint | undefined;

  const tokenBalance = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && tokenAddress) },
  }).data as bigint | undefined;

  const arbitrationCost = useReadContract({
    address: arbitratorAddress,
    abi: IARBITRATOR_ABI,
    functionName: "arbitrationCost",
    args: arbitratorExtraData ? [arbitratorExtraData] : undefined,
    query: { enabled: Boolean(arbitratorAddress && arbitratorExtraData) },
  }).data as bigint | undefined;

  const nativeBalance = useBalance({
    address,
    chainId: sepolia.id,
    query: { enabled: Boolean(address) },
  }).data?.value;

  React.useEffect(() => {
    setApprovalStepDone(false);

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/pgtcr/registry", { cache: "no-store" });
        const json = (await res.json()) as RegistryApiResponse;
        if (cancelled) return;
        setRegistry(json);
        if (!json.success) throw new Error(json.error);

        const meUri = json.registry.arbitrationSettings?.[0]?.metaEvidenceURI;
        const policy = json.registry.arbitrationSettings?.[0]?.metadata?.policyURI || null;
        setPolicyUri(policy);

        if (!meUri) throw new Error("Registry metaEvidenceURI missing");
        const me = await fetchIpfsJson<MetaEvidenceJson>(meUri);
        const cols = (me?.metadata?.columns || []).filter((c) => Boolean(c?.label?.trim()));
        setColumns(cols);
        if (!policy && me?.fileURI) setPolicyUri(me.fileURI);

        const lockedLabel = cols?.[0]?.label?.trim();

        const initial: Record<string, string> = {};
        for (const c of cols) {
          const key = normalizeColumnKey(c.label);
          initial[key] = "";
          if (isRichAddressColumn(c)) {
            initial[`${key}__chain`] = String(11155111);
            initial[`${key}__address`] = "";
          }
        }
        if (lockedLabel) initial[normalizeColumnKey(lockedLabel)] = props.agentId;
        setValues(initial);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load registry schema");
        setColumns([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [props.agentId]);

  const depositInput = values["__deposit"] ?? "";
  const deposit = React.useMemo(() => {
    try {
      if (!depositInput) return submissionMinDeposit;
      if (!tokenDecimals && tokenDecimals !== 0) return submissionMinDeposit;
      return parseUnits(depositInput as `${number}`, tokenDecimals);
    } catch {
      return submissionMinDeposit;
    }
  }, [depositInput, submissionMinDeposit, tokenDecimals]);

  const needsApproval = Boolean(allowance !== undefined && allowance < deposit);
  const hasEnoughTokenBalance = tokenBalance === undefined || tokenBalance >= deposit;
  const hasEnoughNativeBalance = arbitrationCost === undefined || nativeBalance === undefined || nativeBalance >= arbitrationCost;
  const balanceIssues: string[] = [];

  if (isConnected && onSepolia && !hasEnoughTokenBalance) {
    balanceIssues.push(`Insufficient balance. Need ${tokenDecimals !== undefined ? formatUnits(deposit, tokenDecimals) : deposit.toString()} ${tokenSymbol || "TOKEN"} for the deposit.`);
  }
  if (isConnected && onSepolia && !hasEnoughNativeBalance) {
    balanceIssues.push(`Insufficient balance. Need ${formatEther(arbitrationCost || 0n)} ETH for arbitration.`);
  }

  async function ensureApprovalIfNeeded() {
    if (!needsApproval || approvalStepDone) return true;
    if (!tokenAddress || !registryAddress) return false;

    try {
      setLoading(true);
      await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [registryAddress, deposit],
      });
      toast.success("Approval sent. Now submit the item.");
      setApprovalStepDone(true);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function copyTokenAddress() {
    if (!tokenAddress) return;
    try {
      await navigator.clipboard.writeText(tokenAddress);
      toast.success("Token address copied.");
    } catch {
      toast.error("Failed to copy token address.");
    }
  }

  async function onSubmit() {
    if (!isConnected || !address) {
      toast.error("Connect your wallet to collateralize.");
      return;
    }
    if (!onSepolia) {
      toast.error("Switch to Sepolia.");
      return;
    }
    if (!registryAddress || !tokenAddress || !arbitrationSetting?.metaEvidenceURI) {
      toast.error("Registry not loaded.");
      return;
    }
    if (!arbitrationCost && arbitrationCost !== 0n) {
      toast.error("Arbitration cost not available.");
      return;
    }
    if (deposit < submissionMinDeposit) {
      toast.error("Deposit below submission minimum.");
      return;
    }
    if (!hasEnoughTokenBalance) {
      toast.error(`Insufficient ${tokenSymbol || "token"} balance.`);
      return;
    }
    if (!hasEnoughNativeBalance) {
      toast.error("Insufficient ETH balance.");
      return;
    }
    if (!columns?.length) {
      toast.error("Schema columns missing.");
      return;
    }

    if (needsApproval && !approvalStepDone) {
      await ensureApprovalIfNeeded();
      return;
    }

    const cols = columns;
    const lockedLabel = cols?.[0]?.label?.trim();

    const itemValues: Record<string, string> = {};
    for (const c of cols) {
      const key = normalizeColumnKey(c.label);
      if (lockedLabel && key === normalizeColumnKey(lockedLabel)) {
        itemValues[key] = props.agentId;
        continue;
      }

      if (isRichAddressColumn(c)) {
        const chain = (values[`${key}__chain`] || "").trim();
        const addr = (values[`${key}__address`] || "").trim();
        itemValues[key] = addr && chain ? `eip155:${chain}:${addr}` : "";
        continue;
      }

      itemValues[key] = (values[key] || "").trim();
    }

    const missing = cols
      .slice(1)
      .map((c) => ({ col: c, key: normalizeColumnKey(c.label) }))
      .filter(({ col, key }) => {
        if (isRichAddressColumn(col)) return !(values[`${key}__address`] || "").trim();
        return !(values[key] || "").trim();
      })
      .map(({ key }) => key);
    if (missing.length) {
      toast.error("Please fill all fields before submitting.");
      return;
    }

    const itemJson = {
      columns: cols,
      values: itemValues,
    };

    setLoading(true);
    try {
      const itemUri = await uploadJsonToIpfs(itemJson, { operation: "item", pinToGraph: false, filename: "item.json" });
      const hash = await writeContractAsync({
        address: registryAddress,
        abi: PermanentGTCRAbi,
        functionName: "addItem",
        args: [itemUri, deposit],
        value: arbitrationCost,
      });
      toast.success("Submission sent.");
      toast.message(
        <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer" className="underline">
          View tx
        </a>
      );
      props.onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  const lockedLabel = columns?.[0]?.label?.trim();
  const lockedKey = lockedLabel ? normalizeColumnKey(lockedLabel) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            Submit this agent to the Stake Curate registry. The first schema field is locked.
          </div>
          <div className="rounded-md border border-amber-400/35 bg-amber-500/15 px-3 py-2 text-xs text-amber-100">
            Read the policy carefully and submit only information you are confident fully complies with it.
          </div>
          {props.showNewPageLink && props.newPageHref ? (
            <Link href={props.newPageHref} className="inline-block text-sm font-medium text-sky-400 underline underline-offset-2 hover:text-sky-300">
              click here if you want to submit in a new page
            </Link>
          ) : null}
        </div>
        {policyUri ? (
          <Button asChild size="sm" variant="outline">
            <a href={ipfsToGatewayUrl(policyUri)} target="_blank" rel="noreferrer">
              Policy
            </a>
          </Button>
        ) : null}
      </div>

      <div className="space-y-1 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <div>
          Registry: {registryAddress && isAddress(registryAddress) ? <span className="font-mono">{registryAddress}</span> : "-"}
        </div>
        <div>
          Submission min deposit:{" "}
          {tokenDecimals !== undefined ? (
            <span className="font-mono">
              {formatUnits(submissionMinDeposit, tokenDecimals)} {tokenSymbol || "TOKEN"}
            </span>
          ) : (
            <span className="font-mono">{submissionMinDeposit.toString()}</span>
          )}
        </div>
        <div>
          Arbitration cost (msg.value):{" "}
          {arbitrationCost !== undefined ? <span className="font-mono">{formatEther(arbitrationCost)} ETH</span> : "-"}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>{lockedLabel || "Agent ID"}</Label>
          <UiBadge variant="outline" className="text-[10px]">
            locked
          </UiBadge>
        </div>
        <Input value={props.agentId} disabled className="font-mono" />
        <div className="text-[11px] text-muted-foreground">Locked: users cannot change this field.</div>
      </div>

      {(columns || []).slice(1).map((c) => {
        const key = normalizeColumnKey(c.label);
        const desc = c.description?.trim();

        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{c.label}</Label>
              {desc ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-xs text-muted-foreground underline">tip</span>
                  </TooltipTrigger>
                  <TooltipContent>{desc}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            {isRichAddressColumn(c) ? (
              <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                <Select
                  value={values[`${key}__chain`] || String(11155111)}
                  onValueChange={(v) => setValues((prev) => ({ ...prev, [`${key}__chain`]: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Chain" />
                  </SelectTrigger>
                  <SelectContent className="z-[60]">
                    {CAIP_EIP155_CHAIN_OPTIONS.map((opt) => (
                      <SelectItem key={opt.chainId} value={String(opt.chainId)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder={desc || "0x…"}
                  value={values[`${key}__address`] || ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [`${key}__address`]: e.target.value }))}
                />
              </div>
            ) : (
              <Input placeholder={desc || ""} value={values[key] || ""} onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))} />
            )}
          </div>
        );
      })}

      {lockedKey ? null : null}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Stake deposit ({tokenSymbol || "token"})</Label>
          {tokenAddress ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void copyTokenAddress()}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  <Copy className="h-3 w-3" />
                  Token
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[320px]">
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Stake token address</div>
                  <div className="break-all font-mono text-[11px]">{tokenAddress}</div>
                  <div className="text-[11px] text-muted-foreground">Click to copy</div>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <Input
          inputMode="decimal"
          placeholder={tokenDecimals !== undefined ? formatUnits(submissionMinDeposit, tokenDecimals) : submissionMinDeposit.toString()}
          value={depositInput}
          onChange={(e) => setValues((prev) => ({ ...prev, __deposit: e.target.value }))}
        />
        <div className="text-[11px] text-muted-foreground">Defaults to submissionMinDeposit if empty.</div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={() => void onSubmit()}
          disabled={loading || !isConnected || !onSepolia || !(columns?.length) || balanceIssues.length > 0}
          className="sm:flex-1"
        >
          {loading ? "Working…" : balanceIssues.length > 0 ? "Insufficient balance" : needsApproval && !approvalStepDone ? `Approve ${tokenSymbol || "token"}` : "Submit"}
        </Button>
        {props.onCancel ? (
          <Button variant="outline" onClick={props.onCancel} disabled={loading}>
            Cancel
          </Button>
        ) : null}
      </div>

      {!isConnected ? <div className="text-xs text-muted-foreground">Connect your wallet to continue.</div> : null}
      {isConnected && !onSepolia ? <div className="text-xs text-red-300">Wrong network. Switch to Sepolia.</div> : null}
      {balanceIssues.map((issue) => (
        <div key={issue} className="text-xs text-red-300">
          {issue}
        </div>
      ))}
    </div>
  );
}
