import { describe, expect, it } from "vitest";
import {
  filterPreviouslyHandledDiscoverCandidates,
  getActiveMatchPartnerIds,
} from "./discover-exclusions";

describe("filterPreviouslyHandledDiscoverCandidates", () => {
  const candidates = ["liked-user", "new-user", "super-liked-user", "matched-user"];
  const handledUsers = ["liked-user", "super-liked-user", "matched-user"];

  it("removes previously liked and matched profiles from Discover", () => {
    expect(
      filterPreviouslyHandledDiscoverCandidates("discover", candidates, handledUsers),
    ).toEqual(["new-user"]);
  });

  it("keeps a liked profile hidden until the outgoing Like is withdrawn", () => {
    expect(
      filterPreviouslyHandledDiscoverCandidates("discover", ["liked-user"], ["liked-user"]),
    ).toEqual([]);
    expect(
      filterPreviouslyHandledDiscoverCandidates("discover", ["liked-user"], []),
    ).toEqual(["liked-user"]);
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

  it("keeps active matches out of Discover but lets an unmatched profile return after its Like is withdrawn", () => {
    const activeMatchIds = getActiveMatchPartnerIds(
      "current-user",
      [
        { user_b: "active-match", status: "active" },
        { user_b: "ended-match", status: "unmatched" },
      ],
      [],
    );
    const afterUnlike = filterPreviouslyHandledDiscoverCandidates(
      "discover",
      ["active-match", "ended-match", "new-user"],
      activeMatchIds,
    );

    expect(afterUnlike).toEqual(["ended-match", "new-user"]);
  });

  it("includes active matches where the current user is the second participant", () => {
    expect(
      getActiveMatchPartnerIds(
        "current-user",
        [],
        [
          { user_a: "active-match", status: "active" },
          { user_a: "ended-match", status: "unmatched" },
        ],
      ),
    ).toEqual(["active-match"]);
  });
});
