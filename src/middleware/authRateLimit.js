
import { rateLimit } from "express-rate-limit";

const testEnvironment = process.env.NODE_ENV === "test";

function createAuthRateLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,

    // Keep existing automated tests isolated from rate-limit counters.
    skip: () => testEnvironment,

    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message,
      });
    },
  });
}

export const loginRateLimiter = createAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many login attempts. Please try again later.",
});

export const registrationRateLimiter = createAuthRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: "Too many registration attempts. Please try again later.",
});
