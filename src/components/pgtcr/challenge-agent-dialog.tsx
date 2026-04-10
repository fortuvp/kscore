"use client";

import * as React from "react";
import { toast } from "sonner";
import { useAccount, useBalance, useChainId, useReadContract, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { formatEther, formatUnits } from "viem";

import PermanentGTCRAbi from "@/lib/abi/PermanentGTCR.json";
import { ERC20_ABI } from "@/lib/abi/erc20";
import { IARBITRATOR_ABI } from "@/lib/abi/iArbitrator";
import { uploadFileToIpfs, uploadJsonToIpfs } from "@/lib/ipfs";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RegistryApiResponse =
  | {
      success: true;
      registry: {
        id: string;
        token: string;
        tokenSymbol?: string | null;
        tokenDecimals?: number | null;
        arbitrator: { id: string };
        challengeStakeMultiplier: string;
        winnerStakeMultiplier: string;
        loserStakeMultiplier: string;
        sharedStakeMultiplier: string;
        arbitrationSettings: Array<{ metaEvidenceURI: string; arbitratorExtraData: string }>;
      };
    }
  | { success: false; error: string };

type ItemApiResponse =
  | {
      success: true;
      item: {
        itemID: string;
        status: string;
        stake: string;
        arbitrationDeposit: string;
        challenges: Array<{
          disputeID: string;
          resolutionTime?: string | null;
          challenger: string;
          challengerStake: string;
          itemStake: string;
          arbitrationSetting: { arbitratorExtraData: string };
          rounds: Array<{
            appealPeriodStart: string;
            appealPeriodEnd: string;
            ruling: string;
            hasPaidRequester: boolean;
            hasPaidChallenger: boolean;
            amountPaidRequester: string;
            amountPaidChallenger: string;
          }>;
        }>;
      } | null;
    }
  | { success: false; error: string };

function mulDiv(a: bigint, b: bigint, div: bigint): bigint {
  if (div === 0n) return 0n;
  return (a * b) / div;
}

export function ChallengeAgentDialog(props: { itemID: string }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [registry, setRegistry] = React.useState<RegistryApiResponse | null>(null);
  const [item, setItem] = React.useState<ItemApiResponse | null>(null);
  const [approvalStepDone, setApprovalStepDone] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  const onSepolia = chainId === sepolia.id;

  const registryAddress = registry && registry.success ? (registry.registry.id as `0x${string}`) : undefined;
  const tokenAddress = registry && registry.success ? (registry.registry.token as `0x${string}`) : undefined;
  const arbitratorAddress = registry && registry.success ? (registry.registry.arbitrator.id as `0x${string}`) : undefined;
  const arbitratorExtraData = registry && registry.success ? (registry.registry.arbitrationSettings?.[0]?.arbitratorExtraData as `0x${string}`) : undefined;

  const multiplierDivisor = useReadContract({
    address: registryAddress,
    abi: PermanentGTCRAbi,
    functionName: "MULTIPLIER_DIVISOR",
    query: { enabled: Boolean(registryAddress) },
  }).data as bigint | undefined;

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
  const resolvedTokenDecimals = tokenDecimals ?? (registry && registry.success ? registry.registry.tokenDecimals ?? undefined : undefined) ?? 18;
  const resolvedTokenSymbol = tokenSymbol || (registry && registry.success ? registry.registry.tokenSymbol || undefined : undefined) || "TOKEN";

  const arbitrationCost = useReadContract({
    address: arbitratorAddress,
    abi: IARBITRATOR_ABI,
    functionName: "arbitrationCost",
    args: arbitratorExtraData ? [arbitratorExtraData] : undefined,
    query: { enabled: Boolean(arbitratorAddress && arbitratorExtraData) },
  }).data as bigint | undefined;

  const itemStake = item && item.success && item.item ? BigInt(item.item.stake || "0") : 0n;
  const challengeStakeMultiplier = registry && registry.success ? BigInt(registry.registry.challengeStakeMultiplier || "0") : 0n;

  const requiredChallengeStake = React.useMemo(() => {
    if (!multiplierDivisor) return 0n;
    return mulDiv(itemStake, challengeStakeMultiplier, multiplierDivisor);
  }, [itemStake, challengeStakeMultiplier, multiplierDivisor]);

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

  const nativeBalance = useBalance({
    address,
    chainId: sepolia.id,
    query: { enabled: Boolean(address) },
  }).data?.value;

  const dataReady = multiplierDivisor !== undefined && arbitrationCost !== undefined && allowance !== undefined;
  const needsApproval = Boolean(dataReady && allowance < requiredChallengeStake);
  const hasEnoughTokenBalance = tokenBalance === undefined || tokenBalance >= requiredChallengeStake;
  const hasEnoughNativeBalance = arbitrationCost === undefined || nativeBalance === undefined || nativeBalance >= arbitrationCost;

  React.useEffect(() => {
    if (!open) return;
    setApprovalStepDone(false);
    let cancelled = false;
    async function load() {
      try {
        const [rRes, iRes] = await Promise.all([
          fetch("/api/pgtcr/registry", { cache: "no-store" }),
          fetch(`/api/pgtcr/item?itemID=${encodeURIComponent(props.itemID)}`, { cache: "no-store" }),
        ]);
        const [rJson, iJson] = await Promise.all([
          rRes.json() as Promise<RegistryApiResponse>,
          iRes.json() as Promise<ItemApiResponse>,
        ]);
        if (cancelled) return;
        setRegistry(rJson);
        setItem(iJson);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load item");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, props.itemID]);

  async function ensureApprovalIfNeeded() {
    if (!needsApproval || approvalStepDone) return true;
    if (!tokenAddress || !registryAddress) return false;
    setSubmitting(true);
    try {
      await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [registryAddress, requiredChallengeStake],
      });
      toast.success("Approval sent. Click again to submit challenge.");
      setApprovalStepDone(true);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function onChallenge() {
    if (!isConnected || !address) {
      toast.error("Connect your wallet to challenge.");
      return;
    }
    if (!onSepolia) {
      toast.error("Switch to Sepolia.");
      return;
    }
    if (!registryAddress) {
      toast.error("Registry not loaded.");
      return;
    }
    if (!dataReady) {
      toast.error("Contract data still loading. Please wait.");
      return;
    }
    if (!arbitrationCost && arbitrationCost !== 0n) {
      toast.error("Arbitration cost not available.");
      return;
    }
    if (!hasEnoughTokenBalance) {
      toast.error(`Insufficient ${resolvedTokenSymbol.toLowerCase()} balance.`);
      return;
    }
    if (!hasEnoughNativeBalance) {
      toast.error("Insufficient ETH balance.");
      return;
    }
    if (needsApproval && !approvalStepDone) {
      await ensureApprovalIfNeeded();
      return;
    }

    const t = title.trim();
    const d = description.trim();
    if (t.length < 3 || d.length < 10) {
      toast.error("Add a title and a description.");
      return;
    }

    setSubmitting(true);
    try {
      let fileURI: string | undefined;
      let type: string | undefined;
      let fileTypeExtension: string | undefined;

      if (file) {
        fileURI = await uploadFileToIpfs(file, { operation: "evidence", pinToGraph: false });
        type = file.type || undefined;
        const ext = file.name.split(".").pop();
        fileTypeExtension = ext && ext.length <= 8 ? ext : undefined;
      }

      const evidenceJson: Record<string, unknown> = { title: t, description: d };
      if (fileURI) evidenceJson.fileURI = fileURI;
      if (type) evidenceJson.type = type;
      if (fileTypeExtension) evidenceJson.fileTypeExtension = fileTypeExtension;

      const evidenceUri = await uploadJsonToIpfs(evidenceJson, { operation: "evidence", pinToGraph: false });

      await writeContractAsync({
        address: registryAddress,
        abi: PermanentGTCRAbi,
        functionName: "challengeItem",
        args: [props.itemID as `0x${string}`, evidenceUri],
        value: arbitrationCost,
        gas: 500000n,
      });

      toast.success("Challenge submitted.");
      setOpen(false);
      setTitle("");
      setDescription("");
      setFile(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Challenge failed");
    } finally {
      setSubmitting(false);
    }
  }

  // -------- Dispute display + funding --------

  const latestChallenge = item && item.success && item.item ? item.item.challenges?.[0] : null;
  const activeDispute = latestChallenge && !latestChallenge.resolutionTime ? latestChallenge : null;
  const balanceIssues: string[] = [];

  if (isConnected && onSepolia && !hasEnoughTokenBalance) {
    balanceIssues.push(`Insufficient balance. Need ${formatUnits(requiredChallengeStake, resolvedTokenDecimals)} ${resolvedTokenSymbol} for the challenge stake.`);
  }
  if (isConnected && onSepolia && !hasEnoughNativeBalance) {
    balanceIssues.push(`Insufficient balance. Need ${formatEther(arbitrationCost || 0n)} ETH for arbitration.`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Challenge Agent</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Challenge Agent (PGTCR)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
            <div>ItemID: <span className="font-mono">{props.itemID}</span></div>
            <div>
              Required challenge stake: <span className="font-mono">{formatUnits(requiredChallengeStake, resolvedTokenDecimals)} {resolvedTokenSymbol}</span>
            </div>
            <div>
              Arbitration cost (msg.value): {arbitrationCost !== undefined ? <span className="font-mono">{formatEther(arbitrationCost)} ETH</span> : "-"}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Evidence title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
          </div>
          <div className="space-y-2">
            <Label>Evidence description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px] w-full rounded-md border border-border bg-background p-2 text-sm"
              placeholder="Explain why this agent should be challenged."
            />
          </div>
          <div className="space-y-2">
            <Label>Attachment (optional)</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="sm:flex-1"
              onClick={() => void onChallenge()}
              disabled={submitting || !isConnected || !onSepolia || !dataReady || Boolean(activeDispute) || balanceIssues.length > 0}
            >
              {submitting
                ? "Working…"
                : activeDispute
                  ? "Dispute active"
                  : balanceIssues.length > 0
                    ? "Insufficient balance"
                    : needsApproval && !approvalStepDone
                      ? `Approve ${resolvedTokenSymbol.toLowerCase()}`
                      : "Challenge"}
            </Button>
          </div>

          {!isConnected ? <div className="text-xs text-muted-foreground">Connect your wallet to continue.</div> : null}
          {isConnected && !onSepolia ? <div className="text-xs text-red-300">Wrong network. Switch to Sepolia.</div> : null}
          {activeDispute ? <div className="text-xs text-amber-300">This item is already disputed. Use the dispute panel on the page to fund appeals or inspect the case.</div> : null}
          {balanceIssues.map((issue) => (
            <div key={issue} className="text-xs text-red-300">
              {issue}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
