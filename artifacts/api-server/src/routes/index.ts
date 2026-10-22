import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import nftRouter from "./nft";
import profilesRouter from "./profiles";
import socialRouter from "./social";
import callsRouter from "./calls";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(nftRouter);
router.use(profilesRouter);
router.use(socialRouter);
router.use(callsRouter);

export default router;
