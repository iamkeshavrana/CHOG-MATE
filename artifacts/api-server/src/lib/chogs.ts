import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  isAddress,
  type Address,
} from "viem";
import { getOpenSeaChogImage } from "./opensea";

const DEFAULT_CHOG_CONTRACT_ADDRESS =
  "0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763";
const configuredContractAddress = process.env.VITE_CHOG_CONTRACT_ADDRESS?.trim();
if (configuredContractAddress && !isAddress(configuredContractAddress)) {
  throw new Error("VITE_CHOG_CONTRACT_ADDRESS must be a valid EVM address.");
}
export const CHOG_CONTRACT_ADDRESS = getAddress(
  configuredContractAddress || DEFAULT_CHOG_CONTRACT_ADDRESS,
) as Address;

function resolveMonadRpcUrl(): string {
  const configured = process.env.MONAD_RPC_URL ?? process.env.VITE_MONAD_RPC_URL;
  if (!configured) return "https://rpc.monad.xyz";

  const assignment = configured.trim().match(/^(?:VITE_)?MONAD_RPC_URL\s*=\s*(.*)$/i);
  const value = (assignment?.[1] ?? configured).trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MONAD_RPC_URL or VITE_MONAD_RPC_URL must be a valid HTTP or HTTPS URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MONAD_RPC_URL or VITE_MONAD_RPC_URL must be a valid HTTP or HTTPS URL.");
  }
  return url.toString();
}

const monadRpcUrl = resolveMonadRpcUrl();

const monad = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [monadRpcUrl] },
  },
  testnet: false,
});

const publicClient = createPublicClient({
  chain: monad,
  transport: http(monadRpcUrl, {
    timeout: 20_000,
    retryCount: 1,
  }),
});

const erc721Abi = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokensOfOwner",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "ids", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export interface ChogTrait {
  traitType: string;
  traitValue: string;
  rarity: number | null;
}

export interface ChogToken {
  tokenId: string;
  contractAddress: string;
  ownerWallet: string;
  verified: boolean;
  name: string | null;
  description: string | null;
  tier: string | null;
  imageUrl: string | null;
  metadataUrl: string | null;
  metadata: Metadata | null;
  traits: ChogTrait[];
}

interface Metadata extends Record<string, unknown> {
  name?: unknown;
  description?: unknown;
  tier?: unknown;
  image?: unknown;
  image_url?: unknown;
  attributes?: unknown;
  traits?: unknown;
}

interface CachedTokens {
  expiresAt: number;
  tokens: ChogToken[];
}

const ownershipCache = new Map<string, CachedTokens>();
const metadataCache = new Map<string, { expiresAt: number; value: Metadata | null }>();
const activeOwnershipRequests = new Map<string, Promise<ChogToken[]>>();
const OWNERSHIP_TTL_MS = 30_000;
const METADATA_TTL_MS = 6 * 60 * 60 * 1000;
let collectionSupplyCache: { expiresAt: number; value: string } | null = null;

export async function getChogCollectionSupply(): Promise<string> {
  if (collectionSupplyCache && collectionSupplyCache.expiresAt > Date.now()) {
    return collectionSupplyCache.value;
  }

  const supply = await publicClient.readContract({
    address: CHOG_CONTRACT_ADDRESS,
    abi: erc721Abi,
    functionName: "totalSupply",
  });
  const value = supply.toString();
  collectionSupplyCache = { value, expiresAt: Date.now() + 5 * 60 * 1000 };
  return value;
}

export async function getOwnedChogs(walletAddress: Address): Promise<ChogToken[]> {
  const wallet = walletAddress.toLowerCase();
  const cached = ownershipCache.get(wallet);
  if (cached && cached.expiresAt > Date.now()) return cached.tokens;

  const existing = activeOwnershipRequests.get(wallet);
  if (existing) return existing;

  const request = loadOwnedChogs(walletAddress)
    .then((tokens) => {
      ownershipCache.set(wallet, {
        tokens,
        expiresAt: Date.now() + OWNERSHIP_TTL_MS,
      });
      return tokens;
    })
    .finally(() => activeOwnershipRequests.delete(wallet));
  activeOwnershipRequests.set(wallet, request);
  return request;
}

export async function getChog(tokenId: string): Promise<ChogToken | null> {
  let tokenNumber: bigint;
  try {
    tokenNumber = BigInt(tokenId);
  } catch {
    return null;
  }
  if (tokenNumber < 0n) return null;

  const owner = await publicClient
    .readContract({
      address: CHOG_CONTRACT_ADDRESS,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [tokenNumber],
    })
    .catch(() => null);
  if (!owner) return null;

  const metadataUrl = await tokenMetadataUrl(tokenNumber);
  const metadata = await readTokenMetadata(metadataUrl);
  const traits = mapTraits(metadata);
  const normalizedTokenId = tokenNumber.toString();
  const imageUrl =
    (await getOpenSeaChogImage(normalizedTokenId).catch(() => null)) ??
    metadataImage(metadata);
  return {
    tokenId: normalizedTokenId,
    contractAddress: CHOG_CONTRACT_ADDRESS,
    ownerWallet: owner,
    verified: true,
    name: typeof metadata?.name === "string" ? metadata.name : null,
    description: metadataText(metadata?.description, 2_000),
    tier: metadataTier(metadata, traits),
    imageUrl,
    metadataUrl,
    metadata,
    traits,
  };
}

export async function isCurrentChogOwner(
  walletAddress: Address,
  tokenId: string,
): Promise<boolean | null> {
  try {
    const owner = await publicClient.readContract({
      address: CHOG_CONTRACT_ADDRESS,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
    return owner.toLowerCase() === walletAddress.toLowerCase();
  } catch {
    return null;
  }
}

async function loadOwnedChogs(walletAddress: Address): Promise<ChogToken[]> {
  const balance = await publicClient.readContract({
    address: CHOG_CONTRACT_ADDRESS,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [walletAddress],
  });
  if (balance === 0n) return [];

  const ids = await publicClient.readContract({
    address: CHOG_CONTRACT_ADDRESS,
    abi: erc721Abi,
    functionName: "tokensOfOwner",
    args: [walletAddress],
  });
  if (BigInt(ids.length) !== balance) {
    throw new Error("The Chog contract returned an inconsistent ownership list.");
  }

  const tokens = await Promise.all(
    ids.map(async (tokenNumber): Promise<ChogToken> => {
      const owner = await publicClient.readContract({
        address: CHOG_CONTRACT_ADDRESS,
        abi: erc721Abi,
        functionName: "ownerOf",
        args: [tokenNumber],
      });
      if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error("The Chog contract returned a token owned by another wallet.");
      }
      const [metadataUrl] = await Promise.all([
        tokenMetadataUrl(tokenNumber),
      ]);
      const metadata = await readTokenMetadata(metadataUrl);
      const traits = mapTraits(metadata);
      const normalizedTokenId = tokenNumber.toString();
      const imageUrl =
        (await getOpenSeaChogImage(normalizedTokenId).catch(() => null)) ??
        metadataImage(metadata);
      return {
        tokenId: normalizedTokenId,
        contractAddress: CHOG_CONTRACT_ADDRESS,
        ownerWallet: walletAddress,
        verified: true,
        name: typeof metadata?.name === "string" ? metadata.name : null,
        description: metadataText(metadata?.description, 2_000),
        tier: metadataTier(metadata, traits),
        imageUrl,
        metadataUrl,
        metadata,
        traits,
      };
    }),
  );
  return tokens.sort((a, b) => BigInt(a.tokenId) < BigInt(b.tokenId) ? -1 : 1);
}

async function tokenMetadataUrl(tokenId: bigint): Promise<string | null> {
  return publicClient
    .readContract({
      address: CHOG_CONTRACT_ADDRESS,
      abi: erc721Abi,
      functionName: "tokenURI",
      args: [tokenId],
    })
    .catch(() => null);
}

async function readTokenMetadata(uri: string | null): Promise<Metadata | null> {
  if (!uri) return null;

  const cached = metadataCache.get(uri);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = resolveGatewayUrl(uri);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Metadata request failed (${response.status})`);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("NFT metadata must be a JSON object.");
    }
    const metadata = payload as Metadata;
    metadataCache.set(uri, { value: metadata, expiresAt: Date.now() + METADATA_TTL_MS });
    return metadata;
  } catch {
    metadataCache.set(uri, { value: null, expiresAt: Date.now() + 60_000 });
    return null;
  }
}

function metadataText(value: unknown, maxLength: number): string | null {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";
  return normalized ? normalized.slice(0, maxLength) : null;
}

function metadataTier(metadata: Metadata | null, traits: ChogTrait[]): string | null {
  const directTier = metadataText(metadata?.tier, 100);
  if (directTier) return directTier;
  return (
    traits.find((trait) => trait.traitType.trim().toLowerCase() === "tier")
      ?.traitValue ?? null
  );
}

function resolveGatewayUrl(uri: string): string {
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  return uri;
}

function metadataImage(metadata: Metadata | null): string | null {
  if (!metadata) return null;
  const image = typeof metadata.image_url === "string" ? metadata.image_url : metadata.image;
  if (typeof image !== "string") return null;
  const resolved = resolveGatewayUrl(image);
  return /^https?:\/\//i.test(resolved) ? resolved : null;
}

function mapTraits(metadata: Metadata | null): ChogTrait[] {
  if (!metadata) return [];
  const attributes = Array.isArray(metadata.attributes)
    ? metadata.attributes
    : Array.isArray(metadata.traits)
      ? metadata.traits
      : [];
  return attributes.flatMap((entry): ChogTrait[] => {
    if (!entry || typeof entry !== "object") return [];
    const trait = entry as Record<string, unknown>;
    const traitType = trait.trait_type ?? trait.traitType;
    const traitValue = trait.value ?? trait.trait_value ?? trait.traitValue;
    if (typeof traitType !== "string" || traitType.length === 0) return [];
    if (
      (typeof traitValue !== "string" && typeof traitValue !== "number") ||
      String(traitValue).length === 0
    ) {
      return [];
    }
    const rarity =
      typeof trait.rarity === "number" && trait.rarity >= 0 && trait.rarity <= 100
        ? trait.rarity
        : null;
    return [{ traitType, traitValue: String(traitValue), rarity }];
  });
}
