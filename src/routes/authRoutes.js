
import express from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  getCsrfToken,
} from "../controllers/authController.js";

const router = express.Router();

router.get("/csrf-token", getCsrfToken);
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/me", getCurrentUser);

export default router;
