import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// MapLibre frontend (static). dist/ and src/ are siblings of public/.
// Served at both / (standalone deploy) and /api (Replit preview proxy prefix);
// API routes are mounted first, so they take precedence under /api.
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
app.use(express.static(publicDir));
app.use("/api", express.static(publicDir));

export default app;
