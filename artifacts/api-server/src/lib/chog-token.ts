import {
  createPublicClient,
  defineChain,
  decodeEventLog,
  getAddress,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";

const DEFAULT_CHOG_TOKEN_ADDRESS =
  "0x350035555e10d9afaf1566aaebfced5ba6c27777";
const configuredTokenAddress = process.env.VITE_CHOG_TOKEN_ADDRESS?.trim();
if (configuredTokenAddress && !isAddress(configuredTokenAddress)) {
  throw new Error("VITE_CHOG_TOKEN_ADDRESS must be a valid EVM address.");
}
export const CHOG_TOKEN_ADDRESS = getAddress(
  configuredTokenAddress || DEFAULT_CHOG_TOKEN_ADDRESS,
) as Address;

const rpcValue = process.env.MONAD_RPC_URL ?? process.env.VITE_MONAD_RPC_URL;
const rpcUrl = rpcValue?.trim() || "https://rpc.monad.xyz";
const rpc = new URL(rpcUrl);
if (rpc.protocol !== "http:" && rpc.protocol !== "https:") {
  throw new Error("MONAD_RPC_URL must use HTTP or HTTPS.");
}

const monad = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpc.toString()] } },
});

const publicClient = createPublicClient({
  chain: monad,
  transport: http(rpc.toString(), { timeout: 20_000, retryCount: 1 }),
});

const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export class TokenTransferVerificationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TokenTransferVerificationError";
  }
}

type TransferLog = {
  address: string;
  data: Hex;
  topics: readonly Hex[];
};

export function verifySuperLikeTransferReceipt(
  logs: readonly TransferLog[],
  expectedSender: string,
  expectedRecipient: string,
  decimals: number,
): void {
  const expectedAmount = 100n * 10n ** BigInt(decimals);
  verifyChogTransferReceipt(logs, expectedSender, expectedRecipient, expectedAmount);
}

export function verifyChogTransferReceipt(
  logs: readonly TransferLog[],
  expectedSender: string,
  expectedRecipient: string,
  expectedAmount: bigint,
): void {
  let receivedAmount = 0n;
  for (const log of logs) {
    if (log.address.toLowerCase() !== CHOG_TOKEN_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (
        decoded.args.from.toLowerCase() === expectedSender.toLowerCase() &&
        decoded.args.to.toLowerCase() === expectedRecipient.toLowerCase()
      ) {
        receivedAmount += decoded.args.value;
      }
    } catch {
      // Ignore unrelated logs emitted by the token contract.
    }
  }
  if (receivedAmount !== expectedAmount) {
    throw new TokenTransferVerificationError(
      "The confirmed transfer amount or recipient does not match this gift.",
      422,
    );
  }
}

async function readConfirmedChogTransfer(
  transactionHash: string,
  expectedSender: string,
  expectedRecipient: string,
  client: typeof publicClient = publicClient,
): Promise<{ receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>>; decimals: number }> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
    throw new TokenTransferVerificationError("Enter a valid transaction hash.", 400);
  }
  if (!isAddress(expectedSender) || !isAddress(expectedRecipient)) {
    throw new TokenTransferVerificationError("The wallet address is invalid.", 400);
  }

  const hash = transactionHash as Hex;
  let transaction;
  let receipt;
  try {
    [transaction, receipt] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTransactionReceipt({ hash }),
    ]);
  } catch {
    throw new TokenTransferVerificationError(
      "Monad could not confirm this transaction. Wait for confirmation and try again.",
      409,
    );
  }

  if (transaction.chainId !== 143) {
    throw new TokenTransferVerificationError("The transaction is not on Monad Mainnet.", 422);
  }
  if (receipt.status !== "success") {
    throw new TokenTransferVerificationError("The token transfer failed on Monad.", 422);
  }
  if (
    transaction.from.toLowerCase() !== expectedSender.toLowerCase() ||
    transaction.to?.toLowerCase() !== CHOG_TOKEN_ADDRESS.toLowerCase()
  ) {
    throw new TokenTransferVerificationError(
      "This transaction does not transfer $CHOG from your connected wallet.",
      422,
    );
  }

  const decimals = await client.readContract({
    address: CHOG_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "decimals",
  });
  if (decimals > 36) {
    throw new TokenTransferVerificationError("The token decimals are invalid.", 503);
  }
  return { receipt, decimals };
}

export async function verifySuperLikeTransfer(
  transactionHash: string,
  expectedSender: string,
  expectedRecipient: string,
  client: typeof publicClient = publicClient,
): Promise<void> {
  const { receipt, decimals } = await readConfirmedChogTransfer(
    transactionHash,
    expectedSender,
    expectedRecipient,
    client,
  );
  verifySuperLikeTransferReceipt(
    receipt.logs,
    expectedSender,
    expectedRecipient,
    decimals,
  );
}

export async function verifyChogTransfer(
  transactionHash: string,
  expectedSender: string,
  expectedRecipient: string,
  amount: string,
  client: typeof publicClient = publicClient,
): Promise<{ amount: string; decimals: number }> {
  const { receipt, decimals } = await readConfirmedChogTransfer(
    transactionHash,
    expectedSender,
    expectedRecipient,
    client,
  );
  if (decimals > 18) {
    throw new TokenTransferVerificationError(
      "This token's precision cannot be safely recorded.",
      503,
    );
  }

  if (!/^\d+(?:\.\d+)?$/.test(amount)) {
    throw new TokenTransferVerificationError("Enter a valid $CHOG amount.", 400);
  }
  let expectedAmount: bigint;
  try {
    expectedAmount = parseUnits(amount, decimals);
  } catch {
    throw new TokenTransferVerificationError(
      `Use no more than ${decimals} decimal places for $CHOG.`,
      400,
    );
  }
  if (expectedAmount <= 0n) {
    throw new TokenTransferVerificationError("The gift amount must be greater than zero.", 400);
  }
  if (expectedAmount >= 10n ** 78n) {
    throw new TokenTransferVerificationError("The gift amount is too large to record safely.", 400);
  }

  verifyChogTransferReceipt(
    receipt.logs,
    expectedSender,
    expectedRecipient,
    expectedAmount,
  );
  return { amount: formatUnits(expectedAmount, decimals), decimals };
}
