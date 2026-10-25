import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../chog-mate/supabase/migrations/0016_super_like_recovery_notifications.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Super Like recovery migration", () => {
  it("repairs a missing Super Like even when its confirmed transaction already exists", () => {
    const repairStart = migration.indexOf(
      "-- Upsert even when the transaction row already exists;",
    );
    const repairEnd = migration.indexOf(
      "-- Locking the transaction row serializes retries with this same hash.",
      repairStart,
    );
    const repairBlock = migration.slice(repairStart, repairEnd);

    expect(repairStart).toBeGreaterThanOrEqual(0);
    expect(repairEnd).toBeGreaterThan(repairStart);
    expect(repairBlock).toMatch(/insert into public\.super_likes/i);
    expect(repairBlock).toMatch(
      /on conflict\s*\(from_user_id,\s*to_user_id\)\s*do update/i,
    );
    expect(repairBlock).toMatch(/transaction_hash = excluded\.transaction_hash/i);
    expect(repairBlock).toMatch(/transaction_id = excluded\.transaction_id/i);
    expect(repairBlock).not.toMatch(/if\s+v_transaction_id\s+is\s+null/i);
  });

  it("reactivates an existing pair and inserts only missing match notifications", () => {
    expect(migration).toMatch(
      /on conflict\s*\(user_a,\s*user_b\)\s*do update\s+set compatibility_score = excluded\.compatibility_score,\s+status = 'active',\s+unmatched_by = null/is,
    );
    expect(migration).toMatch(
      /insert into public\.notifications\s*\(user_id,\s*actor_id,\s*type,\s*related_id\)\s*select p_to_user_id,\s*p_from_user_id,\s*'match',\s*v_match_id\s*where not exists/is,
    );
    expect(migration).toMatch(
      /insert into public\.notifications\s*\(user_id,\s*actor_id,\s*type,\s*related_id\)\s*select p_from_user_id,\s*p_to_user_id,\s*'match',\s*v_match_id\s*where not exists/is,
    );
  });

  it("exposes both recovery RPCs to the API service role only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.record_swipe\(uuid,\s*uuid,\s*text,\s*integer,\s*text\)\s+from public,\s*anon,\s*authenticated/is,
    );
    expect(migration).toMatch(
      /grant execute on function public\.record_swipe\(uuid,\s*uuid,\s*text,\s*integer,\s*text\)\s+to service_role/is,
    );
    expect(migration).toMatch(
      /revoke all on function public\.ensure_super_like_match_notifications\(uuid,\s*uuid,\s*uuid\)\s+from public,\s*anon,\s*authenticated/is,
    );
    expect(migration).toMatch(
      /grant execute on function public\.ensure_super_like_match_notifications\(uuid,\s*uuid,\s*uuid\)\s+to service_role/is,
    );
  });
});
