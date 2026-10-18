import { getAddress, isAddress } from "viem";

const DEFAULT_CHOG_CONTRACT_ADDRESS =
  "0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763";
const DEFAULT_CHOG_TOKEN_ADDRESS =
  "0x350035555e10d9afaf1566aaebfced5ba6c27777";

function optionalUrl(name: string, rawValue: string | undefined): string | undefined {
  const value = rawValue?.trim();
  if (!value) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP or HTTPS URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be a valid HTTP or HTTPS URL.`);
  }

  return url.toString().replace(/\/$/, "");
}

function evmAddress(
  name: string,
  rawValue: string | undefined,
  defaultValue: string,
): `0x${string}` {
  const value = rawValue?.trim() || defaultValue;
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address.`);
  }
  return getAddress(value);
}

const supabaseUrl = optionalUrl("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined;

/**
 * Allowlisted browser configuration only. Vite embeds every VITE_* value in
 * client assets, so private credentials must never be added to this object.
 */
export const appConfig = Object.freeze({
  walletConnectProjectId:
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || undefined,
  monadRpcUrl:
    optionalUrl("VITE_MONAD_RPC_URL", import.meta.env.VITE_MONAD_RPC_URL) ??
    "https://rpc.monad.xyz",
  chogContractAddress: evmAddress(
    "VITE_CHOG_CONTRACT_ADDRESS",
    import.meta.env.VITE_CHOG_CONTRACT_ADDRESS,
    DEFAULT_CHOG_CONTRACT_ADDRESS,
  ),
  chogTokenAddress: evmAddress(
    "VITE_CHOG_TOKEN_ADDRESS",
    import.meta.env.VITE_CHOG_TOKEN_ADDRESS,
    DEFAULT_CHOG_TOKEN_ADDRESS,
  ),
  supabaseUrl,
  supabaseAnonKey,
  nftMetadataApi: optionalUrl(
    "VITE_NFT_METADATA_API",
    import.meta.env.VITE_NFT_METADATA_API,
  ),
  nftIndexerApi: optionalUrl(
    "VITE_NFT_INDEXER_API",
    import.meta.env.VITE_NFT_INDEXER_API,
  ),
});

export const walletAuthConfigured = Boolean(
  appConfig.supabaseUrl && appConfig.supabaseAnonKey,
);
