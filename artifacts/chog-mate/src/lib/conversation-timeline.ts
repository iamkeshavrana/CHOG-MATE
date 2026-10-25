import type { GiftRecord, Message } from "@workspace/api-client-react";

export type ConversationTimelineEvent =
  | { type: "message"; id: string; createdAt: string; message: Message }
  | { type: "gift"; id: string; createdAt: string; gift: GiftRecord };

export function giftEventDescription(
  gift: Pick<GiftRecord, "senderId" | "senderName" | "recipientName">,
  currentUserId: string | undefined,
): string {
  if (gift.senderId === currentUserId) {
    return `You sent ${gift.recipientName} a gift`;
  }
  return `${gift.senderName} sent you a gift`;
}

export function buildConversationTimeline(
  messages: readonly Message[],
  gifts: readonly GiftRecord[],
): ConversationTimelineEvent[] {
  return [
    ...messages.map((message): ConversationTimelineEvent => ({
      type: "message",
      id: message.id,
      createdAt: message.createdAt,
      message,
    })),
    ...gifts
      .filter((gift) => gift.status === "confirmed")
      .map((gift): ConversationTimelineEvent => ({
        type: "gift",
        id: gift.id,
        createdAt: gift.createdAt,
        gift,
      })),
  ].sort((left, right) => {
    const timestampDifference =
      Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (Number.isFinite(timestampDifference) && timestampDifference !== 0) {
      return timestampDifference;
    }
    if (left.type !== right.type) return left.type === "gift" ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
}
