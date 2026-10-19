
import { Router } from "express";

import {
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem,
  getItemImage,
  uploadItemImage,
} from "../controllers/itemController.js";


import upload, {
  authorizeItemImageUpload,
  validateUploadedImage,
  handleImageUploadError,
} from "../middleware/imageUpload.js";


import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Public routes
router.get("/", getItems);
router.get("/:id", getItemById);

// Protected routes
router.post("/", requireAuth, createItem);
router.patch("/:id", requireAuth, updateItem);
router.delete("/:id", requireAuth, deleteItem);

router.get("/:id/image", getItemImage);

router.post(
  "/:id/image",
  requireAuth,
  authorizeItemImageUpload,
  upload.single("image"),
  validateUploadedImage,
  uploadItemImage,
  handleImageUploadError
);

export default router;
