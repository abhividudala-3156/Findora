
import { Router } from "express";

import {
  createSavedSearch,
  getSavedSearches,
  getSavedSearchById,
  updateSavedSearch,
  deleteSavedSearch,
} from "../controllers/savedSearchController.js";

import { requireAuth } from "../middleware/auth.js";

const router = Router();

// All saved search routes require authentication.
router.use(requireAuth);

// Saved search management.
router.post("/", createSavedSearch);
router.get("/", getSavedSearches);
router.get("/:id", getSavedSearchById);
router.patch("/:id", updateSavedSearch);
router.delete("/:id", deleteSavedSearch);

export default router;
