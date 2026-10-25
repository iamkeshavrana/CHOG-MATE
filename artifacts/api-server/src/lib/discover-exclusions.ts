export function filterPreviouslyLikedDiscoverCandidates(
  mode: string | undefined,
  candidateUserIds: readonly string[],
  likedUserIds: readonly string[],
): string[] {
  if ((mode ?? "discover") !== "discover") {
    return [...candidateUserIds];
  }

  const likedUsers = new Set(likedUserIds);
  return candidateUserIds.filter((userId) => !likedUsers.has(userId));
}
