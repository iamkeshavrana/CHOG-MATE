import { describe, expect, it } from "vitest";
import { filterPreviouslyHandledDiscoverCandidates } from "./discover-exclusions";

describe("filterPreviouslyHandledDiscoverCandidates", () => {
  const candidates = ["liked-user", "new-user", "super-liked-user", "matched-user"];
  const handledUsers = ["liked-user", "super-liked-user", "matched-user"];

  it("removes previously liked and matched profiles from Discover", () => {
    expect(
      filterPreviouslyHandledDiscoverCandidates("discover", candidates, handledUsers),
    ).toEqual(["new-user"]);
  });

  it("defaults to Discover behavior when the mode is omitted", () => {
    expect(
      filterPreviouslyHandledDiscoverCandidates(undefined, candidates, handledUsers),
    ).toEqual(["new-user"]);
  });

  it("keeps previously liked profiles in Explore modes", () => {
    expect(
      filterPreviouslyHandledDiscoverCandidates("date", candidates, handledUsers),
    ).toEqual(candidates);
  });
});
