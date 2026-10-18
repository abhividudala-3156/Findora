
import { csrfSync } from "csrf-sync";

const {
  csrfSynchronisedProtection,
  generateToken,
} = csrfSync({
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  getTokenFromRequest: (req) => req.headers["x-csrf-token"],
  getTokenFromState: (req) => req.session?.csrfToken,
  storeTokenInState: (req, token) => {
    if (req.session) {
      if (typeof token === "string") {
        req.session.csrfToken = token;
      } else {
        delete req.session.csrfToken;
      }
    }
  },
});

export { csrfSynchronisedProtection, generateToken };
