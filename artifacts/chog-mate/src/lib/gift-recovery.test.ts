import { describe, expect, it } from "vitest";
import { canStartGiftTransfer } from "./gift-recovery";

describe("gift transfer recovery lock", () => {
  it("allows a new transfer when there is no unresolved wallet submission", () => {
    expect(canStartGiftTransfer(null, false)).toBe(true);
  });

  it("blocks a second transfer while a transaction hash still needs saving", () => {
    expect(canStartGiftTransfer(`0x${"a".repeat(64)}`, false)).toBe(false);
  });

  it("blocks a second transfer when the wallet outcome is unknown", () => {
    expect(canStartGiftTransfer(null, true)).toBe(false);
  });
});
