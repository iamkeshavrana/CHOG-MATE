import { Router, type IRouter } from "express";
import {
  GetChogParams,
  GetChogResponse,
  GetNftOwnershipParams,
  GetNftOwnershipResponse,
} from "@workspace/api-zod";
import { getAddress } from "viem";
import {
  getChog,
  getChogCollectionSupply,
  getOwnedChogs,
} from "../lib/chogs";
import {
  getCollectionStats,
  getChogCollectionPage,
  getLiveSales,
  NftIndexerError,
} from "../lib/opensea";

const router: IRouter = Router();

router.get("/nft/live-sales", async (req, res): Promise<void> => {
  const cursor = req.query.next;
  if (
    cursor !== undefined &&
    (typeof cursor !== "string" || cursor.length > 2_000)
  ) {
    res.status(400).json({ error: "Invalid sales page request." });
    return;
  }

  try {
    const page = await getLiveSales(typeof cursor === "string" ? cursor : undefined);
    res.json({ ...page, updatedAt: new Date().toISOString() });
  } catch (error) {
    const statusCode =
      error instanceof NftIndexerError ? error.statusCode : 503;
    req.log.warn({ statusCode }, "Chog Genesis live sales unavailable");
    res.status(statusCode).json({
      error: "Live Chog sales are temporarily unavailable.",
    });
  }
});

router.get("/nft/collection-stats", async (req, res): Promise<void> => {
  try {
    res.json(await getCollectionStats());
  } catch (error) {
    const statusCode =
      error instanceof NftIndexerError ? error.statusCode : 503;
    req.log.warn({ statusCode }, "Chog Genesis collection stats unavailable");
    res.status(statusCode).json({
      error: "Chog Genesis collection statistics are temporarily unavailable.",
    });
  }
});

router.get("/nft/collection", async (req, res): Promise<void> => {
  const limit = Number(req.query.limit ?? 50);
  const cursor = req.query.next;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (cursor !== undefined &&
      (typeof cursor !== "string" || cursor.length > 2_000))
  ) {
    res.status(400).json({ error: "Invalid collection page request." });
    return;
  }

  try {
    const page = await getChogCollectionPage(
      limit,
      typeof cursor === "string" ? cursor : undefined,
    );
    const total = await getChogCollectionSupply().catch(() => null);
    res.json({
      ...page,
      total: total === null ? null : Number(total),
    });
  } catch (error) {
    const statusCode =
      error instanceof NftIndexerError ? error.statusCode : 503;
    req.log.warn(
      { statusCode },
      "Chog Genesis collection index lookup unavailable",
    );
    res.status(statusCode).json({
      error: "The Chog Genesis collection is temporarily unavailable. Please try again.",
    });
  }
});

router.get("/nft/ownership/:walletAddress", async (req, res): Promise<void> => {
  const parsed = GetNftOwnershipParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid wallet address." });
    return;
  }

  try {
    const walletAddress = getAddress(parsed.data.walletAddress);
    const chogs = await getOwnedChogs(walletAddress);
    res.json(
      GetNftOwnershipResponse.parse({
        walletAddress,
        verified: chogs.length > 0,
        chogs,
      }),
    );
  } catch (error) {
    req.log.warn(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Chog ownership lookup unavailable",
    );
    res.status(503).json({
      error: "Chog ownership is temporarily unavailable. Please try again.",
    });
  }
});

router.get("/nft/tokens/:tokenId", async (req, res): Promise<void> => {
  const parsed = GetChogParams.safeParse(req.params);
  if (!parsed.success || !/^\d{1,78}$/.test(parsed.data?.tokenId ?? "")) {
    res.status(404).json({ error: "That Chog token could not be found." });
    return;
  }

  try {
    const chog = await getChog(parsed.data.tokenId);
    if (!chog) {
      res.status(404).json({ error: "That Chog token could not be found." });
      return;
    }
    res.json(GetChogResponse.parse(chog));
  } catch (error) {
    req.log.warn(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Chog token metadata unavailable",
    );
    res.status(503).json({
      error: "Chog metadata is temporarily unavailable. Please try again.",
    });
  }
});

export default router;
