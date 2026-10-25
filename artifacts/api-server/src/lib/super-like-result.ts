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

export const SUPER_LIKE_RECOVERY_FAILED_RESPONSE = {
  code: "SUPER_LIKE_RECOVERY_FAILED",
  error:
    "Your $CHOG transfer is verified, but CHOG MATE could not finish saving the Super Like and Match. Retry with this same transaction; do not send another payment.",
} as const;
