
import { Router } from "express";

import {
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem,
} from "../controllers/itemController.js";

import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Public routes
router.get("/", getItems);
router.get("/:id", getItemById);

// Protected routes
router.post("/", requireAuth, createItem);
router.patch("/:id", requireAuth, updateItem);
router.delete("/:id", requireAuth, deleteItem);

export default router;
