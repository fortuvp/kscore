import { GraphQLClient, gql } from "graphql-request";
import type { Agent, Feedback, AgentStats, AgentWithDetails } from "@/types/agent";
import type { AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getAgentSubgraphUrl } from "@/lib/agent-subgraphs.server";
import {
    getReputationFeedbackRequestSize,
    refreshAgentFeedbackFromChain,
} from "@/lib/reputation-feedback.server";

// Re-export types for convenience
export type { Agent, Feedback, AgentStats, AgentWithDetails };

// NOTE: keep secrets out of client bundles; this module is intended for server-side usage (API routes).
const clientsByNetwork = new Map<AgentSubgraphNetwork, GraphQLClient>();

function getClient(network: AgentSubgraphNetwork = "sepolia") {
    const existing = clientsByNetwork.get(network);
    if (existing) return existing;

    const client = new GraphQLClient(getAgentSubgraphUrl(network));
    clientsByNetwork.set(network, client);
    return client;
}

// GraphQL fragment for agent fields (reduces duplication)
const AGENT_FIELDS = `
  id
  agentId
  chainId
  owner
  operators
  agentURI
  createdAt
  updatedAt
  totalFeedback
  lastActivity
  registrationFile {
    name
    description
    image
    active
    x402Support
    supportedTrusts
    mcpEndpoint
    mcpTools
    a2aEndpoint
    a2aSkills
  }
`;

const AGENT_FIELDS_FULL = `
  id
  agentId
  chainId
  owner
  operators
  agentURI
  createdAt
  updatedAt
  totalFeedback
  lastActivity
  registrationFile {
    name
    description
    image
    active
    x402Support
    supportedTrusts
    mcpEndpoint
    mcpVersion
    mcpTools
    mcpPrompts
    mcpResources
    a2aEndpoint
    a2aVersion
    a2aSkills
    ens
    did
  }
`;

// Queries
const GET_AGENTS = gql`
  query GetAgents($first: Int!, $skip: Int!, $orderBy: Agent_orderBy!, $orderDirection: OrderDirection!) {
    agents(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection) {
      ${AGENT_FIELDS}
    }
  }
`;

const GET_AGENTS_MCP = gql`
  query GetAgentsMCP($first: Int!, $skip: Int!, $orderBy: Agent_orderBy!, $orderDirection: OrderDirection!) {
    agents(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection, where: { registrationFile_: { mcpEndpoint_not: null } }) {
      ${AGENT_FIELDS}
    }
  }
`;

const GET_AGENTS_A2A = gql`
  query GetAgentsA2A($first: Int!, $skip: Int!, $orderBy: Agent_orderBy!, $orderDirection: OrderDirection!) {
    agents(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection, where: { registrationFile_: { a2aEndpoint_not: null } }) {
      ${AGENT_FIELDS}
    }
  }
`;

const SEARCH_AGENTS = gql`
  query SearchAgents($first: Int!, $skip: Int!, $nameContains: String!) {
    agents(where: { registrationFile_: { name_contains_nocase: $nameContains } }, first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
      ${AGENT_FIELDS}
    }
  }
`;

const SEARCH_AGENTS_MCP = gql`
  query SearchAgentsMCP($first: Int!, $skip: Int!, $nameContains: String!) {
    agents(where: { registrationFile_: { name_contains_nocase: $nameContains, mcpEndpoint_not: null } }, first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
      ${AGENT_FIELDS}
    }
  }
`;

const SEARCH_AGENTS_A2A = gql`
  query SearchAgentsA2A($first: Int!, $skip: Int!, $nameContains: String!) {
    agents(where: { registrationFile_: { name_contains_nocase: $nameContains, a2aEndpoint_not: null } }, first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
      ${AGENT_FIELDS}
    }
  }
`;

const GET_AGENTS_BY_OWNER = gql`
  query GetAgentsByOwner($owner: String!, $first: Int!, $skip: Int!) {
    agents(
      where: { owner: $owner }
      first: $first
      skip: $skip
      orderBy: createdAt
      orderDirection: desc
    ) {
      ${AGENT_FIELDS}
    }
  }
`;

const GET_AGENTS_BY_OWNER_MCP = gql`
  query GetAgentsByOwnerMCP($owner: String!, $first: Int!, $skip: Int!) {
    agents(
      where: { owner: $owner, registrationFile_: { mcpEndpoint_not: null } }
      first: $first
      skip: $skip
      orderBy: createdAt
      orderDirection: desc
    ) {
      ${AGENT_FIELDS}
    }
  }
`;

const GET_AGENTS_BY_OWNER_A2A = gql`
  query GetAgentsByOwnerA2A($owner: String!, $first: Int!, $skip: Int!) {
    agents(
      where: { owner: $owner, registrationFile_: { a2aEndpoint_not: null } }
      first: $first
      skip: $skip
      orderBy: createdAt
      orderDirection: desc
    ) {
      ${AGENT_FIELDS}
    }
  }
`;

const GET_AGENT_WITH_FEEDBACK = gql`
  query GetAgentWithFeedback($id: ID!, $feedbackFirst: Int!) {
    agent(id: $id) {
      ${AGENT_FIELDS_FULL}
      feedback(where: { isRevoked: false }, orderBy: createdAt, orderDirection: desc, first: $feedbackFirst) {
        id
        value
        tag1
        tag2
        clientAddress
        createdAt
        feedbackFile {
          text
          mcpTool
          mcpPrompt
          mcpResource
          a2aSkills
          a2aContextId
          a2aTaskId
        }
      }
    }
    agentStats(id: $id) {
      totalFeedback
      averageFeedbackValue
      averageValidationScore
      totalValidations
      completedValidations
      lastActivity
    }
  }
`;

const GET_AGENT_WITH_FEEDBACK_NO_STATS = gql`
  query GetAgentWithFeedbackNoStats($id: ID!, $feedbackFirst: Int!) {
    agent(id: $id) {
      ${AGENT_FIELDS_FULL}
      feedback(where: { isRevoked: false }, orderBy: createdAt, orderDirection: desc, first: $feedbackFirst) {
        id
        value
        tag1
        tag2
        clientAddress
        createdAt
        feedbackFile {
          text
          mcpTool
          mcpPrompt
          mcpResource
          a2aSkills
          a2aContextId
          a2aTaskId
        }
      }
    }
  }
`;

const GET_AGENT_BY_AGENT_ID = gql`
  query GetAgentByAgentId($agentId: String!, $feedbackFirst: Int!) {
    agents(where: { agentId: $agentId }, first: 1) {
      ${AGENT_FIELDS_FULL}
      feedback(where: { isRevoked: false }, orderBy: createdAt, orderDirection: desc, first: $feedbackFirst) {
        id
        value
        tag1
        tag2
        clientAddress
        createdAt
        feedbackFile {
          text
          mcpTool
          mcpPrompt
          mcpResource
          a2aSkills
          a2aContextId
          a2aTaskId
        }
      }
    }
    agentStats(id: $agentId) {
      totalFeedback
      averageFeedbackValue
      averageValidationScore
      totalValidations
      completedValidations
      lastActivity
    }
  }
`;

const GET_AGENT_BY_AGENT_ID_NO_STATS = gql`
  query GetAgentByAgentIdNoStats($agentId: String!, $feedbackFirst: Int!) {
    agents(where: { agentId: $agentId }, first: 1) {
      ${AGENT_FIELDS_FULL}
      feedback(where: { isRevoked: false }, orderBy: createdAt, orderDirection: desc, first: $feedbackFirst) {
        id
        value
        tag1
        tag2
        clientAddress
        createdAt
        feedbackFile {
          text
          mcpTool
          mcpPrompt
          mcpResource
          a2aSkills
          a2aContextId
          a2aTaskId
        }
      }
    }
  }
`;

// Handler types
export type OrderBy = "createdAt" | "updatedAt" | "lastActivity" | "totalFeedback";
export type OrderDirection = "asc" | "desc";

interface GetAgentsParams {
    first?: number;
    skip?: number;
    orderBy?: OrderBy;
    orderDirection?: OrderDirection;
    protocol?: string;
    network?: AgentSubgraphNetwork;
}

interface SearchAgentsParams {
    query: string;
    first?: number;
    skip?: number;
    protocol?: string;
    network?: AgentSubgraphNetwork;
}

interface GetAgentsByOwnerParams {
    owner: string;
    first?: number;
    skip?: number;
    protocol?: string;
    network?: AgentSubgraphNetwork;
}

function isMissingAgentStatsField(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
        message.includes("Type `Query` has no field `agentStats`") ||
        message.includes('Cannot query field "agentStats" on type "Query"') ||
        message.includes("Cannot query field 'agentStats' on type 'Query'")
    );
}

// Handler functions
export async function getAgents(params: GetAgentsParams = {}): Promise<Agent[]> {
    const {
        first = 20,
        skip = 0,
        orderBy = "createdAt",
        orderDirection = "desc",
        protocol,
        network = "sepolia",
    } = params;

    let query = GET_AGENTS;
    if (protocol === "mcp") query = GET_AGENTS_MCP;
    else if (protocol === "a2a") query = GET_AGENTS_A2A;

    const response = await getClient(network).request<{ agents: Agent[] }>(query, {
        first,
        skip,
        orderBy,
        orderDirection,
    });
    return response.agents;
}

export async function searchAgents(params: SearchAgentsParams): Promise<Agent[]> {
    const { query, first = 50, skip = 0, protocol, network = "sepolia" } = params;

    let gqlQuery = SEARCH_AGENTS;
    if (protocol === "mcp") gqlQuery = SEARCH_AGENTS_MCP;
    else if (protocol === "a2a") gqlQuery = SEARCH_AGENTS_A2A;

    const response = await getClient(network).request<{ agents: Agent[] }>(gqlQuery, {
        first,
        skip,
        nameContains: query,
    });
    return response.agents;
}

export async function getAgentsByOwner(params: GetAgentsByOwnerParams): Promise<Agent[]> {
    const { owner, first = 50, skip = 0, protocol, network = "sepolia" } = params;

    let gqlQuery = GET_AGENTS_BY_OWNER;
    if (protocol === "mcp") gqlQuery = GET_AGENTS_BY_OWNER_MCP;
    else if (protocol === "a2a") gqlQuery = GET_AGENTS_BY_OWNER_A2A;

    const response = await getClient(network).request<{ agents: Agent[] }>(gqlQuery, {
        owner: owner.toLowerCase(),
        first,
        skip,
    });
    return response.agents;
}

export async function getAgentWithFeedback(
    id: string,
    feedbackFirst: number = 10,
    network: AgentSubgraphNetwork = "sepolia"
): Promise<AgentWithDetails | null> {
    const requestedFeedbackFirst = getReputationFeedbackRequestSize(network, feedbackFirst);

    try {
        const response = await getClient(network).request<{
            agent: (Agent & { feedback: Feedback[] }) | null;
            agentStats: AgentStats | null;
        }>(GET_AGENT_WITH_FEEDBACK, { id, feedbackFirst: requestedFeedbackFirst });

        if (!response.agent) return null;

        const agent = { ...response.agent, stats: response.agentStats };
        return refreshAgentFeedbackFromChain(network, agent, feedbackFirst);
    } catch (error) {
        if (!isMissingAgentStatsField(error)) throw error;

        const fallbackResponse = await getClient(network).request<{
            agent: (Agent & { feedback: Feedback[] }) | null;
        }>(GET_AGENT_WITH_FEEDBACK_NO_STATS, { id, feedbackFirst: requestedFeedbackFirst });

        if (!fallbackResponse.agent) return null;

        const agent = { ...fallbackResponse.agent, stats: null };
        return refreshAgentFeedbackFromChain(network, agent, feedbackFirst);
    }
}

export async function getAgentByAgentId(
    agentId: string,
    network: AgentSubgraphNetwork = "sepolia",
    feedbackFirst: number = 10
): Promise<AgentWithDetails | null> {
    const requestedFeedbackFirst = getReputationFeedbackRequestSize(network, feedbackFirst);

    try {
        const response = await getClient(network).request<{
            agents: (Agent & { feedback: Feedback[] })[];
            agentStats: AgentStats | null;
        }>(GET_AGENT_BY_AGENT_ID, { agentId, feedbackFirst: requestedFeedbackFirst });

        if (!response.agents || response.agents.length === 0) return null;

        const agent = { ...response.agents[0], stats: response.agentStats };
        return refreshAgentFeedbackFromChain(network, agent, feedbackFirst);
    } catch (error) {
        if (!isMissingAgentStatsField(error)) throw error;

        const fallbackResponse = await getClient(network).request<{
            agents: (Agent & { feedback: Feedback[] })[];
        }>(GET_AGENT_BY_AGENT_ID_NO_STATS, { agentId, feedbackFirst: requestedFeedbackFirst });

        if (!fallbackResponse.agents || fallbackResponse.agents.length === 0) return null;

        const agent = { ...fallbackResponse.agents[0], stats: null };
        return refreshAgentFeedbackFromChain(network, agent, feedbackFirst);
    }
}
