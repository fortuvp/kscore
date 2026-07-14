import { GraphQLClient, gql } from "graphql-request";
import { getGoldskyApiKey, getPgtcrDeployment } from "@/lib/curate-config";
import {
  DEFAULT_VERIFICATION_ENVIRONMENT,
  type VerificationEnvironment,
} from "@/lib/verification-environment";

export function makePgtcrSubgraphClient(
  verificationEnvironment: VerificationEnvironment = DEFAULT_VERIFICATION_ENVIRONMENT
) {
  const url = getPgtcrDeployment(verificationEnvironment).subgraphUrl;
  const apiKey = getGoldskyApiKey(verificationEnvironment);
  return new GraphQLClient(url, apiKey ? { headers: { "x-api-key": apiKey } } : undefined);
}

export type PgtcrRegistryMetaEvidence = {
  metaEvidenceURI: string;
  arbitratorExtraData: string;
  metadata?: {
    policyURI?: string | null;
    title?: string | null;
    itemName?: string | null;
    itemNamePlural?: string | null;
    description?: string | null;
  } | null;
};

export type PgtcrRegistryInfo = {
  id: string;
  token: string;
  submissionMinDeposit: string;
  submissionPeriod: string;
  reinclusionPeriod: string;
  withdrawingPeriod: string;
  arbitrationParamsCooldown: string;
  challengeStakeMultiplier: string;
  winnerStakeMultiplier: string;
  loserStakeMultiplier: string;
  sharedStakeMultiplier: string;
  MULTIPLIER_DIVISOR?: string;
  arbitrator: { id: string };
  arbitrationSettings: PgtcrRegistryMetaEvidence[];
};

const REGISTRY_QUERY = gql`
  query Registry($id: ID!) {
    registry(id: $id) {
      id
      token
      submissionMinDeposit
      submissionPeriod
      reinclusionPeriod
      withdrawingPeriod
      arbitrationParamsCooldown
      challengeStakeMultiplier
      winnerStakeMultiplier
      loserStakeMultiplier
      sharedStakeMultiplier
      arbitrator { id }
      arbitrationSettings(orderBy: timestamp, orderDirection: desc, first: 5) {
        timestamp
        arbitratorExtraData
        metaEvidenceURI
        metadata {
          title
          description
          itemName
          itemNamePlural
          policyURI
        }
      }
    }
  }
`;

export async function fetchPgtcrRegistryInfo(
  verificationEnvironment: VerificationEnvironment = DEFAULT_VERIFICATION_ENVIRONMENT
): Promise<PgtcrRegistryInfo> {
  const registryAddress = getPgtcrDeployment(verificationEnvironment).registryAddress.toLowerCase();
  const client = makePgtcrSubgraphClient(verificationEnvironment);
  const res = await client.request<{ registry: PgtcrRegistryInfo | null }>(REGISTRY_QUERY, {
    id: registryAddress,
  });
  if (!res.registry) throw new Error("PGTCR registry not found in subgraph");
  return res.registry;
}

export type PgtcrItemWithChallengesAndEvidence = {
  id: string;
  itemID: string;
  data: string;
  status: string;
  includedAt: string;
  stake: string;
  arbitrationDeposit: string;
  submitter: string;
  withdrawingTimestamp?: string;
  metadata?: {
    key0?: string | null;
    key1?: string | null;
    key2?: string | null;
  } | null;
  submissions: Array<{
    submissionID: string;
    createdAt: string;
    creationTx: string;
    submitter: string;
    withdrawingTimestamp: string;
    withdrawingTx?: string | null;
  }>;
  evidences: Array<{
    party: string;
    URI: string;
    number: string;
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
  challenges: Array<{
    challengeID: string;
    disputeID: string;
    createdAt: string;
    creationTx?: string | null;
    resolutionTime?: string | null;
    resolutionTx?: string | null;
    challenger: string;
    challengerStake: string;
    itemStake: string;
    arbitrationSetting: { arbitratorExtraData: string };
    rounds: Array<{
      appealPeriodStart: string;
      appealPeriodEnd: string;
      ruling: string;
      rulingTime: string;
      hasPaidRequester: boolean;
      hasPaidChallenger: boolean;
      amountPaidRequester: string;
      amountPaidChallenger: string;
      appealed: boolean;
      appealedAt?: string | null;
      txHashAppealPossible?: string | null;
      txHashAppealDecision?: string | null;
      creationTime: string;
    }>;
  }>;
};

const ITEM_BY_ITEM_ID = gql`
  query ItemByItemId($id: ID!) {
    item(id: $id) {
      id
      itemID
      data
      status
      includedAt
      stake
      arbitrationDeposit
      submitter
      withdrawingTimestamp
      metadata { key0 key1 key2 }
      submissions(orderBy: createdAt, orderDirection: desc, first: 10) {
        submissionID
        createdAt
        creationTx
        submitter
        withdrawingTimestamp
        withdrawingTx
      }
      evidences(orderBy: number, orderDirection: desc, first: 50) {
        party
        URI
        number
        timestamp
        txHash
        metadata { name title description fileURI fileTypeExtension }
      }
      challenges(orderBy: createdAt, orderDirection: desc, first: 10) {
        challengeID
        disputeID
        createdAt
        creationTx
        resolutionTime
        resolutionTx
        challenger
        challengerStake
        itemStake
        arbitrationSetting { arbitratorExtraData }
        rounds(orderBy: creationTime, orderDirection: desc, first: 5) {
          appealPeriodStart
          appealPeriodEnd
          ruling
          rulingTime
          hasPaidRequester
          hasPaidChallenger
          amountPaidRequester
          amountPaidChallenger
          appealed
          appealedAt
          txHashAppealPossible
          txHashAppealDecision
          creationTime
        }
      }
    }
  }
`;

export async function fetchPgtcrItemByItemEntityId(
  itemEntityId: string,
  verificationEnvironment: VerificationEnvironment = DEFAULT_VERIFICATION_ENVIRONMENT
): Promise<PgtcrItemWithChallengesAndEvidence | null> {
  const client = makePgtcrSubgraphClient(verificationEnvironment);
  const res = await client.request<{ item: PgtcrItemWithChallengesAndEvidence | null }>(ITEM_BY_ITEM_ID, {
    id: itemEntityId,
  });
  return res.item;
}

export async function fetchPgtcrItemByItemIdBytes(
  itemIdBytes32: string,
  verificationEnvironment: VerificationEnvironment = DEFAULT_VERIFICATION_ENVIRONMENT
): Promise<PgtcrItemWithChallengesAndEvidence | null> {
  const registryAddress = getPgtcrDeployment(verificationEnvironment).registryAddress.toLowerCase();
  const id = `${itemIdBytes32.toLowerCase()}@${registryAddress}`;
  return fetchPgtcrItemByItemEntityId(id, verificationEnvironment);
}
