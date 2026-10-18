import { Router, type IRouter } from "express";
import {
  CreateAddressSessionBody,
  CreateAddressSessionResponse,
  CreateAuthChallengeBody,
  CreateAuthChallengeResponse,
  VerifyWalletBody,
  VerifyWalletResponse,
  GetAuthSessionResponse,
} from "@workspace/api-zod";
import { getAddress } from "viem";
import { getOwnedChogs } from "../lib/chogs";
import {
  clearWalletSessionCookie,
  createWalletAuthSession,
  makeWalletChallenge,
  readWalletSession,
  setWalletSessionCookie,
  verifyWalletChallenge,
} from "../lib/wallet-auth";
import { getSupabaseAdmin } from "../lib/supabase";
import { getSafeBackendErrorFields, toApiFailure } from "../lib/backend-errors";

const router: IRouter = Router();

router.get("/auth/session", (req, res): void => {
  const session = readWalletSession(req);
  res.setHeader("Cache-Control", "no-store");
  res.json(GetAuthSessionResponse.parse({ authenticated: Boolean(session) }));
});

router.post("/auth/challenge", async (req, res): Promise<void> => {
  const parsed = CreateAuthChallengeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid wallet address." });
    return;
  }

  try {
    const host = req.get("host") ?? "localhost";
    const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProtocol === "https" ? "https" : req.protocol;
    const challenge = makeWalletChallenge(parsed.data.walletAddress, host, protocol);
    res.json(CreateAuthChallengeResponse.parse(challenge));
  } catch {
    res.status(400).json({ error: "That wallet address is not valid." });
  }
});

router.post("/auth/verify", async (req, res): Promise<void> => {
  const parsed = VerifyWalletBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The wallet sign-in request is incomplete." });
    return;
  }

  try {
    const verified = await verifyWalletChallenge(
      parsed.data.walletAddress,
      parsed.data.nonce,
      parsed.data.signature as `0x${string}`,
    );
    const chogs = await getOwnedChogs(getAddress(verified.walletAddress));

    if (chogs.length > 0) {
      const admin = getSupabaseAdmin();
      const { error } = await admin.from("users").upsert(
        {
          id: verified.userId,
          wallet_address: verified.walletAddress.toLowerCase(),
          last_seen: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) {
        req.log.warn({ code: error.code }, "Could not create wallet profile record");
      }
    }

    setWalletSessionCookie(res, verified.userId, verified.walletAddress);
    res.json(
      VerifyWalletResponse.parse({
        userId: verified.userId,
        walletAddress: verified.walletAddress,
        hasChog: chogs.length > 0,
        identityMode: "wallet_connected",
        accessToken: verified.accessToken,
        refreshToken: verified.refreshToken,
        expiresIn: verified.expiresIn,
      }),
    );
  } catch (error) {
    req.log.warn(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Wallet verification failed",
    );
    if (error instanceof Error && error.message.includes("Challenge")) {
      res.status(401).json({ error: "Your wallet request expired. Please try again." });
      return;
    }
    res.status(503).json({
      error: "We couldn't verify your wallet right now. Please try again shortly.",
    });
  }
});

router.post("/auth/address", async (req, res): Promise<void> => {
  const parsed = CreateAddressSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid wallet address." });
    return;
  }

  try {
    const walletAddress = getAddress(parsed.data.walletAddress);
    const chogs = await getOwnedChogs(walletAddress);
    if (chogs.length === 0) {
      res.status(403).json({
        error: "This address must currently own a Chog Genesis NFT to create an account.",
      });
      return;
    }

    const account = await createWalletAuthSession(walletAddress);
    const admin = getSupabaseAdmin();
    const { data: existingUser, error: existingUserError } = await admin
      .from("users")
      .select("id")
      .eq("wallet_address", account.walletAddress.toLowerCase())
      .maybeSingle();
    if (existingUserError) {
      throw existingUserError;
    }
    if (existingUser && existingUser.id !== account.userId) {
      res.status(409).json({
        error: "This wallet is already linked to a different CHOG MATE account. Contact support to recover it.",
      });
      return;
    }

    const { error: userError } = await admin.from("users").upsert(
      {
        id: account.userId,
        wallet_address: account.walletAddress.toLowerCase(),
        last_seen: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (userError) throw userError;

    setWalletSessionCookie(
      res,
      account.userId,
      account.walletAddress,
      "address_only",
    );
    res.json(
      CreateAddressSessionResponse.parse({
        userId: account.userId,
        walletAddress: account.walletAddress,
        hasChog: true,
        identityMode: "address_only",
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        expiresIn: account.expiresIn,
      }),
    );
  } catch (error) {
    const failure = toApiFailure(error, {
      code: "ACCOUNT_SESSION_FAILED",
      error:
        "We couldn't create or resume this account session. Check the Supabase Auth configuration and server logs.",
    });
    req.log.error(
      { ...getSafeBackendErrorFields(error), responseCode: failure.body.code },
      "Address-only account sign-in failed",
    );
    res.status(failure.status).json(failure.body);
  }
});

router.post("/auth/logout", (_req, res): void => {
  clearWalletSessionCookie(res);
  res.sendStatus(204);
});

export default router;
