import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Address } from "viem";
import {
  CHOG_TOKEN_ADDRESS,
  TokenTransferVerificationError,
  verifySuperLikeTransferReceipt,
} from "./chog-token";

const SENDER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const OTHER_RECIPIENT = "0x3333333333333333333333333333333333333333";
const CHOG_DECIMALS = 18;
const TRANSFER_AMOUNT = 100n * 10n ** BigInt(CHOG_DECIMALS);

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

function transferLog(to: string) {
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
    data: encodeAbiParameters([{ type: "uint256" }], [TRANSFER_AMOUNT]),
  };
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
});
