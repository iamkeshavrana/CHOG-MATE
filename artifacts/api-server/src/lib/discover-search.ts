import { CHOG_CONTRACT_ADDRESS } from "./chogs";
import { SocialDataError } from "./social-data";
import { getSupabaseAdmin } from "./supabase";

interface DiscoverSearchProfileRow {
  user_id: string;
  updated_at: string;
  active_chog_token_id: string | null;
}

type DiscoverSearchColumn = "name" | "display_name" | "username";
type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

const SEARCH_BATCH_SIZE = 1000;
const SEARCHABLE_PROFILE_COLUMNS: DiscoverSearchColumn[] = [
  "name",
  "display_name",
  "username",
];

export async function findDiscoverSearchCandidates(
  admin: SupabaseAdmin,
  searchTerm: string,
): Promise<DiscoverSearchProfileRow[]> {
  const pattern = `%${escapeLikePattern(searchTerm)}%`;
  const profileMatches = await Promise.all(
    SEARCHABLE_PROFILE_COLUMNS.map((column) =>
      loadVisibleProfilesMatching(admin, column, pattern),
    ),
  );
  const candidates = new Map<string, DiscoverSearchProfileRow>();
  for (const profile of profileMatches.flat()) {
    candidates.set(profile.user_id, profile);
  }

  const tokenSearchTerm =
    /^(?:#\s*)?(\d+)$/.exec(searchTerm)?.[1] ??
    /#\s*(\d+)\s*$/.exec(searchTerm)?.[1];
  if (tokenSearchTerm) {
    const tokenMatches = await loadVerifiedChogTokenMatches(
      admin,
      `%${escapeLikePattern(tokenSearchTerm)}%`,
    );
    const tokensByUser = new Map<string, Set<string>>();
    for (const token of tokenMatches) {
      const userTokens = tokensByUser.get(token.user_id) ?? new Set<string>();
      userTokens.add(token.token_id);
      tokensByUser.set(token.user_id, userTokens);
    }
    const tokenProfileMatches = await loadVisibleProfilesByUserIds(
      admin,
      [...tokensByUser.keys()],
    );
    for (const profile of tokenProfileMatches) {
      if (
        profile.active_chog_token_id &&
        tokensByUser.get(profile.user_id)?.has(profile.active_chog_token_id)
      ) {
        candidates.set(profile.user_id, profile);
      }
    }
  }

  return [...candidates.values()].sort(
    (a, b) =>
      b.updated_at.localeCompare(a.updated_at) ||
      a.user_id.localeCompare(b.user_id),
  );
}

async function loadVisibleProfilesMatching(
  admin: SupabaseAdmin,
  column: DiscoverSearchColumn,
  pattern: string,
): Promise<DiscoverSearchProfileRow[]> {
  const rows: DiscoverSearchProfileRow[] = [];
  for (let offset = 0; ; offset += SEARCH_BATCH_SIZE) {
    const { data, error } = await admin
      .from("profiles")
      .select("user_id,updated_at,active_chog_token_id")
      .eq("profile_visible", true)
      .ilike(column, pattern)
      .order("updated_at", { ascending: false })
      .order("user_id", { ascending: true })
      .range(offset, offset + SEARCH_BATCH_SIZE - 1);
    if (error) {
      throw new SocialDataError("CHOG MATE database setup is incomplete.", error);
    }
    rows.push(...((data ?? []) as DiscoverSearchProfileRow[]));
    if ((data?.length ?? 0) < SEARCH_BATCH_SIZE) break;
  }
  return rows;
}

async function loadVerifiedChogTokenMatches(
  admin: SupabaseAdmin,
  pattern: string,
): Promise<Array<{ user_id: string; token_id: string }>> {
  const rows: Array<{ user_id: string; token_id: string }> = [];
  for (let offset = 0; ; offset += SEARCH_BATCH_SIZE) {
    const { data, error } = await admin
      .from("chogs")
      .select("user_id,token_id")
      .eq("verified", true)
      .eq("contract_address", CHOG_CONTRACT_ADDRESS.toLowerCase())
      .ilike("token_id", pattern)
      .order("token_id", { ascending: true })
      .range(offset, offset + SEARCH_BATCH_SIZE - 1);
    if (error) {
      throw new SocialDataError("CHOG MATE database setup is incomplete.", error);
    }
    rows.push(...((data ?? []) as Array<{ user_id: string; token_id: string }>));
    if ((data?.length ?? 0) < SEARCH_BATCH_SIZE) break;
  }
  return rows;
}

async function loadVisibleProfilesByUserIds(
  admin: SupabaseAdmin,
  userIds: string[],
): Promise<DiscoverSearchProfileRow[]> {
  const rows: DiscoverSearchProfileRow[] = [];
  const batchSize = 250;
  for (let offset = 0; offset < userIds.length; offset += batchSize) {
    const batch = userIds.slice(offset, offset + batchSize);
    const { data, error } = await admin
      .from("profiles")
      .select("user_id,updated_at,active_chog_token_id")
      .eq("profile_visible", true)
      .in("user_id", batch);
    if (error) {
      throw new SocialDataError("CHOG MATE database setup is incomplete.", error);
    }
    rows.push(...((data ?? []) as DiscoverSearchProfileRow[]));
  }
  return rows;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
