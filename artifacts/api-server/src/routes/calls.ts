import { Router, type IRouter, type Request, type Response } from "express";
import {
  CallActionBody,
  CallActionParams,
  CallActionResponse,
  CallHeartbeatParams,
  CallHeartbeatResponse,
  CreateCallBody,
  CreateCallResponse,
  GetCallParams,
  GetCallResponse,
  GetIncomingCallsResponse,
  PollCallSignalsParams,
  PollCallSignalsResponse,
  SendCallSignalBody,
  SendCallSignalParams,
  SendCallSignalResponse,
} from "@workspace/api-zod";
import { getAddress } from "viem";
import { isCurrentChogOwner } from "../lib/chogs";
import {
  loadProfileBundle,
  loadProfileBundles,
  profileToApi,
} from "../lib/social-data";
import { getSupabaseAdmin } from "../lib/supabase";
import { requireWalletSession, type WalletSession } from "../lib/wallet-auth";

const router: IRouter = Router();
const ACTIVE_CALL_STATUSES = ["calling", "connecting", "connected"] as const;
const RING_TIMEOUT_MS = 45_000;
const ACTIVE_TIMEOUT_MS = 75_000;
const MAX_SIGNALS_PER_CALLER = 130;

type CallStatus =
  | "calling"
  | "connecting"
  | "connected"
  | "ended"
  | "rejected"
  | "missed"
  | "failed";

interface CallRow {
  id: string;
  match_id: string;
  caller_id: string;
  receiver_id: string;
  type: "audio" | "video";
  status: CallStatus;
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
}

interface CallSignalRow {
  id: number;
  call_id: string;
  sender_id: string;
  signal_type: "offer" | "answer" | "ice_candidate";
  payload: Record<string, unknown>;
  created_at: string;
}

class CallError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function sendCallError(req: Request, res: Response, error: unknown): void {
  if (error instanceof CallError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.error({ err: error }, "Call request failed");
  res.status(503).json({ error: "Calling is temporarily unavailable." });
}

function callToApi(call: CallRow) {
  return {
    id: call.id,
    matchId: call.match_id,
    callerId: call.caller_id,
    receiverId: call.receiver_id,
    type: call.type,
    status: call.status,
    startedAt: call.started_at,
    lastActivityAt: call.last_activity_at,
  };
}

function signalToApi(signal: CallSignalRow) {
  return {
    id: Number(signal.id),
    callId: signal.call_id,
    senderId: signal.sender_id,
    signalType: signal.signal_type,
    payload: signal.payload,
    createdAt: signal.created_at,
  };
}

async function expireStaleCalls(): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = Date.now();
  const missedBefore = new Date(now - RING_TIMEOUT_MS).toISOString();
  const staleBefore = new Date(now - ACTIVE_TIMEOUT_MS).toISOString();
  const endedAt = new Date(now).toISOString();
  const [missed, stale] = await Promise.all([
    admin
      .from("calls")
      .update({ status: "missed", ended_at: endedAt, last_activity_at: endedAt })
      .eq("status", "calling")
      .lt("started_at", missedBefore),
    admin
      .from("calls")
      .update({ status: "ended", ended_at: endedAt, last_activity_at: endedAt })
      .in("status", ["connecting", "connected"])
      .lt("last_activity_at", staleBefore),
  ]);
  if (missed.error || stale.error) {
    throw new CallError("Call status could not be checked.", 503);
  }
}

async function readCall(callId: string, userId: string): Promise<CallRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("calls")
    .select("*")
    .eq("id", callId)
    .maybeSingle();
  if (error) throw new CallError("Call status could not be loaded.", 503);
  if (!data) return null;
  const call = data as CallRow;
  if (call.caller_id !== userId && call.receiver_id !== userId) return null;
  return call;
}

async function ensureCallAvailable(call: CallRow): Promise<CallRow> {
  if (!ACTIVE_CALL_STATUSES.includes(call.status as (typeof ACTIVE_CALL_STATUSES)[number])) {
    return call;
  }
  const admin = getSupabaseAdmin();
  const [match, blockedByCaller, blockedByReceiver] = await Promise.all([
    admin
      .from("matches")
      .select("status")
      .eq("id", call.match_id)
      .maybeSingle(),
    admin
      .from("blocks")
      .select("id")
      .eq("blocker_id", call.caller_id)
      .eq("blocked_user_id", call.receiver_id)
      .maybeSingle(),
    admin
      .from("blocks")
      .select("id")
      .eq("blocker_id", call.receiver_id)
      .eq("blocked_user_id", call.caller_id)
      .maybeSingle(),
  ]);
  if (match.error || blockedByCaller.error || blockedByReceiver.error) {
    throw new CallError("Call access could not be checked.", 503);
  }
  if (
    match.data?.status === "active" &&
    !blockedByCaller.data &&
    !blockedByReceiver.data
  ) {
    return call;
  }

  const endedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("calls")
    .update({ status: "ended", ended_at: endedAt, last_activity_at: endedAt })
    .eq("id", call.id)
    .in("status", [...ACTIVE_CALL_STATUSES])
    .select("*")
    .maybeSingle();
  if (error) throw new CallError("The call could not be ended safely.", 503);
  if (data) return data as CallRow;
  return (await readCall(call.id, call.caller_id)) ?? {
    ...call,
    status: "ended",
    ended_at: endedAt,
    last_activity_at: endedAt,
  };
}

async function getParticipantCall(
  callId: string,
  userId: string,
): Promise<CallRow | null> {
  const call = await readCall(callId, userId);
  return call ? ensureCallAvailable(call) : null;
}

async function requireEligibleCaller(session: WalletSession): Promise<void> {
  const bundle = await loadProfileBundle(session.userId);
  if (!bundle) {
    throw new CallError("Complete your profile and hold a verified Chog to call.", 403);
  }
  const owns = await isCurrentChogOwner(
    getAddress(session.walletAddress),
    bundle.chog.tokenId,
  );
  if (owns === null) {
    throw new CallError("Chog ownership checks are temporarily unavailable.", 503);
  }
  if (!owns) {
    throw new CallError("Your wallet must currently hold the selected Chog to call.", 403);
  }
}

router.get("/calls/incoming", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  try {
    await expireStaleCalls();
    const { data, error } = await getSupabaseAdmin()
      .from("calls")
      .select("*")
      .eq("receiver_id", session.userId)
      .eq("status", "calling")
      .order("started_at", { ascending: false })
      .limit(5);
    if (error) throw new CallError("Incoming calls could not be loaded.", 503);

    const incoming: CallRow[] = [];
    for (const raw of data ?? []) {
      const call = await ensureCallAvailable(raw as CallRow);
      if (call.status === "calling") incoming.push(call);
    }
    const profiles = await loadProfileBundles(incoming.map((call) => call.caller_id));
    const response = incoming.flatMap((call) => {
      const profile = profiles.get(call.caller_id);
      if (!profile) return [];
      return [{ ...callToApi(call), profile: profileToApi(profile) }];
    });
    res.json(GetIncomingCallsResponse.parse(response));
  } catch (error) {
    sendCallError(req, res, error);
  }
});

router.post("/calls", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const parsed = CreateCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose an active conversation and call type." });
    return;
  }
  try {
    await requireEligibleCaller(session);
    await expireStaleCalls();
    const admin = getSupabaseAdmin();
    const { data: matchData, error: matchError } = await admin
      .from("matches")
      .select("id,user_a,user_b,status")
      .eq("id", parsed.data.matchId)
      .eq("status", "active")
      .maybeSingle();
    if (matchError) throw new CallError("The active match could not be checked.", 503);
    if (!matchData || (matchData.user_a !== session.userId && matchData.user_b !== session.userId)) {
      throw new CallError("Calls are available only in active matches.", 404);
    }
    const receiverId = matchData.user_a === session.userId ? matchData.user_b : matchData.user_a;
    const { data: callId, error } = await admin.rpc("create_peer_call", {
      p_match_id: parsed.data.matchId,
      p_caller_id: session.userId,
      p_receiver_id: receiverId,
      p_type: parsed.data.type,
    });
    if (error) throw new CallError("The call could not be started.", 503);
    if (!callId) {
      throw new CallError("You or the other person already has an active call, or calls are unavailable for this match.", 409);
    }
    const { data: call, error: callError } = await admin
      .from("calls")
      .select("*")
      .eq("id", callId)
      .single();
    if (callError || !call) throw new CallError("The new call could not be loaded.", 503);
    res.status(201).json(CreateCallResponse.parse(callToApi(call as CallRow)));
  } catch (error) {
    sendCallError(req, res, error);
  }
});

router.get("/calls/:callId", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const params = GetCallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "That call could not be found." });
    return;
  }
  try {
    await expireStaleCalls();
    const call = await getParticipantCall(params.data.callId, session.userId);
    if (!call) {
      res.status(404).json({ error: "That call is no longer available." });
      return;
    }
    res.json(GetCallResponse.parse(callToApi(call)));
  } catch (error) {
    sendCallError(req, res, error);
  }
});

router.post("/calls/:callId/action", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const params = CallActionParams.safeParse(req.params);
  const body = CallActionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "That call action is invalid." });
    return;
  }
  try {
    await expireStaleCalls();
    const call = await getParticipantCall(params.data.callId, session.userId);
    if (!call) {
      res.status(404).json({ error: "That call is no longer available." });
      return;
    }
    const { action } = body.data;
    if ((action === "accept" || action === "decline") && call.receiver_id !== session.userId) {
      res.status(403).json({ error: "Only the person receiving this call can respond to it." });
      return;
    }
    if (!ACTIVE_CALL_STATUSES.includes(call.status as (typeof ACTIVE_CALL_STATUSES)[number])) {
      if (action === "end" || action === "decline") {
        res.json(CallActionResponse.parse(callToApi(call)));
        return;
      }
      res.status(409).json({ error: "This call is no longer active." });
      return;
    }
    if (
      (action === "accept" || action === "decline") &&
      call.status !== "calling"
    ) {
      res.status(409).json({ error: "This call has already been answered." });
      return;
    }
    if (action === "connected" && call.status !== "connecting" && call.status !== "connected") {
      res.status(409).json({ error: "This call is not ready to connect." });
      return;
    }

    const nextStatus: CallStatus = action === "accept"
      ? "connecting"
      : action === "decline"
        ? "rejected"
        : action === "end"
          ? "ended"
          : action === "failed"
            ? "failed"
            : "connected";
    if (nextStatus !== call.status) {
      const timestamp = new Date().toISOString();
      const { data: updated, error } = await getSupabaseAdmin()
        .from("calls")
        .update({
          status: nextStatus,
          last_activity_at: timestamp,
          ...(ACTIVE_CALL_STATUSES.includes(nextStatus as (typeof ACTIVE_CALL_STATUSES)[number])
            ? {}
            : { ended_at: timestamp }),
        })
        .eq("id", call.id)
        .eq("status", call.status)
        .select("*")
        .maybeSingle();
      if (error) throw new CallError("The call status could not be updated.", 503);
      if (!updated) {
        const latest = await readCall(call.id, session.userId);
        if (!latest || (action !== "connected" && latest.status !== nextStatus)) {
          throw new CallError("The call changed before that action could be saved.", 409);
        }
        res.json(CallActionResponse.parse(callToApi(latest)));
        return;
      }
      res.json(CallActionResponse.parse(callToApi(updated as CallRow)));
      return;
    }
    res.json(CallActionResponse.parse(callToApi(call)));
  } catch (error) {
    sendCallError(req, res, error);
  }
});

router.post("/calls/:callId/heartbeat", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const params = CallHeartbeatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "That call could not be found." });
    return;
  }
  try {
    const call = await getParticipantCall(params.data.callId, session.userId);
    if (!call) {
      res.status(404).json({ error: "That call is no longer available." });
      return;
    }
    if (!ACTIVE_CALL_STATUSES.includes(call.status as (typeof ACTIVE_CALL_STATUSES)[number])) {
      res.status(409).json({ error: "This call is no longer active." });
      return;
    }
    const { error } = await getSupabaseAdmin()
      .from("calls")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", call.id)
      .in("status", [...ACTIVE_CALL_STATUSES]);
    if (error) throw new CallError("Call connection could not be renewed.", 503);
    res.sendStatus(204);
  } catch (error) {
    sendCallError(req, res, error);
  }
});

router.get("/calls/:callId/signals/:afterId", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const params = PollCallSignalsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Call signaling cursor is invalid." });
    return;
  }
  try {
    const call = await getParticipantCall(params.data.callId, session.userId);
    if (!call) {
      res.status(404).json({ error: "That call is no longer available." });
      return;
    }
    if (!ACTIVE_CALL_STATUSES.includes(call.status as (typeof ACTIVE_CALL_STATUSES)[number])) {
      res.json(PollCallSignalsResponse.parse([]));
      return;
    }
    const { data, error } = await getSupabaseAdmin()
      .from("call_signals")
      .select("*")
      .eq("call_id", call.id)
      .neq("sender_id", session.userId)
      .gt("id", params.data.afterId)
      .order("id", { ascending: true })
      .limit(130);
    if (error) throw new CallError("Call setup messages could not be read.", 503);
    res.json(PollCallSignalsResponse.parse((data ?? []).map((item) => signalToApi(item as CallSignalRow))));
  } catch (error) {
    sendCallError(req, res, error);
  }
});

router.post("/calls/:callId/signals", async (req, res): Promise<void> => {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const params = SendCallSignalParams.safeParse(req.params);
  const body = SendCallSignalBody.safeParse(req.body);
  if (!params.success || !body.success || !isValidSignal(body.data)) {
    res.status(400).json({ error: "That call setup message is invalid." });
    return;
  }
  try {
    const call = await getParticipantCall(params.data.callId, session.userId);
    if (!call) {
      res.status(404).json({ error: "That call is no longer available." });
      return;
    }
    if (!ACTIVE_CALL_STATUSES.includes(call.status as (typeof ACTIVE_CALL_STATUSES)[number])) {
      res.status(409).json({ error: "This call is no longer active." });
      return;
    }
    if (
      (body.data.signalType === "offer" && call.caller_id !== session.userId) ||
      (body.data.signalType === "answer" && call.receiver_id !== session.userId)
    ) {
      res.status(403).json({ error: "Only the designated caller can send an offer, and only the recipient can answer." });
      return;
    }
    const admin = getSupabaseAdmin();
    const { count, error: countError } = await admin
      .from("call_signals")
      .select("id", { count: "exact", head: true })
      .eq("call_id", call.id)
      .eq("sender_id", session.userId);
    if (countError) throw new CallError("Call setup messages could not be checked.", 503);
    if ((count ?? 0) >= MAX_SIGNALS_PER_CALLER) {
      throw new CallError("This call has sent too many setup messages.", 429);
    }
    if (body.data.signalType !== "ice_candidate") {
      const { data: duplicate, error: duplicateError } = await admin
        .from("call_signals")
        .select("id")
        .eq("call_id", call.id)
        .eq("sender_id", session.userId)
        .eq("signal_type", body.data.signalType)
        .limit(1);
      if (duplicateError) throw new CallError("Call setup messages could not be checked.", 503);
      if (duplicate?.length) {
        res.status(409).json({ error: "This call setup message was already sent." });
        return;
      }
    }
    const { data: signal, error } = await admin
      .from("call_signals")
      .insert({
        call_id: call.id,
        sender_id: session.userId,
        signal_type: body.data.signalType,
        payload: body.data.payload,
      })
      .select("*")
      .single();
    if (error || !signal) throw new CallError("The call setup message could not be sent.", 503);
    const timestamp = new Date().toISOString();
    const { error: activityError } = await admin
      .from("calls")
      .update({ last_activity_at: timestamp })
      .eq("id", call.id)
      .in("status", [...ACTIVE_CALL_STATUSES]);
    if (activityError) throw new CallError("The call activity could not be saved.", 503);
    res.status(201).json(SendCallSignalResponse.parse(signalToApi(signal as CallSignalRow)));
  } catch (error) {
    sendCallError(req, res, error);
  }
});

function isValidSignal(signal: {
  signalType: "offer" | "answer" | "ice_candidate";
  payload: {
    type?: "offer" | "answer";
    sdp?: string;
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}): boolean {
  if (signal.signalType === "ice_candidate") {
    return typeof signal.payload.candidate === "string" &&
      signal.payload.candidate.length > 0 &&
      signal.payload.candidate.length <= 3000;
  }
  return signal.payload.type === signal.signalType &&
    typeof signal.payload.sdp === "string" &&
    signal.payload.sdp.length > 0 &&
    signal.payload.sdp.length <= 20000;
}

export default router;
