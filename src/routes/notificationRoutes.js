import express from "express";
import {
  getNotifications,
  markNotificationRead,
} from "../controllers/notificationController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// All notification endpoints require authentication.
router.use(requireAuth);

router.get("/", getNotifications);
router.patch("/:id/read", markNotificationRead);

export default router;
