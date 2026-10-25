import { describe, expect, it } from "vitest";
import {
  isConfirmedSuperLikeMatchResult,
  SUPER_LIKE_RECOVERY_FAILED_RESPONSE,
} from "./super-like-result";

describe("isConfirmedSuperLikeMatchResult", () => {
  it("accepts a recorded Super Like with a confirmed match id", () => {
    expect(
      isConfirmedSuperLikeMatchResult({
        recorded: true,
        matched: true,
        matchId: "a8b0d143-7722-4bd9-b100-095f94cd9123",
      }),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    { recorded: false, matched: false, matchId: null },
    { recorded: true, matched: false, matchId: null },
    { recorded: true, matched: true, matchId: null },
    { recorded: true, matched: true, matchId: "" },
  ])("rejects incomplete or non-match outcomes: %j", (value) => {
    expect(isConfirmedSuperLikeMatchResult(value)).toBe(false);
  });
});

describe("SUPER_LIKE_RECOVERY_FAILED_RESPONSE", () => {
  it("gives a safe retry instruction without exposing database details", () => {
    expect(SUPER_LIKE_RECOVERY_FAILED_RESPONSE.code).toBe(
      "SUPER_LIKE_RECOVERY_FAILED",
    );
    expect(SUPER_LIKE_RECOVERY_FAILED_RESPONSE.error).toContain(
      "Retry with this same transaction",
    );
    expect(SUPER_LIKE_RECOVERY_FAILED_RESPONSE.error).toContain(
      "do not send another payment",
    );
  });
});
