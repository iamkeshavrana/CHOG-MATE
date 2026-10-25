export interface GiftTransactionRow {
  id: string;
  tx_hash: string;
  sender_user_id: string;
  recipient_user_id: string;
  sender_wallet: string;
  recipient_wallet: string;
  token_contract: string;
  amount: string | number;
  transaction_type: string;
  status: string;
  created_at: string;
}

export function canonicalGiftAmount(value: string): string | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
}

export function isSameGift(
  row: GiftTransactionRow,
  expected: {
    match: { user_a: string; user_b: string };
    senderId: string;
    recipientId: string;
    senderWallet: string;
    recipientWallet: string;
    tokenAddress: string;
    amount: string;
  },
): boolean {
  const rowAmount = canonicalGiftAmount(String(row.amount));
  const expectedAmount = canonicalGiftAmount(expected.amount);
  const belongsToMatch =
    (row.sender_user_id === expected.match.user_a &&
      row.recipient_user_id === expected.match.user_b) ||
    (row.sender_user_id === expected.match.user_b &&
      row.recipient_user_id === expected.match.user_a);
  return Boolean(
    belongsToMatch &&
      row.transaction_type === "gift" &&
      row.status === "confirmed" &&
      row.sender_user_id === expected.senderId &&
      row.recipient_user_id === expected.recipientId &&
      /^0x[a-fA-F0-9]{64}$/.test(row.tx_hash) &&
      row.sender_wallet.toLowerCase() === expected.senderWallet.toLowerCase() &&
      row.recipient_wallet.toLowerCase() === expected.recipientWallet.toLowerCase() &&
      row.token_contract.toLowerCase() === expected.tokenAddress.toLowerCase() &&
      rowAmount &&
      expectedAmount &&
      rowAmount === expectedAmount
  );
}
