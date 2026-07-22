"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, LoaderCircle } from "lucide-react";
import { formatEther, formatUnits } from "viem";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizePgtcrColumnKey, type PgtcrSchemaColumn } from "@/lib/pgtcr-submission";

export type SubmissionSigningPhase = "idle" | "checking" | "approving" | "submitting" | "complete";

export type SubmissionPreview = {
  values: Record<string, string>;
  deposit: bigint;
  arbitrationCost: bigint;
  approvalRequired: boolean;
};

export function SubmissionReviewDialog({
  open,
  onOpenChange,
  preview,
  columns,
  agentNetwork,
  submitter,
  tokenSymbol,
  tokenDecimals,
  chainName,
  approvalRequired,
  approvalConfirmed,
  phase,
  error,
  loading,
  onStart,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: SubmissionPreview | null;
  columns: PgtcrSchemaColumn[];
  agentNetwork: string;
  submitter?: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
  chainName: string;
  approvalRequired: boolean;
  approvalConfirmed: boolean;
  phase: SubmissionSigningPhase;
  error: string | null;
  loading: boolean;
  onStart: () => void;
  onDone: () => void;
}) {
  if (!preview) return null;

  const agentId = columns[0]
    ? preview.values[normalizePgtcrColumnKey(columns[0].label)]
    : "-";
  const stakeLabel = `${formatUnits(preview.deposit, tokenDecimals)} ${tokenSymbol}`;
  const arbitrationLabel = `${formatEther(preview.arbitrationCost)} ETH`;
  const approvalDone = approvalConfirmed || !approvalRequired || phase === "submitting" || phase === "complete";
  const submissionDone = phase === "complete";
  const phaseMessage =
    phase === "checking"
      ? "Checking the registry for an existing submission…"
      : phase === "approving"
        ? `Step 1: approve ${tokenSymbol} collateral in your wallet.`
        : phase === "submitting"
          ? `${approvalRequired ? "Step 2" : "Final step"}: confirm the registry submission in your wallet.`
          : phase === "complete"
            ? "Submission confirmed on-chain."
            : error
              ? "Your funds were not fully submitted. Review the error and retry when ready."
              : "Review the details, then start the guided signing flow.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-2xl p-0 sm:w-[calc(100%-2rem)]"
        onEscapeKeyDown={(event) => {
          if (loading) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (loading) event.preventDefault();
        }}
      >
        <DialogHeader className="mb-0 border-b border-white/10 bg-gradient-to-br from-cyan-400/[0.12] via-transparent to-transparent px-5 py-5 sm:px-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Final review</p>
          <DialogTitle className="text-xl sm:text-2xl">Review your submission</DialogTitle>
          <DialogPrimitive.Description className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Confirm what will be posted, then follow each wallet prompt in order.
          </DialogPrimitive.Description>
        </DialogHeader>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <section aria-labelledby="submission-preview-title" className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
            <div className="flex flex-col gap-1 border-b border-white/[0.08] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 id="submission-preview-title" className="font-semibold text-foreground">Agent #{agentId}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Identity on {agentNetwork}</p>
              </div>
              <span className="mt-1 w-fit rounded-full border border-cyan-300/20 bg-cyan-400/[0.08] px-2.5 py-1 text-[11px] font-medium text-cyan-100 sm:mt-0">
                Submit on {chainName}
              </span>
            </div>
            <dl className="grid gap-px bg-white/[0.08] sm:grid-cols-2">
              <ReviewValue label="Collateralized stake" value={stakeLabel} />
              <ReviewValue label="Arbitration deposit" value={arbitrationLabel} />
              <ReviewValue
                label="Signing wallet"
                value={submitter ? `${submitter.slice(0, 7)}…${submitter.slice(-5)}` : "-"}
                mono
              />
              <ReviewValue label="Wallet prompts" value={approvalRequired ? "2 transactions" : "1 transaction"} />
            </dl>
          </section>

          <details className="group rounded-xl border border-white/10 bg-black/10">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400">
              <span className="flex items-center justify-between gap-3">
                Registry fields
                <span className="text-xs font-normal text-muted-foreground group-open:hidden">Review</span>
                <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
              </span>
            </summary>
            <dl className="divide-y divide-white/[0.08] border-t border-white/[0.08] px-4">
              {columns.map((column) => {
                const value = preview.values[normalizePgtcrColumnKey(column.label)] || "-";
                return (
                  <div key={column.label} className="grid gap-1 py-3 text-xs sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-3">
                    <dt className="text-muted-foreground">{column.label}</dt>
                    <dd className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all text-foreground">{value}</dd>
                  </div>
                );
              })}
            </dl>
          </details>

          <section aria-labelledby="wallet-sequence-title" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 id="wallet-sequence-title" className="font-semibold text-foreground">Wallet sequence</h3>
              <span className="text-xs text-muted-foreground">{approvalRequired ? "2 transactions" : "1 transaction"}</span>
            </div>
            <div className="space-y-2">
              <SigningStep
                number={1}
                title={`Authorize ${tokenSymbol} collateral`}
                status={phase === "approving" ? "active" : approvalDone ? "complete" : "pending"}
              >
                {approvalConfirmed
                  ? "Collateral approval is confirmed. No additional approval is needed."
                  : approvalRequired
                    ? `Approve the registry to transfer exactly ${stakeLabel}. We wait for confirmation before continuing.`
                    : "Your existing allowance already covers this stake, so this signature is skipped."}
              </SigningStep>
              <SigningStep
                number={approvalRequired ? 2 : 1}
                title="Submit and fund the listing"
                status={phase === "submitting" ? "active" : submissionDone ? "complete" : "pending"}
              >
                The registry transaction pulls {stakeLabel} and posts {arbitrationLabel} as the arbitration deposit in the same signature.
              </SigningStep>
            </div>
          </section>

          <div
            aria-live="polite"
            className={`rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${
              error
                ? "border-red-400/25 bg-red-500/[0.08] text-red-100"
                : submissionDone
                  ? "border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-100"
                  : "border-white/10 bg-black/15 text-muted-foreground"
            }`}
          >
            {error ? `${phaseMessage} ${error}` : phaseMessage}
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-white/10 bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            Wallet estimates may include network gas. Gas is paid separately and is not refundable.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {phase !== "complete" ? (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Back to form
              </Button>
            ) : null}
            <Button type="button" onClick={phase === "complete" ? onDone : onStart} disabled={loading} className="sm:min-w-40">
              {phase === "checking"
                ? "Checking…"
                : phase === "approving"
                  ? `Approve ${tokenSymbol}`
                  : phase === "submitting"
                    ? "Confirm submission"
                    : phase === "complete"
                      ? "Done"
                      : error
                        ? "Retry signing"
                        : "Start signing"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-[#0a101b] px-4 py-3">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function SigningStep({
  number,
  title,
  status,
  children,
}: {
  number: number;
  title: string;
  status: "pending" | "active" | "complete";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex gap-3 rounded-xl border p-3.5 ${
        status === "active"
          ? "border-cyan-300/35 bg-cyan-400/[0.08]"
          : status === "complete"
            ? "border-emerald-400/20 bg-emerald-400/[0.05]"
            : "border-white/10 bg-black/10"
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
          status === "active"
            ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
            : status === "complete"
              ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-200"
              : "border-white/15 bg-white/[0.03] text-muted-foreground"
        }`}
        aria-hidden="true"
      >
        {status === "active" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : status === "complete" ? (
          <Check className="h-4 w-4" />
        ) : (
          number
        )}
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
