import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response } from "express";
import { recoverMessageAddress, getAddress } from "viem";
import { getSupabaseAdmin, getSupabasePublic, getWalletAuthCredentials } from "./supabase";

const COOKIE_NAME = "chog_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface Challenge {
  message: string;
  expiresAt: number;
}

export interface WalletSession {
  userId: string;
  walletAddress: `0x${string}`;
  identityMode: "wallet_connected" | "address_only";
  expiresAt: number;
}

const challenges = new Map<string, Challenge>();

export function makeWalletChallenge(
  walletAddress: string,
  host: string,
  protocol: string,
): { walletAddress: string; nonce: string; message: string; expiresAt: string } {
  const normalized = getAddress(walletAddress);
  const nonce = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  const uri = `${protocol}://${host}`;
  const domain = host.split(":")[0] || host;
  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    normalized,
    "",
    "Sign in to CHOG MATE. This request will not trigger a blockchain transaction.",
    "",
    `URI: ${uri}`,
    "Version: 1",
    "Chain ID: 143",
    `Nonce: ${nonce}`,
    `Issued At: ${now.toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`,
  ].join("\n");

  if (challenges.size > 5000) {
    for (const [key, value] of challenges) {
      if (value.expiresAt <= Date.now()) challenges.delete(key);
    }
  }
  challenges.set(normalized.toLowerCase(), { message, expiresAt: expiresAt.getTime() });
  return { walletAddress: normalized, nonce, message, expiresAt: expiresAt.toISOString() };
}

export async function verifyWalletChallenge(
  walletAddress: string,
  nonce: string,
  signature: `0x${string}`,
): Promise<{
  userId: string;
  walletAddress: `0x${string}`;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const normalized = getAddress(walletAddress);
  const challenge = challenges.get(normalized.toLowerCase());
  if (!challenge || challenge.expiresAt <= Date.now()) {
    challenges.delete(normalized.toLowerCase());
    throw new Error("Challenge expired");
  }

  const expectedNonce = challenge.message.match(/Nonce: ([a-f0-9]+)/)?.[1];
  if (!expectedNonce || expectedNonce !== nonce) {
    throw new Error("Challenge nonce did not match");
  }

  const recovered = await recoverMessageAddress({ message: challenge.message, signature });
  if (recovered.toLowerCase() !== normalized.toLowerCase()) {
    throw new Error("Wallet signature did not match");
  }
  challenges.delete(normalized.toLowerCase());

  return createWalletAuthSession(normalized);
}

export async function createWalletAuthSession(
  walletAddress: string,
): Promise<{
  userId: string;
  walletAddress: `0x${string}`;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const normalized = getAddress(walletAddress);
  const credentials = getWalletAuthCredentials(normalized);
  const admin = getSupabaseAdmin();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: credentials.email,
    password: credentials.password,
    email_confirm: true,
    user_metadata: { wallet_address: normalized.toLowerCase() },
  });

  const publicClient = getSupabasePublic();
  const { data: signedIn, error: signInError } =
    await publicClient.auth.signInWithPassword(credentials);
  if (signInError || !signedIn.user || !signedIn.session) {
    throw (
      signInError ??
      createError ??
      new Error("Wallet account could not be established")
    );
  }
  if (created.user && created.user.id !== signedIn.user.id) {
    throw new Error("Wallet account identity did not match");
  }

  return {
    userId: signedIn.user.id,
    walletAddress: normalized,
    accessToken: signedIn.session.access_token,
    refreshToken: signedIn.session.refresh_token,
    expiresIn: signedIn.session.expires_in ?? 3600,
  };
}

export function setWalletSessionCookie(
  response: Response,
  userId: string,
  walletAddress: `0x${string}`,
  identityMode: WalletSession["identityMode"] = "wallet_connected",
): void {
  const session: WalletSession = {
    userId,
    walletAddress,
    identityMode,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(payload);
  response.cookie(COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearWalletSessionCookie(response: Response): void {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
  });
}

export function readWalletSession(request: Request): WalletSession | null {
  const value = request.cookies?.[COOKIE_NAME];
  if (typeof value !== "string") return null;
  const [payload, suppliedSignature] = value.split(".");
  if (!payload || !suppliedSignature) return null;
  const expectedSignature = sign(payload);
  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WalletSession;
    if (
      typeof session.userId !== "string" ||
      typeof session.walletAddress !== "string" ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    if (!isWalletIdentityMode(session.identityMode)) {
      // Existing signed-wallet cookies predate identity-mode tracking.
      session.identityMode = "wallet_connected";
    }
    return session;
  } catch {
    return null;
  }
}

export function requireWalletSession(
  request: Request,
  response: Response,
): WalletSession | null {
  const session = readWalletSession(request);
  if (!session) {
    response.status(401).json({ error: "Connect your wallet to continue." });
    return null;
  }
  return session;
}

export function requireConnectedWalletSession(
  request: Request,
  response: Response,
): WalletSession | null {
  const session = requireWalletSession(request, response);
  if (!session) return null;
  if (session.identityMode !== "wallet_connected") {
    response.status(403).json({ error: "Connect your wallet to continue." });
    return null;
  }
  return session;
}

function isWalletIdentityMode(value: unknown): value is WalletSession["identityMode"] {
  return value === "wallet_connected" || value === "address_only";
}

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
