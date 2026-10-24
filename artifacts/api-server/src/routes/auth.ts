import { Router, type IRouter } from "express";
import {
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
    const wallet = await verifyWalletChallenge(
      parsed.data.walletAddress,
      parsed.data.nonce,
      parsed.data.signature as `0x${string}`,
    );
    const chogs = await getOwnedChogs(getAddress(wallet.walletAddress));
    if (chogs.length === 0) {
      res.status(403).json({
        code: "CHOG_OWNERSHIP_REQUIRED",
        error: "This wallet does not currently own a verified Chog Genesis NFT.",
      });
      return;
    }

    const verified = await createWalletAuthSession(wallet.walletAddress);

    const admin = getSupabaseAdmin();
    const { error } = await admin.from("users").upsert(
      {
        id: verified.userId,
        wallet_address: verified.walletAddress.toLowerCase(),
        wallet_verified: true,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      throw error;
    }

    setWalletSessionCookie(res, verified.userId, verified.walletAddress);
    res.json(
      VerifyWalletResponse.parse({
        userId: verified.userId,
        walletAddress: verified.walletAddress,
        hasChog: true,
        accessToken: verified.accessToken,
        refreshToken: verified.refreshToken,
        expiresIn: verified.expiresIn,
      }),
    );
  } catch (error) {
    req.log.warn(getSafeBackendErrorFields(error), "Wallet verification failed");
    if (
      error instanceof Error &&
      (/challenge|signature/i.test(error.message))
    ) {
      res.status(401).json({
        code: "WALLET_SIGNATURE_INVALID",
        error: "Your wallet request expired or the signature did not match. Please try again.",
      });
      return;
    }
    const failure = toApiFailure(error, {
      code: "WALLET_VERIFICATION_UNAVAILABLE",
      error: "We couldn't verify your wallet right now. Please try again shortly.",
    });
    res.status(failure.status).json(failure.body);
  }
});

router.post("/auth/logout", (_req, res): void => {
  clearWalletSessionCookie(res);
  res.sendStatus(204);
});

export default router;
