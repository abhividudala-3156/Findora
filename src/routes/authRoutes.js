
import express from "express";

import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  getCsrfToken,
} from "../controllers/authController.js";

import {
  loginRateLimiter,
  registrationRateLimiter,
} from "../middleware/authRateLimit.js";

const router = express.Router();

router.get("/csrf-token", getCsrfToken);

router.post(
  "/register",
  registrationRateLimiter,
  registerUser
);

router.post(
  "/login",
  loginRateLimiter,
  loginUser
);

router.post("/logout", logoutUser);
router.get("/me", getCurrentUser);

export default router;
