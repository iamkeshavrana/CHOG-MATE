import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  Object.defineProperty(globalThis, "WebSocket", {
    value: WebSocket,
    configurable: true,
    writable: true,
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    requiredEnv("VITE_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export function getSupabasePublic(): SupabaseClient {
  return createClient(
    requiredEnv("VITE_SUPABASE_URL"),
    requiredEnv("VITE_SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export function getWalletAuthCredentials(walletAddress: string): {
  email: string;
  password: string;
} {
  const secret = requiredEnv("SESSION_SECRET");
  const normalized = walletAddress.toLowerCase().replace(/^0x/, "");
  const password = createHmac("sha256", secret)
    .update(`chog-mate-wallet:${normalized}`)
    .digest("hex");

  return {
    email: `wallet-${normalized}@wallet.chogmate.invalid`,
    password,
  };
}
