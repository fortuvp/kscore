"use client";

import * as React from "react";
import { toast } from "sonner";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";

import PermanentGTCRAbi from "@/lib/abi/PermanentGTCR.json";
import { executeConfirmedTransaction } from "@/lib/confirmed-transaction";
import { uploadFileToIpfs, uploadJsonToIpfs, ipfsToGatewayUrl } from "@/lib/ipfs";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";

type ItemApiResponse =
  | {
      success: true;
      item: {
        itemID: string;
        status: string;
        evidences: Array<{
          party: string;
          URI: string;
          timestamp: string;
          txHash: string;
          metadata?: {
            title?: string | null;
            description?: string | null;
            fileURI?: string | null;
            fileTypeExtension?: string | null;
            name?: string | null;
          } | null;
        }>;
      } | null;
    }
  | { success: false; error: string };

export function EvidenceSection(props: { itemID: string; registryAddress: `0x${string}` }) {
  const { environment } = useVerificationEnvironment();
  const [data, setData] = React.useState<ItemApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ itemID: props.itemID, verificationEnvironment: environment });
      const res = await fetch(`/api/pgtcr/item?${query}`, { cache: "no-store" });
      const json = (await res.json()) as ItemApiResponse;
      setData(json);
    } catch {
      setData({ success: false, error: "Failed to load evidence" });
    } finally {
      setLoading(false);
    }
  }, [environment, props.itemID]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-lg border border-border p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Evidence</h2>
          <p className="text-sm text-muted-foreground">All evidence submitted to the Curate item.</p>
        </div>
        <SubmitEvidenceDialog itemID={props.itemID} registryAddress={props.registryAddress} onSubmitted={load} />
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Loading evidence…</div> : null}

      {!loading && (!data || data.success === false) ? (
        <div className="text-sm text-muted-foreground">Evidence unavailable.</div>
      ) : null}

      {!loading && data && data.success && !data.item ? (
        <div className="text-sm text-muted-foreground">No item found.</div>
      ) : null}

      {!loading && data && data.success && data.item ? (
        <div className="space-y-3">
          {(data.item.evidences || []).length ? (
            data.item.evidences.map((e, idx) => {
              const ts = Number(e.timestamp) * 1000;
              const title = e.metadata?.title || e.metadata?.name || `Evidence #${idx + 1}`;
              const desc = e.metadata?.description || "";
              const fileUri = e.metadata?.fileURI || null;
              return (
                <div key={`${e.txHash}-${idx}`} className="rounded-md border border-border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{title}</div>
                    <div className="text-xs text-muted-foreground">
                      {Number.isFinite(ts) ? new Date(ts).toLocaleString() : "-"}
                    </div>
                  </div>
                  {desc ? <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{desc}</div> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-mono">Party: {e.party}</span>
                    <a href={ipfsToGatewayUrl(e.URI)} target="_blank" rel="noreferrer" className="underline">
                      Evidence URI
                    </a>
                    {fileUri ? (
                      <a href={ipfsToGatewayUrl(fileUri)} target="_blank" rel="noreferrer" className="underline">
                        Attachment
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-muted-foreground">No evidence yet.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SubmitEvidenceDialog(props: {
  itemID: string;
  registryAddress: `0x${string}`;
  onSubmitted: () => void;
}) {
  const { deployment } = useVerificationEnvironment();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: deployment.chainId });
  const { writeContractAsync } = useWriteContract();
  const onRequiredChain = chainId === deployment.chainId;

  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit() {
    if (!isConnected || !address) {
      toast.error("Connect your wallet to submit evidence.");
      return;
    }
    if (!onRequiredChain) {
      toast.error(`Switch to ${deployment.chainName}.`);
      return;
    }
    if (!publicClient) return toast.error("The selected network is unavailable.");

    const t = title.trim();
    const d = description.trim();
    if (t.length < 3) {
      toast.error("Title is too short.");
      return;
    }
    if (d.length < 10) {
      toast.error("Description is too short.");
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

      const evidenceJson: Record<string, unknown> = {
        title: t,
        description: d,
      };
      if (fileURI) evidenceJson.fileURI = fileURI;
      if (type) evidenceJson.type = type;
      if (fileTypeExtension) evidenceJson.fileTypeExtension = fileTypeExtension;

      const evidenceUri = await uploadJsonToIpfs(evidenceJson, {
        operation: "evidence",
        pinToGraph: false,
        filename: "evidence.json",
      });

      toast.message("Checking evidence and waiting for confirmation…");
      await executeConfirmedTransaction({
        simulate: async () =>
          (
            await publicClient.simulateContract({
              account: address,
              address: props.registryAddress,
              abi: PermanentGTCRAbi,
              functionName: "submitEvidence",
              args: [props.itemID as `0x${string}`, evidenceUri],
            })
          ).request,
        write: (request) => writeContractAsync(request),
        wait: (hash) => publicClient.waitForTransactionReceipt({ hash }),
      });
      toast.success("Evidence confirmed.");
      setOpen(false);
      setTitle("");
      setDescription("");
      setFile(null);
      props.onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Evidence submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Submit Evidence</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Evidence</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px] w-full rounded-md border border-border bg-background p-2 text-sm"
              placeholder="Explain the evidence and add any links."
            />
          </div>
          <div className="space-y-2">
            <Label>Attachment (optional)</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>

          <Button className="w-full" onClick={() => void onSubmit()} disabled={submitting || !isConnected || !onRequiredChain}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
          {!isConnected ? <div className="text-xs text-muted-foreground">Connect your wallet to continue.</div> : null}
          {isConnected && !onRequiredChain ? <div className="text-xs text-red-300">Wrong network. Switch to {deployment.chainName}.</div> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
