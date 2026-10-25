import { describe, expect, it } from "vitest";
import {
  canonicalGiftAmount,
  isSameGift,
  type GiftTransactionRow,
} from "./gift-record";

const MATCH = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  user_a: "11111111-1111-4111-8111-111111111111",
  user_b: "22222222-2222-4222-8222-222222222222",
};
const SENDER = "11111111-1111-4111-8111-111111111111";
const RECIPIENT = "22222222-2222-4222-8222-222222222222";
const TOKEN = "0x350035555e10d9afaf1566aaebfced5ba6c27777";
const HASH = `0x${"a".repeat(64)}`;

const giftRow: GiftTransactionRow = {
  id: "33333333-3333-4333-8333-333333333333",
  tx_hash: HASH,
  sender_user_id: SENDER,
  recipient_user_id: RECIPIENT,
  sender_wallet: "0x1111111111111111111111111111111111111111",
  recipient_wallet: "0x2222222222222222222222222222222222222222",
  token_contract: TOKEN,
  amount: "12.500000000000000000",
  transaction_type: "gift",
  status: "confirmed",
  created_at: "2026-01-01T00:00:00.000Z",
};

const expectedGift = {
  match: MATCH,
  senderId: SENDER,
  recipientId: RECIPIENT,
  senderWallet: giftRow.sender_wallet,
  recipientWallet: giftRow.recipient_wallet,
  tokenAddress: TOKEN.toUpperCase(),
  amount: "012.500",
};

describe("gift record idempotency", () => {
  it("canonicalizes database decimal formatting without floating-point conversion", () => {
    expect(canonicalGiftAmount("0012.500000000000000000")).toBe("12.5");
    expect(canonicalGiftAmount("5.000")).toBe("5");
    expect(canonicalGiftAmount("1e3")).toBeNull();
  });

  it("accepts a matching confirmed gift when a save is retried", () => {
    expect(isSameGift(giftRow, expectedGift)).toBe(true);
  });

  it("does not reuse a hash for another recipient, amount, or transaction type", () => {
    expect(isSameGift(giftRow, {
      ...expectedGift,
      recipientId: SENDER,
      senderId: RECIPIENT,
      senderWallet: giftRow.recipient_wallet,
      recipientWallet: giftRow.sender_wallet,
    })).toBe(false);
    expect(isSameGift(giftRow, { ...expectedGift, amount: "12.6" })).toBe(false);
    expect(isSameGift({ ...giftRow, transaction_type: "super_like" }, expectedGift)).toBe(false);
  });
});
