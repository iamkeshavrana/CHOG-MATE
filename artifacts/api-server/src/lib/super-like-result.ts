export function isConfirmedSuperLikeMatchResult(
  value: unknown,
): value is { recorded: true; matched: true; matchId: string } {
  if (!value || typeof value !== "object") return false;
  const result = value as {
    recorded?: unknown;
    matched?: unknown;
    matchId?: unknown;
  };
  return (
    result.recorded === true &&
    result.matched === true &&
    typeof result.matchId === "string" &&
    result.matchId.length > 0
  );
}
