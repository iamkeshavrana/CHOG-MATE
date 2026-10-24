import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response } from "express";
import { recoverMessageAddress, getAddress, isAddress } from "viem";
import { getSupabaseAdmin, getSupabasePublic, getWalletAuthEmail } from "./supabase";

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
  expiresAt: number;
  identityMode: "wallet_connected";
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
): Promise<{ walletAddress: `0x${string}` }> {
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

  let recovered: `0x${string}`;
  try {
    recovered = await recoverMessageAddress({ message: challenge.message, signature });
  } catch {
    throw new Error("Wallet signature is invalid");
  }
  if (recovered.toLowerCase() !== normalized.toLowerCase()) {
    throw new Error("Wallet signature did not match");
  }
  challenges.delete(normalized.toLowerCase());

  return { walletAddress: normalized };
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
  const email = getWalletAuthEmail(normalized);
  const admin = getSupabaseAdmin();
  const { data: generated, error: generateError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { data: { wallet_address: normalized.toLowerCase() } },
    });
  if (generateError) {
    throw generateError;
  }

  const publicClient = getSupabasePublic();
  const { data: signedIn, error: signInError } =
    await publicClient.auth.verifyOtp({
      token_hash: generated.properties.hashed_token,
      type: "magiclink",
    });
  if (signInError || !signedIn.user || !signedIn.session) {
    throw signInError ?? new Error("Wallet account could not be established");
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
): void {
  const session: WalletSession = {
    userId,
    walletAddress,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    identityMode: "wallet_connected",
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
    const session: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      !isRecord(session) ||
      typeof session.userId !== "string" ||
      typeof session.walletAddress !== "string" ||
      !isAddress(session.walletAddress, { strict: false }) ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    // Require a fresh wallet-connected session so older address-only cookies
    // cannot remain valid after the wallet-only onboarding change.
    if (session.identityMode !== "wallet_connected") {
      return null;
    }
    return {
      userId: session.userId,
      walletAddress: getAddress(session.walletAddress),
      expiresAt: session.expiresAt,
      identityMode: "wallet_connected",
    };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
