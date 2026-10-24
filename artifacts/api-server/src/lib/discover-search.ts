import { CHOG_CONTRACT_ADDRESS } from "./chogs";
import { SocialDataError } from "./social-data";
import { getSupabaseAdmin } from "./supabase";

interface DiscoverSearchProfileRow {
  user_id: string;
  updated_at: string;
  active_chog_token_id: string | null;
}

interface SearchableProfileRow extends DiscoverSearchProfileRow {
  name: string | null;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  looking_for_other: string | null;
  interests: string[] | null;
  hobbies: string[] | null;
  languages: string[] | null;
  looking_for: string[] | null;
}

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

const SEARCH_BATCH_SIZE = 1000;

export async function findDiscoverSearchCandidates(
  admin: SupabaseAdmin,
  searchTerm: string,
): Promise<DiscoverSearchProfileRow[]> {
  const candidates = new Map<string, DiscoverSearchProfileRow>();
  for (const profile of await loadVisibleProfilesMatching(admin, searchTerm)) {
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
  searchTerm: string,
): Promise<SearchableProfileRow[]> {
  const rows: SearchableProfileRow[] = [];
  const normalizedTerm = searchTerm.toLocaleLowerCase();
  for (let offset = 0; ; offset += SEARCH_BATCH_SIZE) {
    const { data, error } = await admin
      .from("profiles")
      .select(
        "user_id,updated_at,active_chog_token_id,name,display_name,username,bio,looking_for_other,interests,hobbies,languages,looking_for",
      )
      .eq("profile_visible", true)
      .order("updated_at", { ascending: false })
      .order("user_id", { ascending: true })
      .range(offset, offset + SEARCH_BATCH_SIZE - 1);
    if (error) {
      throw new SocialDataError("CHOG MATE database setup is incomplete.", error);
    }
    for (const profile of (data ?? []) as SearchableProfileRow[]) {
      const searchableValues = [
        profile.name,
        profile.display_name,
        profile.username,
        profile.bio,
        profile.looking_for_other,
        ...(profile.interests ?? []),
        ...(profile.hobbies ?? []),
        ...(profile.languages ?? []),
        ...(profile.looking_for ?? []),
      ];
      if (
        searchableValues.some((value) =>
          value?.toLocaleLowerCase().includes(normalizedTerm),
        )
      ) {
        rows.push(profile);
      }
    }
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
