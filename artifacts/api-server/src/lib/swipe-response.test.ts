import { describe, expect, it } from "vitest";
import { SwipeProfileResponse } from "@workspace/api-zod";
import { toSwipeMatchResponse } from "./swipe-response";

const currentUserId = "c1ccbb3b-ef6a-4636-be60-ddab1e8fb7c0";
const profile = {
  userId: "75235f04-6d9c-4196-a013-4963aa51d397",
  username: "match-user",
  displayName: "Match User",
  gender: null,
  age: null,
  walletAddress: "0x58332c7e9ec6da74dc3c6989d3c97a2a4ca2ccdd",
  walletVerified: true,
  bio: null,
  interests: [],
  hobbies: [],
  languages: [],
  lookingFor: [],
  lookingForOther: null,
  chog: {
    tokenId: "123",
    contractAddress: "0x350035555e10d9afaf1566aaebfced5ba6c27777",
    ownerWallet: "0x58332c7e9ec6da74dc3c6989d3c97a2a4ca2ccdd",
    verified: true,
    description: null,
    tier: null,
  },
};
const baseMatch = {
  id: "13e39b15-b468-4984-98db-b2266b238802",
  status: "active" as const,
  unmatched_by: null,
  compatibility_score: 5,
  created_at: "2026-10-25T09:00:00.000Z",
  last_activity: null,
};

describe("toSwipeMatchResponse", () => {
  it("returns the required active match fields accepted by the swipe API schema", () => {
    const match = toSwipeMatchResponse(baseMatch, profile, currentUserId);

    expect(
      SwipeProfileResponse.parse({
        recorded: true,
        matched: true,
        match,
      }),
    ).toMatchObject({
      matched: true,
      match: {
        id: baseMatch.id,
        status: "active",
        rematchAvailable: false,
      },
    });
  });

  it("only enables rematching for the user who unmatched the pair", () => {
    const unmatched = {
      ...baseMatch,
      status: "unmatched" as const,
      unmatched_by: currentUserId,
    };
    const match = toSwipeMatchResponse(unmatched, profile, currentUserId);

    expect(match.rematchAvailable).toBe(true);
    expect(
      toSwipeMatchResponse(unmatched, profile, "another-user").rematchAvailable,
    ).toBe(false);
  });
});
