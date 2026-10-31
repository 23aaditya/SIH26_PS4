import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

import { authenticate } from "./middleware/authenticate.js";
import { errorHandler } from "./middleware/errorHandler.js";

import authRoutes from "./routes/auth.routes.js";
import applicationRoutes from "./routes/application.routes.js";
import documentRoutes from "./routes/document.routes.js";
import evcRoutes from "./routes/evc.routes.js";
import complianceRoutes from "./routes/compliance.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import applicationTypeRoutes from "./routes/applicationType.routes.js";
import scrutinyRoutes from "./routes/scrutiny.routes.js";
import aicteRoutes from "./routes/aicte.routes.js";
import delegationRoutes from "./routes/delegation.routes.js";
import agentRoutes from "./routes/agent.routes.js";

dotenv.config();

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(null, true); // Permissive in local hackathon environment
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach user context on all requests
app.use(authenticate);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "AICTE Express Backend",
    timestamp: new Date().toISOString(),
  });
});

// Mount application API routes
app.use("/api/auth", authRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/evc", evcRoutes);
app.use("/api/undertakings", complianceRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/application-types", applicationTypeRoutes);
app.use("/api/aicte/scrutiny", scrutinyRoutes);
app.use("/api/aicte", aicteRoutes);
app.use("/api/delegations", delegationRoutes);
app.use("/api/agent", agentRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
