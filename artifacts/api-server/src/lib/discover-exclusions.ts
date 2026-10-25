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
