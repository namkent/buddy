import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import logger from "./utils/logger";
import path from "path";
import { fileURLToPath } from 'url';

// Swagger
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./swagger/swagger_output.json";

// Jobs
import cleanupJob from "./jobs/cleanup";
import recoveryJob from "./jobs/recovery";

// Routes
import v1Routes from "./v1/routes";

// Setup __dirname for ESM if needed, but since we use tsx it might be handled.
// However, to be safe:
const app = express();
const PORT = process.env.PORT || 3005;

console.log(`\x1b[35m[AI-SERVICE]\x1b[0m Using TTS Model: ${process.env.TTS_MODEL || "default"}`);
console.log(`\x1b[35m[AI-SERVICE]\x1b[0m Storage Root: ${process.env.STORAGE_DIR || "storage"}`);

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(logger);
app.use(express.static("public"));

// Swagger Docs
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Jobs
cleanupJob();
recoveryJob();

// API Routes
app.use("/v1", v1Routes);

// Compatibility with root health check
app.get("/health", (req: Request, res: Response) => res.json({ status: "ok", service: "mes-ai-service" }));

// Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(`\x1b[31m[AI-SERVICE-ERROR]\x1b[0m`, err.stack);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`\x1b[35m[AI-SERVICE]\x1b[0m Service is running on http://localhost:${PORT}`);
  console.log(`\x1b[35m[AI-SERVICE]\x1b[0m Swagger docs available at http://localhost:${PORT}/api-docs`);
});
