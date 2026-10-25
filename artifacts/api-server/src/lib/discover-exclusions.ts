export function filterPreviouslyHandledDiscoverCandidates(
  mode: string | undefined,
  candidateUserIds: readonly string[],
  handledUserIds: readonly string[],
): string[] {
  if ((mode ?? "discover") !== "discover") {
    return [...candidateUserIds];
  }

  const handledUsers = new Set(handledUserIds);
  return candidateUserIds.filter((userId) => !handledUsers.has(userId));
}

export function getActiveMatchPartnerIds(
  userId: string,
  matchesAsA: readonly { user_b: string; status: string }[],
  matchesAsB: readonly { user_a: string; status: string }[],
): string[] {
  return [
    ...matchesAsA
      .filter((match) => match.status === "active")
      .map((match) => match.user_b),
    ...matchesAsB
      .filter((match) => match.status === "active")
      .map((match) => match.user_a),
  ].filter((partnerId) => partnerId !== userId);
}
