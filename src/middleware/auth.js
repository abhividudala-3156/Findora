
import User from "../models/User.js";

// Require a valid logged-in user.
export async function requireAuth(req, res, next) {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Use the database record, not role or ID supplied by the client.
    req.user = user;

    return next();
  } catch (error) {
    console.error("Authentication middleware error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify authentication",
    });
  }
}

// Require an administrator.
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator permission required",
    });
  }

  return next();
}
