import { describe, expect, it } from "vitest";
import { filterPreviouslyLikedDiscoverCandidates } from "./discover-exclusions";

describe("filterPreviouslyLikedDiscoverCandidates", () => {
  const candidates = ["liked-user", "new-user", "super-liked-user"];
  const likedUsers = ["liked-user", "super-liked-user"];

  it("removes previously liked profiles from Discover", () => {
    expect(
      filterPreviouslyLikedDiscoverCandidates("discover", candidates, likedUsers),
    ).toEqual(["new-user"]);
  });

  it("defaults to Discover behavior when the mode is omitted", () => {
    expect(
      filterPreviouslyLikedDiscoverCandidates(undefined, candidates, likedUsers),
    ).toEqual(["new-user"]);
  });

  it("keeps previously liked profiles in Explore modes", () => {
    expect(
      filterPreviouslyLikedDiscoverCandidates("date", candidates, likedUsers),
    ).toEqual(candidates);
  });
});
