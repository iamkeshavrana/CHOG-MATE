import { formatUnits } from "viem";

const OPENSEA_API_URL = "https://api.opensea.io/api/v2";
const OPENSEA_COLLECTION_SLUG = "chog-genesis";
const CHOG_CONTRACT_ADDRESS = "0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763";
const CHOG_OPENSEA_URL = `https://opensea.io/assets/monad/${CHOG_CONTRACT_ADDRESS}`;
const MARKETPLACE_CACHE_MS = 60_000;
const CHOG_IMAGE_CACHE_MS = 10 * 60_000;
const MON_ETH_PRICE_URL =
  "https://coins.llama.fi/prices/current/coingecko:monad,coingecko:ethereum";

export interface ChogCollectionItem {
  tokenId: string;
  name: string | null;
  imageUrls: string[];
  marketplaceUrl: string | null;
}

export interface ChogCollectionPage {
  items: ChogCollectionItem[];
  next: string | null;
}

export interface LiveSale {
  tokenId: string;
  imageUrl: string;
  price: string;
  currency: string;
  marketplace: string | null;
  saleUrl: string;
  timestamp: string;
}

export interface LiveSalesPage {
  sales: LiveSale[];
  next: string | null;
}

export interface PriceMetric {
  amount: string;
  currency: string;
}

export interface CollectionStats {
  floorPrice: PriceMetric | null;
  topOffer: PriceMetric | null;
  totalVolume: PriceMetric | null;
  totalHolders: number | null;
  updatedAt: string;
}

interface TimedValue<T> {
  expiresAt: number;
  value: T;
}

const liveSalesCache = new Map<string, TimedValue<LiveSalesPage>>();
const chogImageCache = new Map<string, TimedValue<string | null>>();
let collectionStatsCache: TimedValue<CollectionStats> | null = null;

export class NftIndexerError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "NftIndexerError";
  }
}

export async function getChogCollectionPage(
  limit: number,
  cursor?: string,
): Promise<ChogCollectionPage> {
  const url = new URL(
    `${OPENSEA_API_URL}/collection/${OPENSEA_COLLECTION_SLUG}/nfts`,
  );
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set("next", cursor);

  const payload = await requestOpenSea(url);

  if (!payload || typeof payload !== "object") {
    throw new NftIndexerError("NFT collection indexer returned invalid data.", 502);
  }

  const result = payload as { nfts?: unknown; next?: unknown };
  if (!Array.isArray(result.nfts)) {
    throw new NftIndexerError("NFT collection indexer returned invalid data.", 502);
  }

  const items = result.nfts.flatMap((entry): ChogCollectionItem[] => {
    if (!entry || typeof entry !== "object") return [];
    const nft = entry as Record<string, unknown>;
    if (
      typeof nft.identifier !== "string" ||
      typeof nft.contract !== "string" ||
      nft.contract.toLowerCase() !== CHOG_CONTRACT_ADDRESS
    ) {
      return [];
    }

    const imageUrls = [
      ...imageGatewayUrls(nft.image_url),
      ...imageGatewayUrls(nft.display_image_url),
      ...imageGatewayUrls(nft.original_image_url),
    ].filter((image, index, all) => all.indexOf(image) === index);

    return [
      {
        tokenId: nft.identifier,
        name: typeof nft.name === "string" ? nft.name : null,
        imageUrls,
        marketplaceUrl:
          typeof nft.opensea_url === "string" &&
          nft.opensea_url.startsWith("https://")
            ? nft.opensea_url
            : null,
      },
    ];
  });

  return {
    items,
    next: typeof result.next === "string" && result.next.length > 0
      ? result.next
      : null,
  };
}

export async function getOpenSeaChogImage(
  tokenId: string,
): Promise<string | null> {
  if (!process.env.OPENSEA_API_KEY?.trim()) return null;
  const cached = chogImageCache.get(tokenId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL(
    `${OPENSEA_API_URL}/chain/monad/contract/${CHOG_CONTRACT_ADDRESS}/nfts/${encodeURIComponent(tokenId)}`,
  );
  const payload = await requestOpenSea(url);
  if (!payload || typeof payload !== "object") {
    throw new NftIndexerError("OpenSea returned invalid NFT data.", 502);
  }
  const result = payload as { nft?: unknown };
  if (!result.nft || typeof result.nft !== "object") {
    throw new NftIndexerError("OpenSea returned invalid NFT data.", 502);
  }
  const nft = result.nft as Record<string, unknown>;
  if (
    typeof nft.contract !== "string" ||
    nft.contract.toLowerCase() !== CHOG_CONTRACT_ADDRESS.toLowerCase() ||
    typeof nft.identifier !== "string" ||
    nft.identifier !== tokenId
  ) {
    throw new NftIndexerError("OpenSea returned a different NFT than requested.", 502);
  }

  const imageUrl = [
    ...imageGatewayUrls(nft.display_image_url),
    ...imageGatewayUrls(nft.image_url),
    ...imageGatewayUrls(nft.original_image_url),
  ][0] ?? null;
  chogImageCache.set(tokenId, {
    value: imageUrl,
    expiresAt: Date.now() + CHOG_IMAGE_CACHE_MS,
  });
  return imageUrl;
}

export async function getLiveSales(cursor?: string): Promise<LiveSalesPage> {
  const cacheKey = cursor ?? "";
  const cached = liveSalesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL(`${OPENSEA_API_URL}/events/collection/${OPENSEA_COLLECTION_SLUG}`);
  url.searchParams.set("event_type", "sale");
  url.searchParams.set("limit", "50");
  if (cursor) url.searchParams.set("next", cursor);
  const payload = await requestOpenSea(url);
  if (!payload || typeof payload !== "object") {
    throw new NftIndexerError("Marketplace returned invalid sale data.", 502);
  }

  const events = (payload as { asset_events?: unknown }).asset_events;
  if (!Array.isArray(events)) {
    throw new NftIndexerError("Marketplace returned invalid sale data.", 502);
  }

  const sales = events
    .flatMap((entry): LiveSale[] => {
      if (!entry || typeof entry !== "object") return [];
      const event = entry as Record<string, unknown>;
      const nft = event.nft && typeof event.nft === "object"
        ? event.nft as Record<string, unknown>
        : event.asset && typeof event.asset === "object"
          ? event.asset as Record<string, unknown>
          : null;
      if (!nft) return [];
      const payment = event.payment && typeof event.payment === "object"
        ? event.payment as Record<string, unknown>
        : null;
      const tokenId = nft?.identifier;
      const contract = nft?.contract;
      const rawTimestamp = event.event_timestamp;
      const timestamp = typeof rawTimestamp === "number"
        ? rawTimestamp
        : typeof rawTimestamp === "string"
          ? /^\d+$/.test(rawTimestamp)
            ? Number(rawTimestamp)
            : Date.parse(rawTimestamp) / 1_000
          : Number.NaN;
      const quantity = payment?.quantity;
      const decimals = payment?.decimals;
      const currency = payment?.symbol;

      if (
        event.event_type !== "sale" ||
        typeof tokenId !== "string" ||
        !/^\d{1,78}$/.test(tokenId) ||
        typeof contract !== "string" ||
        contract.toLowerCase() !== CHOG_CONTRACT_ADDRESS ||
        !Number.isSafeInteger(timestamp) ||
        timestamp <= 0 ||
        (typeof quantity !== "string" && typeof quantity !== "number") ||
        typeof decimals !== "number" ||
        !Number.isInteger(decimals) ||
        decimals < 0 ||
        decimals > 36 ||
        typeof currency !== "string" ||
        !currency.trim()
      ) {
        return [];
      }

      const rawImage = [nft.display_image_url, nft.image_url, nft.original_image_url]
        .find((value) => isHttpsUrl(value));
      if (typeof rawImage !== "string") return [];

      const rawSaleUrl = isHttpsUrl(nft.opensea_url)
        ? nft.opensea_url
        : `${CHOG_OPENSEA_URL}/${encodeURIComponent(tokenId)}`;
      const marketplace =
        typeof event.marketplace === "string" && event.marketplace.trim()
          ? event.marketplace.trim()
          : null;
      let amount: string;
      try {
        amount = formatUnits(BigInt(quantity), decimals);
      } catch {
        return [];
      }
      if (BigInt(quantity) <= 0n) return [];

      return [{
        tokenId,
        imageUrl: rawImage,
        price: amount,
        currency: currency.trim(),
        marketplace,
        saleUrl: rawSaleUrl,
        timestamp: new Date(timestamp * 1000).toISOString(),
      }];
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const result: LiveSalesPage = {
    sales,
    next: typeof (payload as { next?: unknown }).next === "string"
      ? (payload as { next: string }).next
      : null,
  };
  liveSalesCache.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + MARKETPLACE_CACHE_MS,
  });
  if (liveSalesCache.size > 20) {
    const oldestKey = liveSalesCache.keys().next().value;
    if (oldestKey !== undefined) liveSalesCache.delete(oldestKey);
  }
  return result;
}

export async function getCollectionStats(): Promise<CollectionStats> {
  if (collectionStatsCache && collectionStatsCache.expiresAt > Date.now()) {
    return collectionStatsCache.value;
  }

  const url = new URL(`${OPENSEA_API_URL}/collections/${OPENSEA_COLLECTION_SLUG}/stats`);
  const payload = await requestOpenSea(url);
  if (!payload || typeof payload !== "object") {
    throw new NftIndexerError("Marketplace returned invalid collection statistics.", 502);
  }

  const total = (payload as { total?: unknown }).total;
  if (!total || typeof total !== "object") {
    throw new NftIndexerError("Marketplace returned invalid collection statistics.", 502);
  }

  const metrics = total as Record<string, unknown>;
  const floorPrice = metricFromProvider(
    metrics.floor_price,
    metrics.floor_price_symbol,
    true,
  );
  const rawTotalVolume = metricFromProvider(
    metrics.volume,
    metrics.volume_symbol,
    false,
  );
  const totalHolders =
    typeof metrics.num_owners === "number" &&
    Number.isSafeInteger(metrics.num_owners) &&
    metrics.num_owners >= 0
      ? metrics.num_owners
      : null;

  const [topOffer, totalVolume] = await Promise.all([
    getTopCollectionOffer(),
    convertVolumeToMonad(rawTotalVolume),
  ]);

  const value: CollectionStats = {
    floorPrice,
    topOffer,
    totalVolume,
    totalHolders,
    updatedAt: new Date().toISOString(),
  };
  collectionStatsCache = { value, expiresAt: Date.now() + MARKETPLACE_CACHE_MS };
  return value;
}

async function getTopCollectionOffer(): Promise<PriceMetric | null> {
  const url = new URL(`${OPENSEA_API_URL}/offers/collection/${OPENSEA_COLLECTION_SLUG}`);
  url.searchParams.set("limit", "10");
  const payload = await requestOpenSea(url);
  if (!payload || typeof payload !== "object") {
    throw new NftIndexerError("Marketplace returned invalid collection offers.", 502);
  }
  const offers = (payload as { offers?: unknown }).offers;
  if (!Array.isArray(offers)) {
    throw new NftIndexerError("Marketplace returned invalid collection offers.", 502);
  }

  for (const value of offers) {
    if (!value || typeof value !== "object") continue;
    const offer = value as Record<string, unknown>;
    if (
      typeof offer.status === "string" &&
      offer.status.toUpperCase() !== "ACTIVE"
    ) continue;
    if (
      typeof offer.chain === "string" &&
      offer.chain.toLowerCase() !== "monad"
    ) continue;

    const price = offer.price_per_item && typeof offer.price_per_item === "object"
      ? offer.price_per_item as Record<string, unknown>
      : offer.price && typeof offer.price === "object"
        ? offer.price as Record<string, unknown>
        : null;
    const rawValue = price?.value;
    const decimals = price?.decimals;
    const currency = price?.currency;
    if (
      (typeof rawValue !== "string" && typeof rawValue !== "number") ||
      typeof decimals !== "number" ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 36 ||
      typeof currency !== "string" ||
      !currency.trim()
    ) continue;

    try {
      const rawAmount = BigInt(rawValue);
      if (rawAmount <= 0n) continue;
      return { amount: formatUnits(rawAmount, decimals), currency: currency.trim() };
    } catch {
      continue;
    }
  }
  return null;
}

async function convertVolumeToMonad(
  metric: PriceMetric | null,
): Promise<PriceMetric | null> {
  if (!metric) return null;
  const currency = metric.currency.trim().toUpperCase();
  if (currency === "MON") return { amount: metric.amount, currency: "MON" };
  if (currency !== "ETH" && currency !== "WETH") {
    throw new NftIndexerError(
      `Cannot convert collection volume from ${metric.currency} to MON.`,
      502,
    );
  }

  let response: Response;
  try {
    response = await fetch(MON_ETH_PRICE_URL, {
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new NftIndexerError("The live MON/ETH conversion rate is unavailable.", 503);
  }
  if (!response.ok) {
    throw new NftIndexerError("The live MON/ETH conversion rate is unavailable.", 503);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || !("coins" in payload)) {
    throw new NftIndexerError("The live MON/ETH conversion rate is invalid.", 502);
  }
  const coins = (payload as { coins?: Record<string, unknown> }).coins;
  const mon = coins?.["coingecko:monad"];
  const eth = coins?.["coingecko:ethereum"];
  if (!mon || typeof mon !== "object" || !eth || typeof eth !== "object") {
    throw new NftIndexerError("The live MON/ETH conversion rate is incomplete.", 502);
  }

  const monPrice = (mon as { price?: unknown; timestamp?: unknown }).price;
  const monTimestamp = (mon as { timestamp?: unknown }).timestamp;
  const ethPrice = (eth as { price?: unknown; timestamp?: unknown }).price;
  const ethTimestamp = (eth as { timestamp?: unknown }).timestamp;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    typeof monPrice !== "number" || !Number.isFinite(monPrice) || monPrice <= 0 ||
    typeof ethPrice !== "number" || !Number.isFinite(ethPrice) || ethPrice <= 0 ||
    typeof monTimestamp !== "number" || nowSeconds - monTimestamp > 15 * 60 ||
    typeof ethTimestamp !== "number" || nowSeconds - ethTimestamp > 15 * 60
  ) {
    throw new NftIndexerError("The live MON/ETH conversion rate is stale or invalid.", 503);
  }

  const totalVolume = Number(metric.amount) * ethPrice / monPrice;
  if (!Number.isFinite(totalVolume) || totalVolume < 0) {
    throw new NftIndexerError("Collection volume could not be converted to MON.", 502);
  }
  return { amount: totalVolume.toFixed(6), currency: "MON" };
}

async function requestOpenSea(url: URL): Promise<unknown> {
  const apiKey = process.env.OPENSEA_API_KEY?.trim();
  if (!apiKey) {
    throw new NftIndexerError("OpenSea marketplace data is not configured.", 503);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new NftIndexerError("OpenSea could not be reached.", 502);
  }

  if (!response.ok) {
    throw new NftIndexerError(
      response.status === 401 || response.status === 403
        ? "OpenSea API credentials are not valid."
        : "OpenSea returned an unsuccessful response.",
      response.status === 401 || response.status === 403 ? 503 : 502,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new NftIndexerError("OpenSea returned invalid data.", 502);
  }
}

function metricFromProvider(
  amount: unknown,
  currency: unknown,
  zeroMeansMissing: boolean,
): PriceMetric | null {
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    (zeroMeansMissing && amount === 0) ||
    typeof currency !== "string" ||
    currency.trim().length === 0
  ) {
    return null;
  }
  return { amount: String(amount), currency: currency.trim() };
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function imageGatewayUrls(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  if (value.startsWith("ipfs://")) {
    const path = value.slice("ipfs://".length).replace(/^ipfs\//, "");
    return [
      `https://ipfs.io/ipfs/${path}`,
      `https://cloudflare-ipfs.com/ipfs/${path}`,
      `https://gateway.pinata.cloud/ipfs/${path}`,
    ];
  }
  if (value.startsWith("ar://")) {
    return [`https://arweave.net/${value.slice("ar://".length)}`];
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? [url.toString()] : [];
  } catch {
    return [];
  }
}
