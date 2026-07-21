// Standalone version of routes/health.ts (the monorepo version validates the
// response with a shared zod schema; standalone keeps zero extra deps).
import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
