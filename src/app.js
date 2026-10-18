
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import path from "node:path";
import itemRoutes from "./routes/itemRoutes.js";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/authRoutes.js";
import sessionMiddleware from "./config/session.js";
import { csrfSynchronisedProtection } from "./config/csrf.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Sessions must be initialized before routes that use them.
app.use(sessionMiddleware);

// Sessions before CSRF protection and routes
app.use(sessionMiddleware);
app.use(csrfSynchronisedProtection);

app.use(express.static(path.join(projectRoot, "public")));
app.use("/api/items", itemRoutes);

app.use("/api/auth", authRoutes);

app.get("/api/health", (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    success: databaseConnected,
    message: databaseConnected
      ? "Campus Lost and Found API is healthy"
      : "Database is not connected",
    database: databaseConnected ? "connected" : "disconnected"
  });
});

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});


app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({
      success: false,
      message: "Invalid or missing CSRF token",
    });
  }

  console.error("Application error:", err.message);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

export default app;
