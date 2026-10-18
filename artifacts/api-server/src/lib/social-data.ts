import type { ChogToken } from "./chogs";
import { getSupabaseAdmin } from "./supabase";
import { CHOG_CONTRACT_ADDRESS } from "./chogs";

export interface DbProfile {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  name: string | null;
  gender: string | null;
  age: number | null;
  bio: string | null;
  photo_url: string | null;
  location: string | null;
  timezone: string | null;
  looking_for: string[];
  interests: string[];
  hobbies: string[];
  skills: string[];
  languages: string[];
  profile_visible: boolean;
  active_chog_token_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbUser {
  id: string;
  wallet_address: string;
  created_at?: string;
  last_seen?: string;
}

export interface DbChog {
  id: string;
  user_id: string;
  contract_address: string;
  token_id: string;
  image_url: string | null;
  metadata_url: string | null;
  tier: string | null;
  metadata: Record<string, unknown> | null;
  owner_wallet: string;
  verified: boolean;
}

export interface DbTrait {
  id: string;
  chog_id: string;
  trait_type: string;
  trait_value: string;
  rarity: number | null;
}

export interface ProfileBundle {
  profile: DbProfile;
  user: DbUser;
  chog: ChogToken;
}

export class SocialDataError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "SocialDataError";
  }
}

export async function syncVerifiedChogs(
  userId: string,
  walletAddress: string,
  tokens: ChogToken[],
): Promise<void> {
  const admin = getSupabaseAdmin();
  const wallet = walletAddress.toLowerCase();
  const { error: userError } = await admin.from("users").upsert(
    {
      id: userId,
      wallet_address: wallet,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (userError) throw new SocialDataError("CHOG MATE database setup is incomplete.", userError);

  if (tokens.length === 0) {
    const { error: hideError } = await admin
      .from("profiles")
      .update({ profile_visible: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (hideError) throw new SocialDataError("CHOG MATE database setup is incomplete.", hideError);
    const { error: revokeError } = await admin
      .from("chogs")
      .update({ verified: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (revokeError) throw new SocialDataError("CHOG MATE database setup is incomplete.", revokeError);
    return;
  }

  const { data: chogRows, error: chogError } = await admin
    .from("chogs")
    .upsert(
      tokens.map((token) => ({
        user_id: userId,
        contract_address: CHOG_CONTRACT_ADDRESS.toLowerCase(),
        token_id: token.tokenId,
        image_url: token.imageUrl,
        metadata_url: token.metadataUrl,
        tier: token.tier,
        metadata: token.metadata,
        owner_wallet: wallet,
        verified: token.verified,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "contract_address,token_id" },
    )
    .select("id,token_id");
  if (chogError || !chogRows) throw new SocialDataError("CHOG MATE database setup is incomplete.", chogError);

  const rowByToken = new Map<string, { id: string; token_id: string }>(
    chogRows.map((row: { id: string; token_id: string }) => [row.token_id, row]),
  );
  for (const token of tokens) {
    const row = rowByToken.get(token.tokenId);
    if (!row) continue;
    const { error: deleteError } = await admin
      .from("chog_traits")
      .delete()
      .eq("chog_id", row.id);
    if (deleteError) throw new SocialDataError("CHOG MATE database setup is incomplete.", deleteError);
    if (token.traits.length > 0) {
      const { error: traitError } = await admin.from("chog_traits").insert(
        token.traits.map((trait) => ({
          chog_id: row.id,
          trait_type: trait.traitType,
          trait_value: trait.traitValue,
          rarity: trait.rarity,
        })),
      );
      if (traitError) throw new SocialDataError("CHOG MATE database setup is incomplete.", traitError);
    }
  }

  const { error: revokeOldError } = await admin
    .from("chogs")
    .update({ verified: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .neq("contract_address", CHOG_CONTRACT_ADDRESS.toLowerCase());
  if (revokeOldError) throw new SocialDataError("CHOG MATE database setup is incomplete.", revokeOldError);
}

export async function loadProfileBundle(
  userId: string,
  selectedTokenId?: string | null,
): Promise<ProfileBundle | null> {
  const admin = getSupabaseAdmin();
  const [{ data: profile, error: profileError }, { data: user, error: userError }] =
    await Promise.all([
      admin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("users").select("*").eq("id", userId).maybeSingle(),
    ]);
  if (profileError || userError) {
    throw new SocialDataError(
      "CHOG MATE database setup is incomplete.",
      profileError ?? userError,
    );
  }
  if (!profile || !user) return null;

  const preferredId = selectedTokenId ?? profile.active_chog_token_id;
  let chogQuery = admin
    .from("chogs")
    .select("*")
    .eq("user_id", userId)
    .eq("verified", true)
    .eq("contract_address", CHOG_CONTRACT_ADDRESS.toLowerCase());
  if (preferredId) chogQuery = chogQuery.eq("token_id", preferredId);
  const { data: chog, error: chogError } = await chogQuery.limit(1).maybeSingle();
  if (chogError) throw new SocialDataError("CHOG MATE database setup is incomplete.", chogError);
  if (!chog) return null;

  const { data: traits, error: traitsError } = await admin
    .from("chog_traits")
    .select("*")
    .eq("chog_id", chog.id);
  if (traitsError) throw new SocialDataError("CHOG MATE database setup is incomplete.", traitsError);
  return {
    profile: profile as DbProfile,
    user: user as DbUser,
    chog: mapDbChog(chog as DbChog, (traits ?? []) as DbTrait[]),
  };
}

export async function loadProfileBundles(
  userIds: string[],
): Promise<Map<string, ProfileBundle>> {
  const results = new Map<string, ProfileBundle>();
  if (userIds.length === 0) return results;
  const admin = getSupabaseAdmin();
  const [profilesResult, usersResult, chogsResult] = await Promise.all([
    admin.from("profiles").select("*").in("user_id", userIds),
    admin.from("users").select("*").in("id", userIds),
    admin
      .from("chogs")
      .select("*")
      .in("user_id", userIds)
      .eq("verified", true)
      .eq("contract_address", CHOG_CONTRACT_ADDRESS.toLowerCase()),
  ]);
  if (profilesResult.error || usersResult.error || chogsResult.error) {
    throw new SocialDataError(
      "CHOG MATE database setup is incomplete.",
      profilesResult.error ?? usersResult.error ?? chogsResult.error,
    );
  }
  const profiles = (profilesResult.data ?? []) as DbProfile[];
  const users = (usersResult.data ?? []) as DbUser[];
  const chogs = (chogsResult.data ?? []) as DbChog[];
  const userMap = new Map(users.map((user) => [user.id, user]));
  const profileMap = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const chogMap = new Map<string, DbChog[]>();
  for (const chog of chogs) {
    const current = chogMap.get(chog.user_id) ?? [];
    current.push(chog);
    chogMap.set(chog.user_id, current);
  }

  const chogIds = chogs.map((chog) => chog.id);
  const { data: traits, error: traitsError } = chogIds.length
    ? await admin.from("chog_traits").select("*").in("chog_id", chogIds)
    : { data: [], error: null };
  if (traitsError) throw new SocialDataError("CHOG MATE database setup is incomplete.", traitsError);
  const traitsByChogId = new Map<string, DbTrait[]>();
  for (const trait of (traits ?? []) as DbTrait[]) {
    const current = traitsByChogId.get(trait.chog_id) ?? [];
    current.push(trait);
    traitsByChogId.set(trait.chog_id, current);
  }

  for (const userId of userIds) {
    const profile = profileMap.get(userId);
    const user = userMap.get(userId);
    const choices = chogMap.get(userId) ?? [];
    if (!profile || !user || !profile.profile_visible || choices.length === 0) continue;
    const chog =
      choices.find((item) => item.token_id === profile.active_chog_token_id) ?? choices[0];
    results.set(userId, {
      profile,
      user,
      chog: mapDbChog(chog, traitsByChogId.get(chog.id) ?? []),
    });
  }
  return results;
}

export function profileToApi(
  bundle: ProfileBundle,
  compatibility: number | null = null,
  whyYouMatch: string[] = [],
  includeAge = false,
) {
  return {
    userId: bundle.user.id,
    username: bundle.profile.username,
    displayName: bundle.profile.display_name,
    name: bundle.profile.name,
    gender: bundle.profile.gender,
    age: includeAge ? bundle.profile.age : null,
    walletAddress: bundle.user.wallet_address,
    photoUrl: bundle.profile.photo_url,
    bio: bundle.profile.bio,
    location: bundle.profile.location,
    timezone: bundle.profile.timezone,
    interests: bundle.profile.interests ?? [],
    hobbies: bundle.profile.hobbies ?? [],
    skills: bundle.profile.skills ?? [],
    languages: bundle.profile.languages ?? [],
    lookingFor: bundle.profile.looking_for ?? [],
    chog: bundle.chog,
    compatibility,
    whyYouMatch,
  };
}

export function mapDbChog(chog: DbChog, traits: DbTrait[]): ChogToken {
  const mappedTraits = traits.map((trait) => ({
    traitType: trait.trait_type,
    traitValue: trait.trait_value,
    rarity: trait.rarity,
  }));
  return {
    tokenId: chog.token_id,
    contractAddress: chog.contract_address,
    ownerWallet: chog.owner_wallet,
    verified: chog.verified,
    name: null,
    description: null,
    tier: chog.tier ??
      mappedTraits.find((trait) => trait.traitType.trim().toLowerCase() === "tier")
        ?.traitValue ?? null,
    imageUrl: chog.image_url,
    metadataUrl: chog.metadata_url,
    metadata: chog.metadata,
    traits: mappedTraits,
  };
}
