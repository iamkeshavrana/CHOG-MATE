import { Router, type IRouter, type Request, type Response } from "express";
import {
  DiscoverProfilesQueryParams,
  DiscoverProfilesResponse,
  GetMeResponse,
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

const router: IRouter = Router();

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
        identityMode: session.identityMode,
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
      .select("active_chog_token_id")
      .eq("user_id", session.userId)
      .maybeSingle();
    if (existingProfileError) {
      throw new SocialDataError("CHOG MATE database setup is incomplete.", existingProfileError);
    }
    const activeTokenId =
      existingProfile?.active_chog_token_id ?? parsed.data.selectedChogTokenId;
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
        name: parsed.data.name ?? null,
        gender: parsed.data.gender ?? null,
        age: parsed.data.age ?? null,
        bio: parsed.data.bio ?? null,
        ...(parsed.data.photoUrl !== undefined
          ? { photo_url: parsed.data.photoUrl }
          : {}),
        location: parsed.data.location ?? null,
        timezone: parsed.data.timezone ?? null,
        interests: parsed.data.interests,
        hobbies: parsed.data.hobbies,
        skills: parsed.data.skills,
        languages: parsed.data.languages,
        looking_for: parsed.data.lookingFor,
        active_chog_token_id: selectedChog.tokenId,
        profile_visible: parsed.data.profileVisible ?? true,
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
        skills: parsed.data.skills,
        timezone: parsed.data.timezone ?? null,
        profile_visible: parsed.data.profileVisible ?? true,
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
      const [outBlocks, inBlocks, passes, likes, superLikes, matchesA, matchesB] =
        await Promise.all([
          admin
            .from("blocks")
            .select("blocked_user_id")
            .eq("blocker_id", session.userId),
          admin
            .from("blocks")
            .select("blocker_id")
            .eq("blocked_user_id", session.userId),
          admin.from("passes").select("to_user_id").eq("from_user_id", session.userId),
          admin.from("likes").select("to_user_id").eq("from_user_id", session.userId),
          admin
            .from("super_likes")
            .select("to_user_id")
            .eq("from_user_id", session.userId),
          admin
            .from("matches")
            .select("user_b")
            .eq("user_a", session.userId)
            .eq("status", "active"),
          admin
            .from("matches")
            .select("user_a")
            .eq("user_b", session.userId)
            .eq("status", "active"),
        ]);
      if (
          [outBlocks, inBlocks, passes, likes, superLikes, matchesA, matchesB].some(
          (result) => result.error,
        )
      ) {
        throw new SocialDataError("CHOG MATE database setup is incomplete.");
      }

      excluded.add(session.userId);
      for (const row of outBlocks.data ?? []) excluded.add(row.blocked_user_id);
      for (const row of inBlocks.data ?? []) excluded.add(row.blocker_id);
      for (const row of passes.data ?? []) excluded.add(row.to_user_id);
      for (const row of likes.data ?? []) excluded.add(row.to_user_id);
      for (const row of superLikes.data ?? []) excluded.add(row.to_user_id);
      for (const row of matchesA.data ?? []) excluded.add(row.user_b);
      for (const row of matchesB.data ?? []) excluded.add(row.user_a);
    }

    const pageSize = Math.min(150, limit * 5);
    const { data: candidates, error: candidatesError } = await admin
      .from("profiles")
      .select("user_id")
      .eq("profile_visible", true)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (candidatesError) throw new SocialDataError("CHOG MATE database setup is incomplete.");

    const ids = (candidates ?? [])
      .map((row: { user_id: string }) => row.user_id)
      .filter((id: string) => !excluded.has(id));
    const bundles = await loadProfileBundles(ids);
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
        !isCompleteDiscoverableProfile(bundle) ||
        !isAddress(bundle.user.wallet_address) ||
        (session && bundle.user.id === session.userId)
      ) {
        continue;
      }
      if (!matchesMode(bundle.profile.looking_for, parsed.data.mode ?? "discover")) continue;
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
    const hasMoreCandidates = (candidates?.length ?? 0) === pageSize;
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
    typeof profile.age === "number" &&
    Number.isInteger(profile.age) &&
    profile.age >= 18 &&
    profile.age <= 120 &&
    typeof profile.bio === "string" &&
    profile.bio.trim().length > 0 &&
    isHttpUrl(profile.photo_url) &&
    typeof profile.location === "string" &&
    profile.location.trim().length > 0 &&
    profile.active_chog_token_id === chog.tokenId &&
    Array.isArray(profile.looking_for) &&
    hasValues(profile.looking_for) &&
    Array.isArray(profile.interests) &&
    hasValues(profile.interests) &&
    Array.isArray(profile.hobbies) &&
    hasValues(profile.hobbies) &&
    Array.isArray(profile.skills) &&
    hasValues(profile.skills) &&
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
  return Math.min(parsed, 10_000_000);
}

function matchesMode(lookingFor: string[], mode: string): boolean {
  const values = lookingFor.map((value) => value.trim().toLowerCase());
  const filters: Record<string, string[]> = {
    date: ["dating", "date"],
    friends: ["friends", "friendship"],
    network: ["networking", "business", "startup"],
    collab: ["collab", "creative", "gaming", "hackathon", "startup"],
  };
  const accepted = filters[mode];
  return !accepted || values.some((value) => accepted.some((item) => value.includes(item)));
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
