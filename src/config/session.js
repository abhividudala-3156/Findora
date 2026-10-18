
import session from "express-session";
import MongoStore from "connect-mongo";

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error(
    "SESSION_SECRET must be configured and contain at least 32 characters."
  );
}

const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: "sessions",
  ttl: 8 * 60 * 60,
  autoRemove: "native"
});

const sessionMiddleware = session({
  name: "findora.sid",
  secret: sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  }
});

export { sessionStore };
export default sessionMiddleware;
