
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import path from "node:path";
import itemRoutes from "./routes/itemRoutes.js";
import { fileURLToPath } from "node:url";


const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(express.static(path.join(projectRoot, "public")));
app.use("/api/items", itemRoutes);

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
  console.error("Application error:", err.message);

  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

export default app;
