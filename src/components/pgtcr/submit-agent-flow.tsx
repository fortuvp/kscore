"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, FilePenLine } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";

import { CollateralizeAgentForm } from "@/components/pgtcr/collateralize-agent-form";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";
import {
  AGENT_NETWORK_CHAIN_IDS,
  getAgentSubgraphLabel,
  isAgentSubgraphNetwork,
  type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import type { Agent } from "@/types/agent";

type AgentLookupResponse = {
  success?: boolean;
  found?: boolean;
  network?: AgentSubgraphNetwork | null;
  item?: Agent | null;
  error?: string;
};

function buildAdditionalInfo(agent: Agent | null) {
  if (!agent) return null;

  const registration = agent.registrationFile;
  const protocols = [registration?.mcpEndpoint ? "MCP" : null, registration?.a2aEndpoint ? "A2A" : null].filter(Boolean);
  const details = [
    registration?.name ? `Name: ${registration.name}` : null,
    registration?.description ? `Description: ${registration.description}` : null,
    registration?.active !== null && registration?.active !== undefined ? `Active: ${registration.active ? "Yes" : "No"}` : null,
    protocols.length > 0 ? `Protocols: ${protocols.join(", ")}` : null,
    registration?.supportedTrusts.length ? `Trust models: ${registration.supportedTrusts.join(", ")}` : null,
    registration?.x402Support !== null && registration?.x402Support !== undefined
      ? `x402 payments: ${registration.x402Support ? "Supported" : "Not supported"}`
      : null,
    `ERC-8004 feedback received: ${agent.totalFeedback || "0"}`,
  ];

  return details.filter((detail): detail is string => Boolean(detail)).join("\n");
}

export function SubmitAgentFlow() {
  return (
    <React.Suspense fallback={<SubmitLoading />}>
      <SubmitAgentContent />
    </React.Suspense>
  );
}

function SubmitAgentContent() {
  const params = useParams<{ agentId?: string }>();
  const searchParams = useSearchParams();
  const { environment, withEnvironment } = useVerificationEnvironment();
  const routeAgentId = React.useMemo(() => {
    const value = params?.agentId ? decodeURIComponent(params.agentId) : "";
    return value === "new" ? "" : value;
  }, [params?.agentId]);
  const requestedNetwork = searchParams.get("network");
  const [network, setNetwork] = React.useState<AgentSubgraphNetwork | null>(
    isAgentSubgraphNetwork(requestedNetwork) ? requestedNetwork : null
  );
  const [agent, setAgent] = React.useState<Agent | null>(null);
  const [enteredAgentId, setEnteredAgentId] = React.useState(routeAgentId);
  const [resolvedAgentId, setResolvedAgentId] = React.useState<string | null>(null);
  const [loadingAgent, setLoadingAgent] = React.useState(false);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const lookupAbortRef = React.useRef<AbortController | null>(null);
  const lookupSequenceRef = React.useRef(0);

  const formPrefill = React.useMemo(
    () => ({
      agentURI: agent?.agentURI,
      owner: agent?.owner,
      chainId: agent?.chainId,
      additionalInfo: buildAdditionalInfo(agent),
    }),
    [agent]
  );

  const selectSourceNetwork = React.useCallback((nextNetwork: AgentSubgraphNetwork) => {
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
    lookupSequenceRef.current += 1;
    setLoadingAgent(false);
    setNetwork(nextNetwork);
    setAgent(null);
    setResolvedAgentId(null);
    setLookupError(null);
  }, []);

  const loadAgent = React.useCallback(async (candidate: string) => {
    if (!network) {
      setLookupError("Choose the agent network first.");
      setAgent(null);
      setResolvedAgentId(null);
      return;
    }
    const selectedNetwork = network;
    const rawAgentId = candidate.trim();
    if (!/^\d+$/.test(rawAgentId)) {
      setLookupError("Enter a valid numeric agent number.");
      setAgent(null);
      setResolvedAgentId(null);
      return;
    }
    const agentId = BigInt(rawAgentId).toString();
    const lookupSequence = lookupSequenceRef.current + 1;
    lookupSequenceRef.current = lookupSequence;
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;

    setEnteredAgentId(agentId);
    setLoadingAgent(true);
    setLookupError(null);
    try {
      async function requestAgent(fresh: boolean) {
        const query = new URLSearchParams({
          agentId,
          network: selectedNetwork,
          verificationEnvironment: environment,
        });
        if (fresh) query.set("fresh", "1");
        const response = await fetch(`/api/agents/by-agent-id?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        let json: AgentLookupResponse;
        try {
          json = (await response.json()) as AgentLookupResponse;
        } catch {
          throw new Error("The agent lookup returned an invalid response.");
        }
        if (!response.ok || !json.success) {
          throw new Error(json.error || "The agent lookup is temporarily unavailable.");
        }
        return json;
      }

      let json: AgentLookupResponse | null = null;
      let firstError: Error | null = null;
      try {
        json = await requestAgent(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        firstError = error instanceof Error ? error : new Error("The first agent lookup failed.");
      }
      if (!json?.item) {
        try {
          json = await requestAgent(false);
        } catch (error) {
          if (controller.signal.aborted) return;
          throw (error instanceof Error ? error : firstError) || new Error("The live agent lookup failed.");
        }
      }
      if (controller.signal.aborted || lookupSequence !== lookupSequenceRef.current) return;
      if (!json?.item) {
        throw new Error(`Agent ${agentId} was not found on ${getAgentSubgraphLabel(selectedNetwork)} after checking live data.`);
      }
      if (json.network && json.network !== selectedNetwork) {
        throw new Error(`The lookup returned ${getAgentSubgraphLabel(json.network)} instead of ${getAgentSubgraphLabel(selectedNetwork)}.`);
      }
      setAgent(json.item as Agent);
      setResolvedAgentId(agentId);
    } catch (error) {
      if (controller.signal.aborted || lookupSequence !== lookupSequenceRef.current) return;
      setAgent(null);
      setResolvedAgentId(null);
      setLookupError(error instanceof Error ? error.message : "Unable to load this agent.");
    } finally {
      if (lookupSequence === lookupSequenceRef.current) {
        lookupAbortRef.current = null;
        setLoadingAgent(false);
      }
    }
  }, [environment, network]);

  React.useEffect(() => {
    if (!routeAgentId || !network) return;
    setEnteredAgentId(routeAgentId);
    void loadAgent(routeAgentId);
  }, [loadAgent, network, routeAgentId]);

  React.useEffect(
    () => () => {
      lookupSequenceRef.current += 1;
      lookupAbortRef.current?.abort();
    },
    []
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link href={withEnvironment("/my-agents")} className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to My Agents
      </Link>

      <header className="border-b border-border/60 pb-7">
        <div className="flex items-center gap-3">
          <FilePenLine className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Submit Your Agent</h1>
        </div>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Build and review a registry submission from an ERC-8004 registration.
        </p>
      </header>

      <section className="py-7">
        {lookupError ? <p role="alert" className="mb-4 text-sm text-red-300">{lookupError}</p> : null}
        <CollateralizeAgentForm
          agentId={enteredAgentId}
          sourceNetwork={network}
          sourceChainId={network ? AGENT_NETWORK_CHAIN_IDS[network] : undefined}
          autoFilledAgentId={resolvedAgentId}
          autoFillLoading={loadingAgent}
          onAutoFill={loadAgent}
          onSourceNetworkChange={selectSourceNetwork}
          prefill={formPrefill}
        />
      </section>
    </div>
  );
}

function SubmitLoading() {
  return (
    <div className="container mx-auto flex h-64 max-w-4xl items-center justify-center px-4 py-10 text-sm text-muted-foreground sm:px-6">
      Loading submission form...
    </div>
  );
}
