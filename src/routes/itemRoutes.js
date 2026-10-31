
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

import {
  createClaim,
  approveClaim,
  rejectClaim,
  confirmRecovery,
} from "../controllers/claimController.js";

const router = Router();

// Public routes
router.get("/", getItems);
router.get("/:id", getItemById);

// Protected routes
router.post("/:id/claims", requireAuth, createClaim);
router.post("/", requireAuth, createItem);
router.patch("/:id", requireAuth, updateItem);
router.delete("/:id", requireAuth, deleteItem);
router.patch(
  "/:id/claims/:claimId/approve",
  requireAuth,
  approveClaim
);

router.patch(
  "/:id/claims/:claimId/reject",
  requireAuth,
  rejectClaim
);
router.patch(
  "/:id/claims/:claimId/confirm-recovery",
  requireAuth,
  confirmRecovery
);

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
