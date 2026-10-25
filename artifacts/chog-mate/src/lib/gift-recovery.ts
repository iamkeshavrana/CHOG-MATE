export function canStartGiftTransfer(
  knownTransactionHash: string | null,
  walletOutcomeUnknown: boolean,
): boolean {
  return knownTransactionHash === null && !walletOutcomeUnknown;
}
