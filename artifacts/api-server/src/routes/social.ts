import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import {
  BlockProfileBody,
  GetBlockedUsersResponse,
  GetConversationsResponse,
  GetExMatchesResponse,
  GetLikeInboxResponse,
  GetMatchesResponse,
  GetMessagesParams,
  GetMessagesResponse,
  RequestMessageAttachmentUploadUrlBody,
  RequestMessageAttachmentUploadUrlParams,
  RequestMessageAttachmentUploadUrlResponse,
  ReportProfileBody,
  RematchProfileParams,
  SendMessageBody,
  SendMessageParams,
  SendMessageResponse,
  SwipeProfileBody,
  SwipeProfileResponse,
  UnlikeProfileParams,
  UnblockUserParams,
  UnmatchProfileParams,
} from "@workspace/api-zod";
import { getAddress, isAddress } from "viem";
import { calculateCompatibility } from "../lib/compatibility";
import { isCurrentChogOwner } from "../lib/chogs";
import {
  TokenTransferVerificationError,
  verifySuperLikeTransfer,
} from "../lib/chog-token";
import {
  loadProfileBundle,
  loadProfileBundles,
  profileToApi,
  SocialDataError,
} from "../lib/social-data";
import { getSupabaseAdmin } from "../lib/supabase";
import { requireWalletSession, type WalletSession } from "../lib/wallet-auth";

const router: IRouter = Router();
const CHAT_MEDIA_BUCKET = "chog-mate-chat";
const MAX_CHAT_MEDIA_BYTES = 15 * 1024 * 1024;
const ALLOWED_CHAT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp3",
  "video/webm",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

interface MatchRow {
  id: string;
  user_a: string;
  user_b: string;
  compatibility_score: number;
  status: "active" | "unmatched";
  unmatched_by: string | null;
  created_at: string;
  last_activity: string | null;
}

class EligibilityError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

router.post("/swipes", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = SwipeProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "That swipe could not be recorded." });
    return;
  }

  if (
    parsed.data.action === "super_like" &&
    session.identityMode !== "wallet_connected"
  ) {
    res.status(403).json({
      error: "Connect your wallet to continue.",
    });
    return;
  }

  try {
    const current = await requireEligibleProfile(session);
    const targetId = parsed.data.targetUserId;
    const transactionHash = parsed.data.transactionHash;
    if (
      (parsed.data.action === "super_like" && !transactionHash) ||
      (parsed.data.action !== "super_like" && transactionHash)
    ) {
      res.status(400).json({
        error: parsed.data.action === "super_like"
          ? "A confirmed $CHOG transfer is required for a Super Like."
          : "A token transaction is only valid for a Super Like.",
      });
      return;
    }
    if (targetId === session.userId) {
      res.status(400).json({ error: "You can't swipe on your own profile." });
      return;
    }
    const targetMap = await loadProfileBundles([targetId]);
    const target = targetMap.get(targetId);
    if (!target) {
      res.status(404).json({ error: "This profile is no longer available." });
      return;
    }
    if (
      parsed.data.action === "super_like" &&
      (!target.user.wallet_verified || !isAddress(target.user.wallet_address))
    ) {
      res.status(409).json({
        error: "This member has not connected and verified a wallet that can receive $CHOG.",
      });
      return;
    }
    const targetOwns = await isCurrentChogOwner(
      getAddress(target.user.wallet_address),
      target.chog.tokenId,
    );
    if (targetOwns === null) {
      res.status(503).json({ error: "Ownership checks are temporarily unavailable." });
      return;
    }
    if (!targetOwns) {
      res.status(404).json({ error: "This profile is no longer available." });
      return;
    }

    const admin = getSupabaseAdmin();
    const [fromBlock, toBlock] = await Promise.all([
      admin
        .from("blocks")
        .select("id")
        .eq("blocker_id", session.userId)
        .eq("blocked_user_id", targetId)
        .maybeSingle(),
      admin
        .from("blocks")
        .select("id")
        .eq("blocker_id", targetId)
        .eq("blocked_user_id", session.userId)
        .maybeSingle(),
    ]);
    if (fromBlock.error || toBlock.error) throw new SocialDataError("Database unavailable.");
    if (fromBlock.data || toBlock.data) {
      res.status(404).json({ error: "This profile is no longer available." });
      return;
    }
    if (parsed.data.action === "super_like") {
      await verifySuperLikeTransfer(
        transactionHash!,
        session.walletAddress,
        target.user.wallet_address,
      );
    }

    const compatibility = calculateCompatibility(
      {
        interests: current.profile.interests,
        looking_for: current.profile.looking_for,
        skills: current.profile.skills,
        location: current.profile.location,
        timezone: current.profile.timezone,
        chog: current.chog,
      },
      {
        interests: target.profile.interests,
        looking_for: target.profile.looking_for,
        skills: target.profile.skills,
        location: target.profile.location,
        timezone: target.profile.timezone,
        chog: target.chog,
      },
    );
    const { data, error } = await admin.rpc("record_swipe", {
      p_from_user_id: session.userId,
      p_to_user_id: targetId,
      p_action: parsed.data.action,
      p_compatibility: compatibility.score,
      p_transaction_hash: transactionHash?.toLowerCase() ?? null,
    });
    if (error) throw new SocialDataError("CHOG MATE matching is not ready yet.");

    const result = data as { matched?: boolean; matchId?: string | null } | null;
    const matched = Boolean(result?.matched && result.matchId);
    let match: unknown = null;
    if (matched && result?.matchId) {
      const { data: matchRow, error: matchError } = await admin
        .from("matches")
        .select("*")
        .eq("id", result.matchId)
        .single();
      if (matchError || !matchRow) throw new SocialDataError("The new match could not be loaded.");
      const row = matchRow as MatchRow;
      const matchProfile = row.user_a === session.userId ? target : current;
      match = {
        id: row.id,
        profile: profileToApi(matchProfile),
        compatibility: row.compatibility_score,
        createdAt: row.created_at,
        lastActivity: row.last_activity,
        unreadCount: 0,
      };
    }

    res.json(
      SwipeProfileResponse.parse({
        recorded: Boolean((data as { recorded?: boolean } | null)?.recorded ?? true),
        matched,
        ...(matched ? { match } : {}),
      }),
    );
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.get("/likes/inbox", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;

  try {
    await requireEligibleProfile(session);
    const admin = getSupabaseAdmin();
    const [likes, superLikes, blocksFrom, blocksTo, matchesA, matchesB, sentLikes, sentPasses, sentSuperLikes] =
      await Promise.all([
        admin.from("likes").select("id,from_user_id,created_at").eq("to_user_id", session.userId),
        admin
          .from("super_likes")
          .select("id,from_user_id,created_at")
          .eq("to_user_id", session.userId)
          .not("transaction_hash", "is", null),
        admin.from("blocks").select("blocked_user_id").eq("blocker_id", session.userId),
        admin.from("blocks").select("blocker_id").eq("blocked_user_id", session.userId),
        admin
          .from("matches")
          .select("user_b")
          .eq("user_a", session.userId)
          .in("status", ["active", "unmatched"]),
        admin
          .from("matches")
          .select("user_a")
          .eq("user_b", session.userId)
          .in("status", ["active", "unmatched"]),
        admin.from("likes").select("to_user_id").eq("from_user_id", session.userId),
        admin.from("passes").select("to_user_id").eq("from_user_id", session.userId),
        admin.from("super_likes").select("to_user_id").eq("from_user_id", session.userId),
      ]);
    if ([likes, superLikes, blocksFrom, blocksTo, matchesA, matchesB, sentLikes, sentPasses, sentSuperLikes].some((item) => item.error)) {
      throw new SocialDataError("CHOG MATE likes are not ready yet.");
    }

    const excluded = new Set<string>([session.userId]);
    for (const row of blocksFrom.data ?? []) excluded.add(row.blocked_user_id);
    for (const row of blocksTo.data ?? []) excluded.add(row.blocker_id);
    for (const row of matchesA.data ?? []) excluded.add(row.user_b);
    for (const row of matchesB.data ?? []) excluded.add(row.user_a);
    for (const row of sentLikes.data ?? []) excluded.add(row.to_user_id);
    for (const row of sentPasses.data ?? []) excluded.add(row.to_user_id);
    for (const row of sentSuperLikes.data ?? []) excluded.add(row.to_user_id);

    const bySender = new Map<string, {
      id: string;
      type: "like" | "super_like";
      createdAt: string;
    }>();
    for (const row of likes.data ?? []) {
      if (!excluded.has(row.from_user_id)) {
        bySender.set(row.from_user_id, {
          id: row.id,
          type: "like",
          createdAt: row.created_at,
        });
      }
    }
    for (const row of superLikes.data ?? []) {
      if (!excluded.has(row.from_user_id)) {
        bySender.set(row.from_user_id, {
          id: row.id,
          type: "super_like",
          createdAt: row.created_at,
        });
      }
    }

    const senderIds = [...bySender.keys()];
    const bundles = await loadProfileBundles(senderIds, { includePrivate: true });
    const inbox = [];
    for (const [senderId, like] of bySender) {
      const bundle = bundles.get(senderId);
      if (!bundle) continue;
      const owns = await isCurrentChogOwner(
        getAddress(bundle.user.wallet_address),
        bundle.chog.tokenId,
      );
      if (owns === null) {
        res.status(503).json({ error: "Ownership checks are temporarily unavailable." });
        return;
      }
      if (!owns) continue;
      inbox.push({
        id: like.id,
        type: like.type,
        createdAt: like.createdAt,
        profile: profileToApi(bundle),
      });
    }
    inbox.sort((a, b) => {
      if (a.type !== b.type) return a.type === "super_like" ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    res.json(GetLikeInboxResponse.parse(inbox));
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.get("/likes/sent", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;

  try {
    await requireEligibleProfile(session);
    const admin = getSupabaseAdmin();
    const [
      sentLikes,
      sentSuperLikes,
      blocksFrom,
      blocksTo,
      matchesA,
      matchesB,
    ] = await Promise.all([
      admin.from("likes").select("id,to_user_id,created_at").eq("from_user_id", session.userId),
      admin
        .from("super_likes")
        .select("id,to_user_id,created_at")
        .eq("from_user_id", session.userId)
        .not("transaction_hash", "is", null),
      admin.from("blocks").select("blocked_user_id").eq("blocker_id", session.userId),
      admin.from("blocks").select("blocker_id").eq("blocked_user_id", session.userId),
      admin.from("matches").select("user_b").eq("user_a", session.userId).in("status", ["active", "unmatched"]),
      admin.from("matches").select("user_a").eq("user_b", session.userId).in("status", ["active", "unmatched"]),
    ]);
    if ([sentLikes, sentSuperLikes, blocksFrom, blocksTo, matchesA, matchesB]
      .some((result) => result.error)) {
      throw new SocialDataError("CHOG MATE likes are not ready yet.");
    }

    const excluded = new Set<string>([session.userId]);
    for (const row of blocksFrom.data ?? []) excluded.add(row.blocked_user_id);
    for (const row of blocksTo.data ?? []) excluded.add(row.blocker_id);
    for (const row of matchesA.data ?? []) excluded.add(row.user_b);
    for (const row of matchesB.data ?? []) excluded.add(row.user_a);

    const byRecipient = new Map<string, {
      id: string;
      type: "like" | "super_like";
      createdAt: string;
    }>();
    for (const row of sentLikes.data ?? []) {
      if (!excluded.has(row.to_user_id)) {
        byRecipient.set(row.to_user_id, {
          id: row.id,
          type: "like",
          createdAt: row.created_at,
        });
      }
    }
    for (const row of sentSuperLikes.data ?? []) {
      if (!excluded.has(row.to_user_id)) {
        byRecipient.set(row.to_user_id, {
          id: row.id,
          type: "super_like",
          createdAt: row.created_at,
        });
      }
    }

    const bundles = await loadProfileBundles([...byRecipient.keys()], {
      includePrivate: true,
    });
    const outgoing = [];
    for (const [recipientId, like] of byRecipient) {
      const bundle = bundles.get(recipientId);
      if (!bundle) continue;
      const owns = await isCurrentChogOwner(
        getAddress(bundle.user.wallet_address),
        bundle.chog.tokenId,
      );
      if (owns === null) {
        res.status(503).json({ error: "Ownership checks are temporarily unavailable." });
        return;
      }
      if (!owns) continue;
      outgoing.push({
        id: like.id,
        type: like.type,
        createdAt: like.createdAt,
        profile: profileToApi(bundle),
      });
    }
    outgoing.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(GetLikeInboxResponse.parse(outgoing));
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.delete("/likes/sent/:targetUserId", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = UnlikeProfileParams.safeParse(req.params);
  if (!parsed.success || parsed.data.targetUserId === session.userId) {
    res.status(400).json({ error: "That Like could not be removed." });
    return;
  }

  try {
    await requireEligibleProfile(session);
    const targetUserId = parsed.data.targetUserId;
    const userA = session.userId < targetUserId ? session.userId : targetUserId;
    const userB = session.userId < targetUserId ? targetUserId : session.userId;
    const admin = getSupabaseAdmin();
    const { data: priorMatch, error: matchError } = await admin
      .from("matches")
      .select("id")
      .eq("user_a", userA)
      .eq("user_b", userB)
      .maybeSingle();
    if (matchError) throw new SocialDataError("CHOG MATE matching is not ready yet.");
    if (priorMatch) {
      res.status(409).json({
        error: "Likes cannot be changed while this relationship is a Match or Ex Match.",
      });
      return;
    }

    const [likeDelete, superLikeDelete] = await Promise.all([
      admin
        .from("likes")
        .delete()
        .eq("from_user_id", session.userId)
        .eq("to_user_id", targetUserId),
      admin
        .from("super_likes")
        .delete()
        .eq("from_user_id", session.userId)
        .eq("to_user_id", targetUserId),
    ]);
    if (likeDelete.error || superLikeDelete.error) {
      throw new SocialDataError("The outgoing Like could not be removed.");
    }
    res.sendStatus(204);
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.get("/matches", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;

  try {
    await requireEligibleProfile(session);
    const admin = getSupabaseAdmin();
    const [asA, asB, blockedByMe, blockedMe] = await Promise.all([
      admin
        .from("matches")
        .select("*")
        .eq("user_a", session.userId)
        .eq("status", "active")
        .order("last_activity", { ascending: false, nullsFirst: false }),
      admin
        .from("matches")
        .select("*")
        .eq("user_b", session.userId)
        .eq("status", "active")
        .order("last_activity", { ascending: false, nullsFirst: false }),
      admin.from("blocks").select("blocked_user_id").eq("blocker_id", session.userId),
      admin.from("blocks").select("blocker_id").eq("blocked_user_id", session.userId),
    ]);
    if ([asA, asB, blockedByMe, blockedMe].some((result) => result.error)) {
      throw new SocialDataError("CHOG MATE matching is not ready yet.");
    }

    const excluded = new Set([
      ...(blockedByMe.data ?? []).map((row) => row.blocked_user_id),
      ...(blockedMe.data ?? []).map((row) => row.blocker_id),
    ]);
    const rows = [...((asA.data ?? []) as MatchRow[]), ...((asB.data ?? []) as MatchRow[])]
      .filter((row) => !excluded.has(row.user_a === session.userId ? row.user_b : row.user_a));
    rows.sort((a, b) => (b.last_activity ?? b.created_at).localeCompare(a.last_activity ?? a.created_at));
    res.json(GetMatchesResponse.parse(await buildMatchItems(rows, session.userId)));
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.get("/matches/ex", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;

  try {
    await requireEligibleProfile(session);
    const admin = getSupabaseAdmin();
    const [asA, asB, blockedByMe, blockedMe] = await Promise.all([
      admin
        .from("matches")
        .select("*")
        .eq("user_a", session.userId)
        .eq("status", "unmatched"),
      admin
        .from("matches")
        .select("*")
        .eq("user_b", session.userId)
        .eq("status", "unmatched"),
      admin.from("blocks").select("blocked_user_id").eq("blocker_id", session.userId),
      admin.from("blocks").select("blocker_id").eq("blocked_user_id", session.userId),
    ]);
    if ([asA, asB, blockedByMe, blockedMe].some((result) => result.error)) {
      throw new SocialDataError("CHOG MATE matching is not ready yet.");
    }

    const excluded = new Set([
      ...(blockedByMe.data ?? []).map((row) => row.blocked_user_id),
      ...(blockedMe.data ?? []).map((row) => row.blocker_id),
    ]);
    const rows = [...((asA.data ?? []) as MatchRow[]), ...((asB.data ?? []) as MatchRow[])]
      .filter((row) => !excluded.has(row.user_a === session.userId ? row.user_b : row.user_a));
    rows.sort((a, b) => (b.last_activity ?? b.created_at).localeCompare(a.last_activity ?? a.created_at));
    res.json(GetExMatchesResponse.parse(await buildMatchItems(rows, session.userId)));
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.get("/conversations", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;

  try {
    await requireEligibleProfile(session);
    const admin = getSupabaseAdmin();
    const [asA, asB, blockedByMe, blockedMe] = await Promise.all([
      admin
        .from("matches")
        .select("*")
        .eq("user_a", session.userId)
        .in("status", ["active", "unmatched"]),
      admin
        .from("matches")
        .select("*")
        .eq("user_b", session.userId)
        .in("status", ["active", "unmatched"]),
      admin.from("blocks").select("blocked_user_id").eq("blocker_id", session.userId),
      admin.from("blocks").select("blocker_id").eq("blocked_user_id", session.userId),
    ]);
    if ([asA, asB, blockedByMe, blockedMe].some((result) => result.error)) {
      throw new SocialDataError("CHOG MATE conversations are not ready yet.");
    }

    const excluded = new Set([
      ...(blockedByMe.data ?? []).map((row) => row.blocked_user_id),
      ...(blockedMe.data ?? []).map((row) => row.blocker_id),
    ]);
    const rows = [...((asA.data ?? []) as MatchRow[]), ...((asB.data ?? []) as MatchRow[])]
      .filter((row) => !excluded.has(row.user_a === session.userId ? row.user_b : row.user_a));
    rows.sort((a, b) => (b.last_activity ?? b.created_at).localeCompare(a.last_activity ?? a.created_at));
    const conversations = await buildMatchItems(rows, session.userId);
    const withPreviews = await Promise.all(
      conversations.map(async (conversation) => {
        const matchId = conversation.id;
        if (typeof matchId !== "string") {
          return {
            ...conversation,
            lastMessagePreview: null,
            lastMessageType: null,
            lastMessageAt: null,
          };
        }

        const { data: latestMessage, error: latestMessageError } = await admin
          .from("messages")
          .select("content,message_type,created_at")
          .eq("match_id", matchId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestMessageError) {
          throw new SocialDataError("CHOG MATE messages are not ready yet.");
        }

        return {
          ...conversation,
          lastMessagePreview: latestMessage?.content ?? null,
          lastMessageType: latestMessage?.message_type ?? null,
          lastMessageAt: latestMessage?.created_at ?? null,
        };
      }),
    );
    res.json(GetConversationsResponse.parse(withPreviews));
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.post("/matches/:matchId/rematch", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = RematchProfileParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That match could not be restored." });
    return;
  }

  try {
    await requireEligibleProfile(session);
    const admin = getSupabaseAdmin();
    const { data: match, error: matchError } = await admin
      .from("matches")
      .select("id,user_a,user_b,status,unmatched_by")
      .eq("id", parsed.data.matchId)
      .maybeSingle();
    if (matchError) throw new SocialDataError("The match could not be restored.");
    if (!match || (match.user_a !== session.userId && match.user_b !== session.userId)) {
      res.status(404).json({ error: "That Ex Match is not available." });
      return;
    }
    if (match.status === "active") {
      res.status(409).json({
        error: "This Match has already been restored. Refresh your connections.",
      });
      return;
    }
    if (match.status !== "unmatched") {
      res.status(409).json({
        error: "This Ex Match is no longer eligible for Rematch.",
      });
      return;
    }
    if (match.unmatched_by !== session.userId) {
      res.status(403).json({
        error: "Only the person who ended this Match can restore it.",
      });
      return;
    }

    const otherUserId = match.user_a === session.userId ? match.user_b : match.user_a;
    const [blockedByMe, blockedMe] = await Promise.all([
      admin
        .from("blocks")
        .select("id")
        .eq("blocker_id", session.userId)
        .eq("blocked_user_id", otherUserId)
        .maybeSingle(),
      admin
        .from("blocks")
        .select("id")
        .eq("blocker_id", otherUserId)
        .eq("blocked_user_id", session.userId)
        .maybeSingle(),
    ]);
    if (blockedByMe.error || blockedMe.error) {
      throw new SocialDataError("The match could not be restored.");
    }
    if (blockedByMe.data || blockedMe.data) {
      res.status(409).json({
        error: "Rematch is unavailable while a block is active.",
      });
      return;
    }

    const { data, error } = await admin.rpc("rematch_match", {
      p_match_id: parsed.data.matchId,
      p_user_id: session.userId,
    });
    if (error) throw new SocialDataError("The match could not be restored.");
    if (data !== true) {
      res.status(409).json({
        error: "This Ex Match changed before it could be restored. Refresh your connections and try again.",
      });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.get("/matches/:matchId/messages", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = GetMessagesParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That conversation could not be found." });
    return;
  }

  try {
    await requireEligibleProfile(session);
    const match = await getConversationMatch(parsed.data.matchId, session.userId);
    if (!match) {
      res.status(404).json({ error: "That conversation is no longer available." });
      return;
    }
    const admin = getSupabaseAdmin();
    const { error: readError } = await admin
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("match_id", match.id)
      .neq("sender_id", session.userId)
      .is("read_at", null);
    if (readError) throw new SocialDataError("CHOG MATE messages are not ready yet.");

    const { data, error } = await admin
      .from("messages")
      .select("*")
      .eq("match_id", match.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new SocialDataError("CHOG MATE messages are not ready yet.");
    const rows = (data ?? []) as Record<string, unknown>[];
    const signedUrls = await signMessageAttachments(admin, rows);
    res.json(GetMessagesResponse.parse(rows.map((message) =>
      messageToApi(message, signedUrls.get(String(message.attachment_path)) ?? null),
    )));
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.post("/matches/:matchId/attachments/upload-url", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const params = RequestMessageAttachmentUploadUrlParams.safeParse(req.params);
  const body = RequestMessageAttachmentUploadUrlBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a supported file up to 15 MB." });
    return;
  }

  try {
    await requireEligibleProfile(session);
    const match = await getConversationMatch(params.data.matchId, session.userId);
    if (!match) {
      res.status(404).json({ error: "That conversation is no longer available." });
      return;
    }

    const { fileName, contentType, size, messageType } = body.data;
    if (
      size > MAX_CHAT_MEDIA_BYTES ||
      !isAllowedChatAttachment(messageType, contentType)
    ) {
      res.status(400).json({ error: "This file type is not supported or it exceeds 15 MB." });
      return;
    }

    const extension = fileName.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] ?? "";
    const objectPath = `${match.id}/${session.userId}/${randomUUID()}${extension}`;
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUploadUrl(objectPath);
    if (error || !data) {
      req.log.warn({ errorType: error?.name ?? "UnknownError" }, "Could not create chat upload token");
      throw new SocialDataError("Private chat uploads are not ready. Apply the included Supabase migration.");
    }

    res.json(RequestMessageAttachmentUploadUrlResponse.parse({
      bucket: CHAT_MEDIA_BUCKET,
      objectPath,
      uploadToken: data.token,
    }));
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.post("/matches/:matchId/messages", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const params = SendMessageParams.safeParse(req.params);
  const body = SendMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "That message is incomplete." });
    return;
  }

  try {
    await requireEligibleProfile(session);
    const match = await getConversationMatch(params.data.matchId, session.userId);
    if (!match) {
      res.status(404).json({ error: "That conversation is no longer available." });
      return;
    }
    const admin = getSupabaseAdmin();
    const messageType = body.data.messageType ?? "text";
    const content = body.data.content?.trim() ?? "";
    const isTextMessage = messageType === "text";
    if (isTextMessage && (!content || content.length > 4000)) {
      res.status(400).json({ error: "Write a message of 1–4,000 characters." });
      return;
    }

    let attachmentPath: string | null = null;
    let attachmentName: string | null = null;
    let attachmentContentType: string | null = null;
    let attachmentSize: number | null = null;
    let attachmentUrl: string | null = null;

    if (!isTextMessage) {
      const attachment = body.data;
      if (
        !attachment.attachmentPath ||
        !attachment.attachmentName ||
        !attachment.attachmentContentType ||
        !attachment.attachmentSize ||
        attachment.attachmentSize > MAX_CHAT_MEDIA_BYTES ||
        !isAllowedChatAttachment(
          messageType,
          attachment.attachmentContentType,
        )
      ) {
        res.status(400).json({ error: "The attachment details are invalid." });
        return;
      }

      const expectedFolder = `${match.id}/${session.userId}/`;
      if (
        !attachment.attachmentPath.startsWith(expectedFolder) ||
        attachment.attachmentPath.includes("..") ||
        attachment.attachmentPath.includes("\\")
      ) {
        res.status(403).json({ error: "That attachment does not belong to this conversation." });
        return;
      }

      const { data: signed, error: signError } = await admin.storage
        .from(CHAT_MEDIA_BUCKET)
        .createSignedUrls([attachment.attachmentPath], 3600, {
          download: messageType === "file" ? attachment.attachmentName : false,
        });
      const uploadedObject = signed?.[0];
      if (signError || uploadedObject?.error || !uploadedObject?.signedUrl) {
        res.status(400).json({ error: "Upload the attachment before sending it." });
        return;
      }

      attachmentPath = attachment.attachmentPath;
      attachmentName = attachment.attachmentName;
      attachmentContentType = attachment.attachmentContentType;
      attachmentSize = attachment.attachmentSize;
      attachmentUrl = uploadedObject.signedUrl;
    }

    const storedContent = isTextMessage
      ? content
      : messageType === "voice"
        ? "Voice message"
        : messageType === "image"
          ? "Image"
          : attachmentName ?? "File";
    const { data: message, error } = await admin
      .from("messages")
      .insert({
        match_id: match.id,
        sender_id: session.userId,
        content: storedContent,
        message_type: messageType,
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
        attachment_content_type: attachmentContentType,
        attachment_size: attachmentSize,
      })
      .select("*")
      .single();
    if (error || !message) {
      if (attachmentPath) {
        const { error: cleanupError } = await admin.storage
          .from(CHAT_MEDIA_BUCKET)
          .remove([attachmentPath]);
        if (cleanupError) {
          req.log.warn(
            { errorType: cleanupError.name },
            "Could not remove a chat attachment after message save failed",
          );
        }
      }
      throw new SocialDataError("Your message could not be sent.");
    }

    const recipientId = match.user_a === session.userId ? match.user_b : match.user_a;
    const now = new Date().toISOString();
    const [{ error: activityError }, { error: notificationError }] = await Promise.all([
      admin.from("matches").update({ last_activity: now }).eq("id", match.id),
      admin.from("notifications").insert({
        user_id: recipientId,
        actor_id: session.userId,
        type: "message",
        related_id: match.id,
      }),
    ]);
    if (activityError || notificationError) {
      req.log.warn({ code: activityError?.code ?? notificationError?.code }, "Message side effects did not complete");
    }

    res.status(201).json(SendMessageResponse.parse(messageToApi(message, attachmentUrl)));
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.post("/blocks", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = BlockProfileBody.safeParse(req.body);
  if (!parsed.success || parsed.data.targetUserId === session.userId) {
    res.status(400).json({ error: "That profile can't be blocked." });
    return;
  }

  try {
    const admin = getSupabaseAdmin();
    const targetId = parsed.data.targetUserId;
    const { error } = await admin.from("blocks").upsert(
      { blocker_id: session.userId, blocked_user_id: targetId },
      { onConflict: "blocker_id,blocked_user_id" },
    );
    if (error) throw new SocialDataError("The block could not be saved.");
    const [a, b] = await Promise.all([
      admin
        .from("matches")
        .update({ status: "unmatched", unmatched_by: null })
        .eq("user_a", session.userId)
        .eq("user_b", targetId)
        .eq("status", "active"),
      admin
        .from("matches")
        .update({ status: "unmatched", unmatched_by: null })
        .eq("user_a", targetId)
        .eq("user_b", session.userId)
        .eq("status", "active"),
    ]);
    if (a.error || b.error) req.log.warn("A match could not be closed after a block");
    res.sendStatus(204);
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.get("/blocks", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;

  try {
    const admin = getSupabaseAdmin();
    const { data: blocks, error: blocksError } = await admin
      .from("blocks")
      .select("blocked_user_id,created_at")
      .eq("blocker_id", session.userId)
      .order("created_at", { ascending: false });
    if (blocksError) throw new SocialDataError("Blocked users could not be loaded.", blocksError);

    const blockedUserIds = (blocks ?? []).map((row) => row.blocked_user_id);
    if (blockedUserIds.length === 0) {
      res.json(GetBlockedUsersResponse.parse([]));
      return;
    }

    const [usersResult, profilesResult] = await Promise.all([
      admin.from("users").select("id,wallet_address").in("id", blockedUserIds),
      admin
        .from("profiles")
        .select("user_id,username,display_name")
        .in("user_id", blockedUserIds),
    ]);
    if (usersResult.error || profilesResult.error) {
      throw new SocialDataError("Blocked users could not be loaded.", usersResult.error ?? profilesResult.error);
    }
    const usersById = new Map((usersResult.data ?? []).map((user) => [user.id, user]));
    const profilesById = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile]));
    const response = blockedUserIds.map((userId) => {
      const user = usersById.get(userId);
      const profile = profilesById.get(userId);
      return {
        userId,
        walletAddress: user?.wallet_address ?? null,
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? null,
      };
    });
    res.json(GetBlockedUsersResponse.parse(response));
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.delete("/blocks/:blockedUserId", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = UnblockUserParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That blocked user could not be found." });
    return;
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from("blocks")
      .delete()
      .eq("blocker_id", session.userId)
      .eq("blocked_user_id", parsed.data.blockedUserId);
    if (error) throw new SocialDataError("The user could not be unblocked.", error);
    res.sendStatus(204);
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.post("/reports", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = ReportProfileBody.safeParse(req.body);
  if (!parsed.success || parsed.data.targetUserId === session.userId) {
    res.status(400).json({ error: "That report could not be submitted." });
    return;
  }

  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("reports").insert({
      reporter_id: session.userId,
      target_user_id: parsed.data.targetUserId,
      reason: parsed.data.reason,
      details: parsed.data.details ?? null,
    });
    if (error) throw new SocialDataError("The report could not be submitted.");
    res.sendStatus(204);
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

router.delete("/matches/:matchId", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = UnmatchProfileParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That match could not be removed." });
    return;
  }
  try {
    const match = await getActiveMatch(parsed.data.matchId, session.userId);
    if (!match) {
      res.status(404).json({ error: "That match is no longer active." });
      return;
    }
    const { error } = await getSupabaseAdmin()
      .from("matches")
      .update({
        status: "unmatched",
        unmatched_by: session.userId,
        last_activity: new Date().toISOString(),
      })
      .eq("id", match.id);
    if (error) throw new SocialDataError("The match could not be removed.");
    res.sendStatus(204);
  } catch (error) {
    sendSocialError(req, res, error);
  }
});

async function requireEligibleProfile(session: WalletSession) {
  const bundle = await loadProfileBundle(session.userId);
  if (!bundle) {
    throw new EligibilityError("Complete your profile and hold a Chog Genesis NFT to continue.", 403);
  }
  const owns = await isCurrentChogOwner(
    getAddress(session.walletAddress),
    bundle.chog.tokenId,
  );
  if (owns === null) {
    throw new EligibilityError("Ownership checks are temporarily unavailable.", 503);
  }
  if (!owns) {
    throw new EligibilityError("Your wallet must currently hold the selected Chog Genesis NFT.", 403);
  }
  return bundle;
}

async function getActiveMatch(matchId: string, userId: string): Promise<MatchRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new SocialDataError("CHOG MATE matching is not ready yet.");
  if (!data) return null;
  const match = data as MatchRow;
  if (match.user_a !== userId && match.user_b !== userId) return null;

  const otherUserId = match.user_a === userId ? match.user_b : match.user_a;
  const admin = getSupabaseAdmin();
  const [blockedByMe, blockedMe] = await Promise.all([
    admin
      .from("blocks")
      .select("id")
      .eq("blocker_id", userId)
      .eq("blocked_user_id", otherUserId)
      .maybeSingle(),
    admin
      .from("blocks")
      .select("id")
      .eq("blocker_id", otherUserId)
      .eq("blocked_user_id", userId)
      .maybeSingle(),
  ]);
  if (blockedByMe.error || blockedMe.error) {
    throw new SocialDataError("CHOG MATE matching is not ready yet.");
  }
  return blockedByMe.data || blockedMe.data ? null : match;
}

async function getConversationMatch(matchId: string, userId: string): Promise<MatchRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw new SocialDataError("CHOG MATE matching is not ready yet.");
  if (!data) return null;
  const match = data as MatchRow;
  if (
    (match.status !== "active" && match.status !== "unmatched") ||
    (match.user_a !== userId && match.user_b !== userId)
  ) {
    return null;
  }

  const otherUserId = match.user_a === userId ? match.user_b : match.user_a;
  const admin = getSupabaseAdmin();
  const [blockedByMe, blockedMe] = await Promise.all([
    admin
      .from("blocks")
      .select("id")
      .eq("blocker_id", userId)
      .eq("blocked_user_id", otherUserId)
      .maybeSingle(),
    admin
      .from("blocks")
      .select("id")
      .eq("blocker_id", otherUserId)
      .eq("blocked_user_id", userId)
      .maybeSingle(),
  ]);
  if (blockedByMe.error || blockedMe.error) {
    throw new SocialDataError("CHOG MATE matching is not ready yet.");
  }
  return blockedByMe.data || blockedMe.data ? null : match;
}

async function buildMatchItems(
  rows: MatchRow[],
  userId: string,
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return [];
  const otherIds = rows.map((row) => (row.user_a === userId ? row.user_b : row.user_a));
  const bundles = await loadProfileBundles(otherIds, { includePrivate: true });
  const admin = getSupabaseAdmin();
  const items: Record<string, unknown>[] = [];

  for (const row of rows) {
    const otherId = row.user_a === userId ? row.user_b : row.user_a;
    const bundle = bundles.get(otherId);
    if (!bundle) continue;
    const owns = await isCurrentChogOwner(
      getAddress(bundle.user.wallet_address),
      bundle.chog.tokenId,
    );
    if (owns === null) {
      throw new EligibilityError("Ownership checks are temporarily unavailable.", 503);
    }
    if (!owns) continue;

    const { count, error: unreadError } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("match_id", row.id)
      .neq("sender_id", userId)
      .is("read_at", null);
    if (unreadError) throw new SocialDataError("CHOG MATE messages are not ready yet.");

    items.push({
      id: row.id,
      profile: profileToApi(bundle),
      compatibility: row.compatibility_score,
      createdAt: row.created_at,
      lastActivity: row.last_activity,
      unreadCount: count ?? 0,
      status: row.status,
      rematchAvailable: row.status === "unmatched" && row.unmatched_by === userId,
    });
  }

  return items;
}

function sendSocialError(req: Request, res: Response, error: unknown): void {
  if (error instanceof TokenTransferVerificationError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof EligibilityError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof SocialDataError) {
    res.status(503).json({
      error: "CHOG MATE's database isn't ready yet. Apply the included Supabase migration and try again.",
    });
    return;
  }
  req.log.error(
    { errorType: error instanceof Error ? error.name : "UnknownError" },
    "Social service failed",
  );
  res.status(503).json({ error: "This action is temporarily unavailable. Please try again." });
}

function isAllowedChatAttachment(
  messageType: string,
  contentType: string,
): boolean {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!ALLOWED_CHAT_MIME_TYPES.has(normalized)) return false;
  if (messageType === "image") return normalized.startsWith("image/");
  if (messageType === "voice") {
    return normalized.startsWith("audio/") || normalized === "video/webm";
  }
  return messageType === "file";
}

async function signMessageAttachments(
  admin: ReturnType<typeof getSupabaseAdmin>,
  messages: Record<string, unknown>[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const media = messages.filter((message) =>
    typeof message.attachment_path === "string" &&
    typeof message.match_id === "string" &&
    typeof message.sender_id === "string" &&
    message.attachment_path.startsWith(`${message.match_id}/${message.sender_id}/`),
  );

  for (const shouldDownload of [false, true]) {
    const group = media.filter((message) =>
      (message.message_type === "file") === shouldDownload,
    );
    const paths = group.map((message) => String(message.attachment_path));
    if (!paths.length) continue;
    const { data, error } = await admin.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUrls(paths, 3600, {
        download: shouldDownload ? true : false,
      });
    if (error) {
      throw new SocialDataError("Private chat media is not ready yet.");
    }
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
  }
  return urls;
}

function messageToApi(
  message: Record<string, unknown>,
  attachmentUrl: string | null,
) {
  return {
    id: message.id,
    matchId: message.match_id,
    senderId: message.sender_id,
    content: message.content,
    createdAt: message.created_at,
    readAt: message.read_at ?? null,
    messageType: message.message_type ?? "text",
    attachmentUrl,
    attachmentName: message.attachment_name ?? null,
    attachmentContentType: message.attachment_content_type ?? null,
    attachmentSize: message.attachment_size ?? null,
  };
}

export default router;
