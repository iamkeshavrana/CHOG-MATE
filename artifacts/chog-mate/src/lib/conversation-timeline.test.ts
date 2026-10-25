import { describe, expect, it } from "vitest";
import type { GiftRecord, Message } from "@workspace/api-client-react";
import { buildConversationTimeline, giftEventDescription } from "./conversation-timeline";

const message = (id: string, createdAt: string) =>
  ({ id, createdAt } as Message);

const gift = (id: string, createdAt: string, status: "confirmed" | "pending" = "confirmed") =>
  ({ id, createdAt, status } as GiftRecord);

describe("conversation gift timeline", () => {
  it("describes sent and received gifts from the current user's perspective", () => {
    const record = {
      senderId: "sender",
      senderName: "Chog Friend",
      recipientName: "Me",
    } as GiftRecord;

    expect(giftEventDescription(record, "sender")).toBe("You sent Me a gift");
    expect(giftEventDescription(record, "recipient")).toBe("Chog Friend sent you a gift");
  });

  it("orders confirmed gifts with messages by their event time", () => {
    const timeline = buildConversationTimeline(
      [message("message-later", "2026-10-25T10:03:00.000Z"), message("message-first", "2026-10-25T10:01:00.000Z")],
      [gift("gift-middle", "2026-10-25T10:02:00.000Z")],
    );

    expect(timeline.map((event) => `${event.type}:${event.id}`)).toEqual([
      "message:message-first",
      "gift:gift-middle",
      "message:message-later",
    ]);
  });

  it("does not render non-confirmed gift rows as chat events", () => {
    const timeline = buildConversationTimeline(
      [message("message-1", "2026-10-25T10:01:00.000Z")],
      [gift("gift-pending", "2026-10-25T10:00:00.000Z", "pending")],
    );

    expect(timeline.map((event) => event.id)).toEqual(["message-1"]);
  });
});
