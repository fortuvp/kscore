"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Agent } from "@/types/agent";
import { truncateAddress, getDisplayName, getProtocols, PROTOCOL_COLORS } from "@/lib/format";
import { computeAgentQualityScore } from "@/lib/quality-score";
import { getAddressExplorerUrl, getAddressExplorerUrlForNetwork } from "@/lib/block-explorer";
import {
  getAgentChainLabel,
  type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import { WatchToggle } from "@/components/agents/watch-toggle";
import { AgentImage } from "@/components/agents/agent-image";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";

export function AgentCard({
  agent,
  network,
}: {
  agent: Agent;
  network: AgentSubgraphNetwork;
}) {
  const { withEnvironment } = useVerificationEnvironment();
  const quality = computeAgentQualityScore(agent);
  const ownerExplorerUrl =
    getAddressExplorerUrl(agent.owner, agent.chainId) ||
    getAddressExplorerUrlForNetwork(agent.owner, network);

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-muted shrink-0">
          <AgentImage
            src={agent.registrationFile?.image}
            alt={getDisplayName(agent)}
            className="h-12 w-12 object-cover"
            fallbackClassName="text-sm"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{getDisplayName(agent)}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {agent.registrationFile?.description || "No description"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-xs">
          {getAgentChainLabel(agent.chainId, network)}
        </Badge>
        {getProtocols(agent).map((protocol) => (
          <Badge key={`${agent.id}-${protocol}`} variant="outline" className={`text-xs ${PROTOCOL_COLORS[protocol]}`}>
            {protocol}
          </Badge>
        ))}
        {agent.registrationFile?.x402Support ? (
          <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-600 border-cyan-500/20">
            x402
          </Badge>
        ) : null}
        <Badge variant="outline" className="text-xs">
          Quality {quality}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        {ownerExplorerUrl ? (
          <a
            href={ownerExplorerUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-muted-foreground underline-offset-2 hover:underline"
          >
            {truncateAddress(agent.owner)}
          </a>
        ) : (
          <span className="font-mono text-muted-foreground">{truncateAddress(agent.owner)}</span>
        )}
        <div className="flex items-center gap-2">
          <WatchToggle agent={agent} network={network} size="sm" className="h-7 px-2" />
          <Link
            href={withEnvironment(`/agents/${encodeURIComponent(agent.id)}?network=${network}`)}
            className="font-medium text-primary hover:text-primary/80"
          >
            View
          </Link>
        </div>
      </div>
    </div>
  );
}
