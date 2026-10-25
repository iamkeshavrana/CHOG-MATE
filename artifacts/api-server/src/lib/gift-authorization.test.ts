import { describe, expect, it } from "vitest";
import { isGiftMatchAuthorized } from "./gift-authorization";

const activeMatch = {
  user_a: "user-a",
  user_b: "user-b",
  status: "active",
};

describe("gift match authorization", () => {
  it("allows only a participant in an active match to send a gift", () => {
    expect(isGiftMatchAuthorized(activeMatch, "user-a")).toBe(true);
    expect(isGiftMatchAuthorized(activeMatch, "user-b")).toBe(true);
    expect(isGiftMatchAuthorized(activeMatch, "outsider")).toBe(false);
    expect(isGiftMatchAuthorized({ ...activeMatch, status: "unmatched" }, "user-a")).toBe(false);
  });
});
