import { Router, type IRouter, type Request, type Response } from "express";
import {
  DiscoverProfilesQueryParams,
  DiscoverProfilesResponse,
  GetMeResponse,
  GetUserProfileParams,
  GetUserProfileResponse,
  SelectActiveChogBody,
  UpdateDiscoverVisibilityBody,
  UpdateDiscoverVisibilityResponse,
  UpdateMeProfileBody,
  UpdateMeProfileResponse,
} from "@workspace/api-zod";
import { getAddress, isAddress } from "viem";
import { calculateCompatibility } from "../lib/compatibility";
import {
  calculateDiscoveryRank,
  calculateLookingForRelevance,
  calculateProfileCompleteness,
  calculateRecentActivity,
} from "../lib/discovery-ranking";
import { filterPreviouslyLikedDiscoverCandidates } from "../lib/discover-exclusions";
import { findDiscoverSearchCandidates } from "../lib/discover-search";
import {
  CHOG_CONTRACT_ADDRESS,
  getOwnedChogs,
  isCurrentChogOwner,
} from "../lib/chogs";
import {
  loadProfileBundle,
  loadProfileBundles,
  profileToApi,
  SocialDataError,
  syncVerifiedChogs,
} from "../lib/social-data";
import { getSupabaseAdmin } from "../lib/supabase";
import { getSafeBackendErrorFields, toApiFailure } from "../lib/backend-errors";
import { readWalletSession, requireWalletSession } from "../lib/wallet-auth";

type DiscoverQuery = ReturnType<typeof DiscoverProfilesQueryParams.parse>;

const router: IRouter = Router();

router.get("/profiles/:userId", async (req, res): Promise<void> => {
  const parsed = GetUserProfileParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(404).json({ error: "This profile is not available." });
    return;
  }

  try {
    const targetUserId = parsed.data.userId;
    const session = readWalletSession(req);
    const bundle = await loadProfileBundle(targetUserId);
    if (!bundle) {
      res.status(404).json({ error: "This profile is not available." });
      return;
    }

    const admin = getSupabaseAdmin();
    if (session && session.userId !== targetUserId) {
      const [blockedByMe, blockedMe] = await Promise.all([
        admin
          .from("blocks")
          .select("id")
          .eq("blocker_id", session.userId)
          .eq("blocked_user_id", targetUserId)
          .maybeSingle(),
        admin
          .from("blocks")
          .select("id")
          .eq("blocker_id", targetUserId)
          .eq("blocked_user_id", session.userId)
          .maybeSingle(),
      ]);
      if (blockedByMe.error || blockedMe.error) {
        throw new SocialDataError("CHOG MATE profiles are not ready yet.");
      }
      if (blockedByMe.data || blockedMe.data) {
        res.status(404).json({ error: "This profile is not available." });
        return;
      }

    }

    if (!isAddress(bundle.user.wallet_address)) {
      res.status(404).json({ error: "This profile is not available." });
      return;
    }
    const ownsSelectedChog = await isCurrentChogOwner(
      getAddress(bundle.user.wallet_address),
      bundle.chog.tokenId,
    );
    if (ownsSelectedChog === null) {
      res.status(503).json({ error: "Ownership checks are temporarily unavailable." });
      return;
    }
    if (!ownsSelectedChog) {
      res.status(404).json({ error: "This profile is not available." });
      return;
    }

    res.json(GetUserProfileResponse.parse(profileToApi(bundle)));
  } catch (error) {
    sendProfileError(req, res, error);
  }
});

router.get("/me", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;

  try {
    const chogs = await getOwnedChogs(getAddress(session.walletAddress));
    await syncVerifiedChogs(session.userId, session.walletAddress, chogs);
    const admin = getSupabaseAdmin();
    const { data: storedProfile, error: storedProfileError } = await admin
      .from("profiles")
      .select("profile_visible")
      .eq("user_id", session.userId)
      .maybeSingle();
    if (storedProfileError) {
      throw new SocialDataError("CHOG MATE database setup is incomplete.", storedProfileError);
    }
    const bundle = await loadProfileBundle(session.userId);
    const selected = bundle
      ? chogs.find((chog) => chog.tokenId === bundle.chog.tokenId) ?? null
      : null;
    const profile =
      bundle && selected
        ? {
            ...profileToApi(bundle, null, [], true),
            chog: selected,
          }
        : null;
    res.json(
      GetMeResponse.parse({
        walletAddress: session.walletAddress,
        hasChog: chogs.length > 0,
        hasProfile: Boolean(storedProfile),
        chogs,
        selectedChogTokenId: selected?.tokenId ?? null,
        profileVisible: storedProfile?.profile_visible ?? null,
        profile,
      }),
    );
  } catch (error) {
    sendProfileError(req, res, error);
  }
});

router.put("/me/discover-visibility", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = UpdateDiscoverVisibilityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose whether your profile should appear in Discover." });
    return;
  }

  try {
    const admin = getSupabaseAdmin();
    if (parsed.data.visible) {
      const bundle = await loadProfileBundle(session.userId);
      if (!bundle || !isCompleteDiscoverableProfile(bundle, false)) {
        res.status(409).json({
          error:
            "Add a valid display name and username, choose at least one Looking For option, and keep a verified Chog selected before enabling Discover visibility.",
        });
        return;
      }
    }
    const { data, error } = await admin
      .from("profiles")
      .update({
        profile_visible: parsed.data.visible,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", session.userId)
      .select("profile_visible")
      .maybeSingle();
    if (error) {
      throw new SocialDataError("Discover visibility could not be updated.", error);
    }
    if (!data) {
      res.status(409).json({ error: "Create your profile before changing Discover visibility." });
      return;
    }
    res.json(UpdateDiscoverVisibilityResponse.parse({ visible: data.profile_visible }));
  } catch (error) {
    sendProfileError(req, res, error);
  }
});

router.put("/me/profile", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = UpdateMeProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the profile details and try again." });
    return;
  }

  try {
    const chogs = await getOwnedChogs(getAddress(session.walletAddress));
    const admin = getSupabaseAdmin();
    const { data: existingProfile, error: existingProfileError } = await admin
      .from("profiles")
      .select("active_chog_token_id,profile_visible")
      .eq("user_id", session.userId)
      .maybeSingle();
    if (existingProfileError) {
      throw new SocialDataError("CHOG MATE database setup is incomplete.", existingProfileError);
    }
    const activeTokenId =
      existingProfile?.active_chog_token_id ?? parsed.data.selectedChogTokenId;
    const profileVisible =
      parsed.data.profileVisible ?? existingProfile?.profile_visible ?? true;
    const selectedChog = chogs.find(
      (chog) => chog.tokenId === activeTokenId,
    );
    if (!selectedChog) {
      res.status(403).json({
        error: "Choose a Chog Genesis NFT currently held by this wallet.",
      });
      return;
    }
    const ownsSelectedChog = await isCurrentChogOwner(
      getAddress(session.walletAddress),
      selectedChog.tokenId,
    );
    if (ownsSelectedChog === null) {
      res.status(503).json({
        error: "Chog ownership could not be revalidated. Please try again.",
      });
      return;
    }
    if (!ownsSelectedChog) {
      res.status(403).json({
        error: "Choose a Chog Genesis NFT currently held by this wallet.",
      });
      return;
    }
    await syncVerifiedChogs(session.userId, session.walletAddress, chogs);
    const now = new Date().toISOString();
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        user_id: session.userId,
        username: parsed.data.username,
        display_name: parsed.data.displayName,
        gender: parsed.data.gender ?? null,
        age: parsed.data.age ?? null,
        bio: parsed.data.bio ?? null,
        interests: parsed.data.interests,
        hobbies: parsed.data.hobbies,
        languages: parsed.data.languages,
        looking_for: parsed.data.lookingFor,
        looking_for_other: parsed.data.lookingForOther?.trim() || null,
        active_chog_token_id: selectedChog.tokenId,
        profile_visible: profileVisible,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
    if (profileError) {
      if (profileError.code === "23505") {
        res.status(409).json({
          code: "USERNAME_TAKEN",
          error: "That username is already taken.",
        });
        return;
      }
      throw new SocialDataError("CHOG MATE database setup is incomplete.", profileError);
    }

    const { error: preferencesError } = await admin.from("preferences").upsert(
      {
        user_id: session.userId,
        looking_for: parsed.data.lookingFor,
        interests: parsed.data.interests,
        profile_visible: profileVisible,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
    if (preferencesError) {
      throw new SocialDataError("CHOG MATE database setup is incomplete.", preferencesError);
    }

    const bundle = await loadProfileBundle(session.userId, selectedChog.tokenId);
    if (!bundle) throw new SocialDataError("Your verified Chog could not be loaded.");
    res.json(UpdateMeProfileResponse.parse(profileToApi(bundle, null, [], true)));
  } catch (error) {
    sendProfileError(req, res, error);
  }
});

router.patch("/me/chog", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;

  const parsed = SelectActiveChogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid Chog token ID." });
    return;
  }

  const tokenNumber = BigInt(parsed.data.tokenId);
  if (tokenNumber > (1n << 256n) - 1n) {
    res.status(400).json({ error: "Choose a valid Chog token ID." });
    return;
  }
  const tokenId = tokenNumber.toString();

  try {
    const walletAddress = getAddress(session.walletAddress);
    const ownsSelectedChog = await isCurrentChogOwner(
      walletAddress,
      tokenId,
    );
    if (ownsSelectedChog === null) {
      res.status(503).json({
        error: "Chog ownership could not be revalidated. Please try again.",
      });
      return;
    }
    if (!ownsSelectedChog) {
      res.status(403).json({
        error: "Choose a Chog Genesis NFT currently held by this wallet.",
      });
      return;
    }

    const { data: updatedProfile, error } = await getSupabaseAdmin()
      .from("profiles")
      .update({
        active_chog_token_id: tokenId,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", session.userId)
      .select("user_id")
      .maybeSingle();
    if (error) {
      throw new SocialDataError("CHOG MATE database setup is incomplete.");
    }
    if (!updatedProfile) {
      res.status(409).json({
        error: "Create your profile before switching your active Chog.",
      });
      return;
    }

    res.sendStatus(204);
  } catch (error) {
    sendProfileError(req, res, error);
  }
});

router.get("/discover", async (req, res): Promise<void> => {
  const session = readWalletSession(req);
  const parsed = DiscoverProfilesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Those discovery settings are not valid." });
    return;
  }
  if (
    parsed.data.minAge !== undefined &&
    parsed.data.maxAge !== undefined &&
    parsed.data.minAge > parsed.data.maxAge
  ) {
    res.status(400).json({ error: "Minimum age must not be greater than maximum age." });
    return;
  }

  try {
    const admin = getSupabaseAdmin();
    let currentProfile: Awaited<ReturnType<typeof loadProfileBundle>> = null;
    if (session) {
      const ownBundle = await loadProfileBundle(session.userId);
      if (
        ownBundle &&
        isCompleteDiscoverableProfile(ownBundle, false) &&
        isAddress(ownBundle.user.wallet_address) &&
        ownBundle.user.wallet_address.toLowerCase() === session.walletAddress.toLowerCase()
      ) {
        const currentOwnsSelected = await isCurrentChogOwner(
          getAddress(ownBundle.user.wallet_address),
          ownBundle.chog.tokenId,
        );
        if (currentOwnsSelected === null) {
          res.status(503).json({
            error: "Ownership checks are temporarily unavailable. Please try again.",
          });
          return;
        }
        if (currentOwnsSelected) currentProfile = ownBundle;
      }
    }
    const limit = parsed.data.limit ?? 12;
    const offset = parseCursor(parsed.data.cursor);
    const excluded = new Set<string>();
    if (session) {
      const [outBlocks, inBlocks] = await Promise.all([
        admin
          .from("blocks")
          .select("blocked_user_id")
          .eq("blocker_id", session.userId),
        admin
          .from("blocks")
          .select("blocker_id")
          .eq("blocked_user_id", session.userId),
      ]);
      if (
        [outBlocks, inBlocks].some((result) => result.error)
      ) {
        throw new SocialDataError("CHOG MATE database setup is incomplete.");
      }

      excluded.add(session.userId);
      for (const row of outBlocks.data ?? []) excluded.add(row.blocked_user_id);
      for (const row of inBlocks.data ?? []) excluded.add(row.blocker_id);
    }

    // Advance only over candidates considered for this response; a wider
    // batch can skip eligible profiles that do not fit in the returned page.
    const pageSize = limit;
    const searchTerm = parsed.data.search?.trim();
    let candidateUserIds: string[];
    let hasMoreCandidates: boolean;
    if (searchTerm) {
      const searchCandidates = await findDiscoverSearchCandidates(admin, searchTerm);
      candidateUserIds = searchCandidates
        .slice(offset, offset + pageSize)
        .map((row) => row.user_id);
      hasMoreCandidates = searchCandidates.length > offset + pageSize;
    } else {
      const { data: candidates, error: candidatesError } = await admin
        .from("profiles")
        .select("user_id")
        .order("updated_at", { ascending: false })
        .order("user_id", { ascending: true })
        .range(offset, offset + pageSize);
      if (candidatesError) {
        throw new SocialDataError("CHOG MATE database setup is incomplete.", candidatesError);
      }
      candidateUserIds = (candidates ?? [])
        .slice(0, pageSize)
        .map((row) => row.user_id);
      hasMoreCandidates = (candidates?.length ?? 0) > pageSize;
    }
    let previouslyLikedUserIds: string[] = [];
    if (session && (parsed.data.mode ?? "discover") === "discover") {
      const [likes, superLikes] = await Promise.all([
        admin
          .from("likes")
          .select("to_user_id")
          .eq("from_user_id", session.userId),
        admin
          .from("super_likes")
          .select("to_user_id")
          .eq("from_user_id", session.userId),
      ]);
      if (likes.error || superLikes.error) {
        throw new SocialDataError("CHOG MATE likes are not ready yet.");
      }
      previouslyLikedUserIds = [
        ...(likes.data ?? []).map((like) => like.to_user_id),
        ...(superLikes.data ?? []).map((like) => like.to_user_id),
      ];
    }
    const eligibleCandidateUserIds = filterPreviouslyLikedDiscoverCandidates(
      parsed.data.mode,
      candidateUserIds,
      previouslyLikedUserIds,
    );
    const ids = eligibleCandidateUserIds.filter((id) => !excluded.has(id));
    const bundles = await loadProfileBundles(ids, { includePrivate: true });
    const ranked: Array<{
      bundle: NonNullable<Awaited<ReturnType<typeof loadProfileBundle>>>;
      compatibility: number | null;
      rankScore: number;
      reasons: string[];
      lastSeen: string;
    }> = [];
    const compatibilityProfile = currentProfile;

    for (const [userId, bundle] of bundles) {
      if (
        !isCompleteDiscoverableProfile(bundle, false) ||
        !isAddress(bundle.user.wallet_address) ||
        (session && bundle.user.id === session.userId)
      ) {
        continue;
      }
      if (
        !matchesExploreFilters(
          bundle.profile,
          bundle.chog.tier,
          bundle.user.last_seen,
          parsed.data,
        )
      ) continue;
      const ownsSelected = await isCurrentChogOwner(
        getAddress(bundle.user.wallet_address),
        bundle.chog.tokenId,
      );
      if (ownsSelected === null) {
        res.status(503).json({
          error: "Ownership checks are temporarily unavailable. Please try again.",
        });
        return;
      }
      if (!ownsSelected) {
        await admin
          .from("profiles")
          .update({ profile_visible: false, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        continue;
      }

      const compatibility = compatibilityProfile
        ? calculateCompatibility(
            {
              interests: compatibilityProfile.profile.interests,
              looking_for: compatibilityProfile.profile.looking_for,
              skills: compatibilityProfile.profile.skills,
              location: compatibilityProfile.profile.location,
              timezone: compatibilityProfile.profile.timezone,
              chog: compatibilityProfile.chog,
            },
            {
              interests: bundle.profile.interests,
              looking_for: bundle.profile.looking_for,
              skills: bundle.profile.skills,
              location: bundle.profile.location,
              timezone: bundle.profile.timezone,
              chog: bundle.chog,
            },
          )
        : null;
      const compatibilityScore = compatibility?.score ?? null;
      const rankScore = calculateDiscoveryRank({
        compatibility: compatibilityScore,
        lookingForRelevance: compatibilityProfile
          ? calculateLookingForRelevance(
              compatibilityProfile.profile.looking_for,
              bundle.profile.looking_for,
            )
          : 0,
        completeness: calculateProfileCompleteness(bundle.profile),
        recentActivity: calculateRecentActivity(bundle.user.last_seen),
      });
      ranked.push({
        bundle,
        compatibility: compatibilityScore,
        rankScore,
        reasons: compatibility?.reasons ?? [],
        lastSeen: bundle.user.last_seen ?? bundle.user.created_at ?? "",
      });
    }

    ranked.sort(
      (a, b) =>
        b.rankScore - a.rankScore ||
        b.lastSeen.localeCompare(a.lastSeen) ||
        a.bundle.user.id.localeCompare(b.bundle.user.id),
    );
    res.json(
      DiscoverProfilesResponse.parse({
        profiles: ranked.slice(0, limit).map(({ bundle, compatibility, reasons }) =>
          profileToApi(
            bundle,
            compatibility,
            reasons,
            true,
          ),
        ),
        nextCursor: hasMoreCandidates ? String(offset + pageSize) : null,
      }),
    );
  } catch (error) {
    sendProfileError(req, res, error);
  }
});

function isCompleteDiscoverableProfile(
  bundle: NonNullable<Awaited<ReturnType<typeof loadProfileBundle>>>,
  requireVisible = true,
): boolean {
  const { profile, user, chog } = bundle;
  return (
    (!requireVisible || profile.profile_visible) &&
    typeof profile.username === "string" &&
    /^[a-zA-Z0-9_]{2,24}$/.test(profile.username) &&
    typeof profile.display_name === "string" &&
    profile.display_name.trim().length > 0 &&
    profile.active_chog_token_id === chog.tokenId &&
    Array.isArray(profile.looking_for) &&
    hasValues(profile.looking_for) &&
    chog.verified &&
    /^[0-9]+$/.test(chog.tokenId) &&
    chog.contractAddress.toLowerCase() === CHOG_CONTRACT_ADDRESS.toLowerCase() &&
    chog.ownerWallet.toLowerCase() === user.wallet_address.toLowerCase() &&
    isHttpUrl(chog.imageUrl)
  );
}

function hasValues(values: string[]): boolean {
  return values.some((value) => typeof value === "string" && value.trim().length > 0);
}

function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseCursor(cursor?: string): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, Number.MAX_SAFE_INTEGER - 1000);
}

function matchesExploreFilters(
  profile: NonNullable<Awaited<ReturnType<typeof loadProfileBundle>>>["profile"],
  chogTier: string | null,
  lastSeen: string | undefined,
  filters: DiscoverQuery,
): boolean {
  const lookingFor = profile.looking_for ?? [];
  const textValues = [
    ...lookingFor,
    ...(profile.interests ?? []),
    ...(profile.hobbies ?? []),
    ...(profile.skills ?? []),
  ].map(normalizeDiscoveryValue);
  const mode = filters.mode ?? "discover";
  const categoryTerms: Record<string, string[]> = {
    date: ["dating"],
    friends: ["friendship", "friends"],
    network: ["networking"],
    collab: ["collaboration", "collab"],
    gaming: ["gaming", "game", "games", "gamer"],
    startup: ["startup", "business", "founder", "entrepreneur"],
    creative: [
      "creative",
      "art",
      "artist",
      "design",
      "designer",
      "music",
      "musician",
      "writing",
      "writer",
      "photography",
      "photographer",
      "illustration",
      "illustrator",
    ],
    hackathon: ["hackathon", "teammate", "teammates"],
    other: ["other"],
  };
  const categoryMatches = categoryTerms[mode];
  if (
    categoryMatches &&
    !textValues.some((value) =>
      categoryMatches.some((term) => value.includes(term)),
    ) &&
    !(mode === "other" && Boolean(profile.looking_for_other?.trim()))
  ) {
    return false;
  }

  if (filters.gender && profile.gender !== filters.gender) return false;
  if (filters.minAge !== undefined && (profile.age === null || profile.age < filters.minAge)) {
    return false;
  }
  if (filters.maxAge !== undefined && (profile.age === null || profile.age > filters.maxAge)) {
    return false;
  }
  if (
    filters.location &&
    ![profile.location, profile.timezone]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeDiscoveryValue(value).includes(normalizeDiscoveryValue(filters.location!)))
  ) {
    return false;
  }
  if (
    filters.interests &&
    !(profile.interests ?? []).some((value) =>
      normalizeDiscoveryValue(value).includes(normalizeDiscoveryValue(filters.interests!)),
    )
  ) {
    return false;
  }
  if (
    filters.hobbies &&
    !(profile.hobbies ?? []).some((value) =>
      normalizeDiscoveryValue(value).includes(normalizeDiscoveryValue(filters.hobbies!)),
    )
  ) {
    return false;
  }
  if (
    filters.languages &&
    !(profile.languages ?? []).some((value) =>
      normalizeDiscoveryValue(value).includes(normalizeDiscoveryValue(filters.languages!)),
    )
  ) {
    return false;
  }
  if (
    filters.chogTier &&
    (!chogTier ||
      !normalizeDiscoveryValue(chogTier).includes(normalizeDiscoveryValue(filters.chogTier)))
  ) {
    return false;
  }
  if (filters.recentlyActive) {
    const lastSeenAt = lastSeen ? Date.parse(lastSeen) : Number.NaN;
    if (!Number.isFinite(lastSeenAt) || Date.now() - lastSeenAt > 7 * 24 * 60 * 60 * 1000) {
      return false;
    }
  }
  return true;
}

function normalizeDiscoveryValue(value: string): string {
  return value.trim().toLowerCase();
}

function sendProfileError(
  req: Request,
  res: Response,
  error: unknown,
): void {
  const failure = toApiFailure(error, {
    code: error instanceof SocialDataError ? "DATABASE_OPERATION_FAILED" : "PROFILE_SERVICE_FAILED",
    error:
      error instanceof SocialDataError
        ? "Supabase could not complete this profile operation. Check the CHOG MATE migrations and server configuration."
        : "Your profile service is temporarily unavailable. Please try again.",
  });
  req.log.error(
    { ...getSafeBackendErrorFields(error), responseCode: failure.body.code },
    "Profile service failed",
  );
  res.status(failure.status).json(failure.body);
}

export default router;
