import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureSuperLikeMatchActive,
  type SuperLikeMatchRow,
} from "./super-like-match";

const FROM_USER = "11111111-1111-4111-8111-111111111111";
const TO_USER = "22222222-2222-4222-8222-222222222222";

const unmatched: SuperLikeMatchRow = {
  id: "a8b0d143-7722-4bd9-b100-095f94cd9123",
  user_a: FROM_USER,
  user_b: TO_USER,
  compatibility_score: 72,
  status: "unmatched",
  unmatched_by: FROM_USER,
  created_at: "2026-10-25T00:00:00.000Z",
  last_activity: "2026-10-25T00:00:00.000Z",
};

function mockQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  query.update = vi.fn(() => query);
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  return query;
}

function mockAdmin(...queries: ReturnType<typeof mockQuery>[]) {
  return {
    from: vi.fn(() => queries.shift()),
  } as unknown as SupabaseClient;
}

describe("ensureSuperLikeMatchActive", () => {
  it("reactivates an existing unmatched pair after a confirmed Super Like", async () => {
    const active = { ...unmatched, status: "active" as const, unmatched_by: null };
    const updateQuery = mockQuery({ data: active, error: null });
    const admin = mockAdmin(updateQuery);

    const result = await ensureSuperLikeMatchActive(
      admin,
      unmatched,
      FROM_USER,
      TO_USER,
    );

    expect(result).toEqual({ match: active, reactivated: true });
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", unmatched_by: null }),
    );
    expect(updateQuery.eq).toHaveBeenCalledWith("status", "unmatched");
  });

  it("accepts a concurrent retry that already reactivated the same pair", async () => {
    const active = { ...unmatched, status: "active" as const, unmatched_by: null };
    const updateQuery = mockQuery({ data: null, error: null });
    const readQuery = mockQuery({ data: active, error: null });
    const admin = mockAdmin(updateQuery, readQuery);

    const result = await ensureSuperLikeMatchActive(
      admin,
      unmatched,
      FROM_USER,
      TO_USER,
    );

    expect(result).toEqual({ match: active, reactivated: false });
  });

  it("rejects a match that does not belong to the two Super Like participants", async () => {
    const admin = mockAdmin();

    await expect(
      ensureSuperLikeMatchActive(admin, unmatched, FROM_USER, FROM_USER),
    ).rejects.toThrow("participants could not be verified");
    expect(admin.from).not.toHaveBeenCalled();
  });
});
