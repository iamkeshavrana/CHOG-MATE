import type { SupabaseClient } from "@supabase/supabase-js";
import { SocialDataError } from "./social-data";

export interface SuperLikeMatchRow {
  id: string;
  user_a: string;
  user_b: string;
  compatibility_score: number;
  status: "active" | "unmatched";
  unmatched_by: string | null;
  created_at: string;
  last_activity: string | null;
}

export async function ensureSuperLikeMatchActive(
  admin: SupabaseClient,
  match: SuperLikeMatchRow,
  fromUserId: string,
  toUserId: string,
): Promise<{ match: SuperLikeMatchRow; reactivated: boolean }> {
  const [expectedUserA, expectedUserB] = [fromUserId, toUserId].sort();
  if (match.user_a !== expectedUserA || match.user_b !== expectedUserB) {
    throw new SocialDataError("The Super Match participants could not be verified.");
  }
  if (match.status === "active") return { match, reactivated: false };

  const { data: reactivatedMatch, error: updateError } = await admin
    .from("matches")
    .update({
      status: "active",
      unmatched_by: null,
      last_activity: new Date().toISOString(),
    })
    .eq("id", match.id)
    .eq("user_a", expectedUserA)
    .eq("user_b", expectedUserB)
    .eq("status", "unmatched")
    .select("*")
    .maybeSingle();

  if (updateError) {
    throw new SocialDataError("The Super Match could not be reactivated.", updateError);
  }
  if (reactivatedMatch) {
    return { match: reactivatedMatch as SuperLikeMatchRow, reactivated: true };
  }

  // Another retry may have reactivated the match between the initial read
  // and the guarded update. Accept that result, but never return an inactive
  // match as a successful Super Like.
  const { data: currentMatch, error: readError } = await admin
    .from("matches")
    .select("*")
    .eq("id", match.id)
    .eq("user_a", expectedUserA)
    .eq("user_b", expectedUserB)
    .maybeSingle();

  if (readError || !currentMatch || currentMatch.status !== "active") {
    throw new SocialDataError(
      "The transfer is confirmed, but the Super Match is not active yet.",
      readError,
    );
  }
  return { match: currentMatch as SuperLikeMatchRow, reactivated: false };
}
