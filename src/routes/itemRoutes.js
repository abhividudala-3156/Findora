
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

import {
  requireAuth,
  requireAdmin,
} from "../middleware/auth.js";

import {
  createClaim,
  getItemClaims,
  getMyClaims,
  approveClaim,
  rejectClaim,
  confirmRecovery,
} from "../controllers/claimController.js";

import {
  getPendingReports,
  approveReport,
  rejectReport,
} from "../controllers/adminController.js";

const router = Router();

// Public routes
router.get("/", getItems);

// My Claims
router.get("/my-claims", requireAuth, getMyClaims);

// Admin review routes
// These will be connected to the admin controller next.
// Admin review routes
router.get(
  "/admin/review",
  requireAuth,
  requireAdmin,
  getPendingReports
);

router.patch(
  "/admin/review/:id/approve",
  requireAuth,
  requireAdmin,
  approveReport
);

router.patch(
  "/admin/review/:id/reject",
  requireAuth,
  requireAdmin,
  rejectReport
);

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
