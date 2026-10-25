import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseUnits, type Address } from "viem";
import {
  CHOG_TOKEN_ADDRESS,
  TokenTransferVerificationError,
  verifyChogTransfer,
  verifySuperLikeTransfer,
  verifySuperLikeTransferReceipt,
} from "./chog-token";

const SENDER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const OTHER_RECIPIENT = "0x3333333333333333333333333333333333333333";
const CHOG_DECIMALS = 18;
const TRANSFER_AMOUNT = 100n * 10n ** BigInt(CHOG_DECIMALS);
const TRANSACTION_HASH = `0x${"a".repeat(64)}`;

const transferEventAbi = [
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

function transferLog(to: string, amount = TRANSFER_AMOUNT) {
  const [eventSignature] = encodeEventTopics({
    abi: transferEventAbi,
    eventName: "Transfer",
  });
  return {
    address: CHOG_TOKEN_ADDRESS,
    topics: [
      eventSignature,
      encodeAbiParameters([{ type: "address" }], [SENDER as Address]),
      encodeAbiParameters([{ type: "address" }], [to as Address]),
    ],
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  };
}

function verifierClient(overrides: Record<string, unknown> = {}) {
  return {
    getTransaction: vi.fn().mockResolvedValue({
      chainId: 143,
      from: SENDER,
      to: CHOG_TOKEN_ADDRESS,
    }),
    getTransactionReceipt: vi.fn().mockResolvedValue({
      status: "success",
      logs: [transferLog(RECIPIENT)],
    }),
    readContract: vi.fn().mockResolvedValue(CHOG_DECIMALS),
    ...overrides,
  } as never;
}

describe("Super Like receipt recipient verification", () => {
  it("accepts an exact 100 $CHOG Transfer event to the verified recipient", () => {
    expect(() =>
      verifySuperLikeTransferReceipt(
        [transferLog(RECIPIENT)],
        SENDER,
        RECIPIENT,
        CHOG_DECIMALS,
      ),
    ).not.toThrow();
  });

  it("rejects a confirmed 100 $CHOG Transfer event naming another recipient", () => {
    let thrown: unknown;
    try {
      verifySuperLikeTransferReceipt(
        [transferLog(OTHER_RECIPIENT)],
        SENDER,
        RECIPIENT,
        CHOG_DECIMALS,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TokenTransferVerificationError);
    expect(thrown).toMatchObject({ status: 422 });
  });

  it("rejects a transfer with the wrong amount", () => {
    const [eventSignature] = encodeEventTopics({
      abi: transferEventAbi,
      eventName: "Transfer",
    });
    const wrongAmountLog = {
      address: CHOG_TOKEN_ADDRESS,
      topics: [
        eventSignature,
        encodeAbiParameters([{ type: "address" }], [SENDER as Address]),
        encodeAbiParameters([{ type: "address" }], [RECIPIENT as Address]),
      ],
      data: encodeAbiParameters([{ type: "uint256" }], [TRANSFER_AMOUNT - 1n]),
    };

    expect(() =>
      verifySuperLikeTransferReceipt(
        [wrongAmountLog],
        SENDER,
        RECIPIENT,
        CHOG_DECIMALS,
      ),
    ).toThrow(TokenTransferVerificationError);
  });
});

describe("Super Like on-chain verification", () => {
  it("accepts a successful exact transfer on Monad", async () => {
    await expect(
      verifySuperLikeTransfer(
        TRANSACTION_HASH,
        SENDER,
        RECIPIENT,
        verifierClient(),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a transaction from the wrong network", async () => {
    await expect(
      verifySuperLikeTransfer(
        TRANSACTION_HASH,
        SENDER,
        RECIPIENT,
        verifierClient({
          getTransaction: vi.fn().mockResolvedValue({
            chainId: 1,
            from: SENDER,
            to: CHOG_TOKEN_ADDRESS,
          }),
        }),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("rejects a reverted transaction", async () => {
    await expect(
      verifySuperLikeTransfer(
        TRANSACTION_HASH,
        SENDER,
        RECIPIENT,
        verifierClient({
          getTransactionReceipt: vi.fn().mockResolvedValue({
            status: "reverted",
            logs: [],
          }),
        }),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("rejects a transaction from another sender or to another token contract", async () => {
    const wrongSender = verifierClient({
      getTransaction: vi.fn().mockResolvedValue({
        chainId: 143,
        from: OTHER_RECIPIENT,
        to: CHOG_TOKEN_ADDRESS,
      }),
    });
    await expect(
      verifySuperLikeTransfer(
        TRANSACTION_HASH,
        SENDER,
        RECIPIENT,
        wrongSender,
      ),
    ).rejects.toMatchObject({ status: 422 });

    const wrongToken = verifierClient({
      getTransaction: vi.fn().mockResolvedValue({
        chainId: 143,
        from: SENDER,
        to: OTHER_RECIPIENT,
      }),
    });
    await expect(
      verifySuperLikeTransfer(
        TRANSACTION_HASH,
        SENDER,
        RECIPIENT,
        wrongToken,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("leaves an RPC timeout retryable instead of treating it as a failed payment", async () => {
    await expect(
      verifySuperLikeTransfer(
        TRANSACTION_HASH,
        SENDER,
        RECIPIENT,
        verifierClient({
          getTransaction: vi.fn().mockRejectedValue(new Error("RPC timeout")),
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("$CHOG gift on-chain verification", () => {
  it("verifies the exact dynamic amount and returns its canonical decimal value", async () => {
    const amount = parseUnits("12.5", CHOG_DECIMALS);
    const client = verifierClient({
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        logs: [transferLog(RECIPIENT, amount)],
      }),
    });

    await expect(
      verifyChogTransfer(TRANSACTION_HASH, SENDER, RECIPIENT, "12.500", client),
    ).resolves.toEqual({ amount: "12.5", decimals: CHOG_DECIMALS });
  });

  it("rejects a mismatched amount or recipient", async () => {
    const amount = parseUnits("3", CHOG_DECIMALS);
    const wrongAmount = verifierClient({
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        logs: [transferLog(RECIPIENT, amount - 1n)],
      }),
    });
    await expect(
      verifyChogTransfer(TRANSACTION_HASH, SENDER, RECIPIENT, "3", wrongAmount),
    ).rejects.toMatchObject({ status: 422 });

    const wrongRecipient = verifierClient({
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        logs: [transferLog(OTHER_RECIPIENT, amount)],
      }),
    });
    await expect(
      verifyChogTransfer(TRANSACTION_HASH, SENDER, RECIPIENT, "3", wrongRecipient),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("rejects zero amounts and amounts with more precision than the token supports", async () => {
    await expect(
      verifyChogTransfer(TRANSACTION_HASH, SENDER, RECIPIENT, "0", verifierClient()),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      verifyChogTransfer(
        TRANSACTION_HASH,
        SENDER,
        RECIPIENT,
        "0.0000000000000000001",
        verifierClient(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects token precision that the database cannot represent", async () => {
    await expect(
      verifyChogTransfer(
        TRANSACTION_HASH,
        SENDER,
        RECIPIENT,
        "1",
        verifierClient({
          readContract: vi.fn().mockResolvedValue(19),
        }),
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
