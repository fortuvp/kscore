type PgtcrRoundLike = {
  ruling?: string | null;
};

type PgtcrChallengeLike = {
  resolutionTime?: string | null;
  rounds?: Array<PgtcrRoundLike | null> | null;
};

type PgtcrItemLike = {
  status?: string | null;
  withdrawingTimestamp?: string | null;
  challenges?: Array<PgtcrChallengeLike | null> | null;
};

export type PgtcrChallengeOutcome = "none" | "requester" | "challenger";

export function getPgtcrChallengeOutcomeFromRuling(
  ruling: string | null | undefined
): PgtcrChallengeOutcome {
  const value = String(ruling || "").trim().toLowerCase();
  if (!value || value === "none" || value === "0") return "none";
  if (value === "accept" || value === "1" || value === "requester") return "requester";
  if (value === "reject" || value === "2" || value === "challenger") return "challenger";
  return "none";
}

export function getResolvedChallengeOutcome(
  challenge: PgtcrChallengeLike | null | undefined
): PgtcrChallengeOutcome {
  if (!challenge?.resolutionTime) return "none";

  for (const round of challenge.rounds || []) {
    const outcome = getPgtcrChallengeOutcomeFromRuling(round?.ruling);
    if (outcome !== "none") return outcome;
  }

  return "none";
}

export function getResolvedChallengeOutcomeForDisplay(params: {
  challenge: PgtcrChallengeLike | null | undefined;
  item: PgtcrItemLike | null | undefined;
  challengeIndex?: number;
}): PgtcrChallengeOutcome {
  const explicit = getResolvedChallengeOutcome(params.challenge);
  if (explicit !== "none") return explicit;

  if (!params.challenge?.resolutionTime) return "none";

  const isLatestChallenge = (params.challengeIndex || 0) === 0;
  const itemStatus = params.item?.status || null;

  if (isLatestChallenge && itemStatus === "Absent" && !isPgtcrWithdrawn(params.item)) {
    return "challenger";
  }

  if (isLatestChallenge && itemStatus && itemStatus !== "Absent" && itemStatus !== "Disputed") {
    return "requester";
  }

  return "none";
}

export function isPgtcrWithdrawn(
  item: Pick<PgtcrItemLike, "status" | "withdrawingTimestamp"> | null | undefined
): boolean {
  return item?.status === "Absent" && Number(item?.withdrawingTimestamp || "0") > 0;
}

export function getPgtcrRemovalReason(
  item: PgtcrItemLike | null | undefined
): "withdrawn" | "challengerWon" | "removed" | null {
  if (item?.status !== "Absent") return null;
  if (isPgtcrWithdrawn(item)) return "withdrawn";

  for (const challenge of item?.challenges || []) {
    if (getResolvedChallengeOutcomeForDisplay({ challenge, item }) === "challenger") {
      return "challengerWon";
    }
  }

  return "removed";
}
