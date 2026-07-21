import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mapsRouter from "./maps";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mapsRouter);

export default router;
