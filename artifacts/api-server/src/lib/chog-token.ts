import {
  createPublicClient,
  defineChain,
  decodeEventLog,
  getAddress,
  http,
  isAddress,
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

export async function verifySuperLikeTransfer(
  transactionHash: string,
  expectedSender: string,
  expectedRecipient: string,
): Promise<void> {
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
      publicClient.getTransaction({ hash }),
      publicClient.getTransactionReceipt({ hash }),
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

  const decimals = await publicClient.readContract({
    address: CHOG_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "decimals",
  });
  if (decimals > 36) {
    throw new TokenTransferVerificationError("The token decimals are invalid.", 503);
  }
  const expectedAmount = 100n * 10n ** BigInt(decimals);
  let receivedAmount = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== CHOG_TOKEN_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics,
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
      "The confirmed transfer must send exactly 100 $CHOG to this profile.",
      422,
    );
  }
}
