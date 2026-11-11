
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
  getItemClaims,
  getMyClaims,
  approveClaim,
  rejectClaim,
  confirmRecovery,
} from "../controllers/claimController.js";

const router = Router();

// Public routes
router.get("/", getItems);

// My Claims must be registered before /:id.
router.get("/my-claims", requireAuth, getMyClaims);

// Public item details
router.get("/:id", getItemById);

// Claim routes
router.post("/:id/claims", requireAuth, createClaim);
router.get("/:id/claims", requireAuth, getItemClaims);

// Item management
router.post("/", requireAuth, createItem);
router.patch("/:id", requireAuth, updateItem);
router.delete("/:id", requireAuth, deleteItem);

// Claim approval and rejection
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

// Recovery confirmation
router.patch(
  "/:id/claims/:claimId/confirm-recovery",
  requireAuth,
  confirmRecovery
);

// Item images
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
