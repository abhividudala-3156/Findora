
import {
  describe,
  it,
  before,
  beforeEach,
  after,
} from "node:test";

import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import app from "../src/app.js";
import { connectDB } from "../src/config/database.js";
import User from "../src/models/User.js";
import { sessionStore } from "../src/config/session.js";

let agent;
let csrfToken;

describe("Findora Authentication API", () => {
  before(async () => {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error(
        "MONGODB_URI is missing. Configure .env.test before running tests."
      );
    }

    let databaseName;

    try {
      databaseName = new URL(uri).pathname.replace(/^\//, "");
    } catch {
      throw new Error(
        "MONGODB_URI must be a valid MongoDB connection URI."
      );
    }

    if (databaseName !== "campus_lost_found_test") {
      throw new Error(
        "Authentication tests must use campus_lost_found_test."
      );
    }

    await connectDB();
  });

  // Give each test an independent session and CSRF token.
  beforeEach(async () => {
    await User.deleteMany({});

    agent = request.agent(app);

    const csrfResponse = await agent.get("/api/auth/csrf-token");

    assert.equal(
      csrfResponse.status,
      200,
      "Failed to obtain a CSRF token"
    );

    csrfToken = csrfResponse.body.csrfToken;

    assert.ok(csrfToken, "CSRF token should be returned");
  });

  after(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await User.deleteMany({});
      }
    } finally {
      await sessionStore.close();
      await mongoose.disconnect();
    }
  });

  // Register a user for login-related tests.
  async function registerTestUser() {
    const response = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Login Test Student",
        email: "login-test@example.com",
        password: "SecurePass123!",
      });

    assert.equal(
      response.status,
      201,
      `Test user registration failed: ${JSON.stringify(response.body)}`
    );

    return response;
  }

  it("registers a valid user and returns HTTP 201", async () => {
    const response = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Test Student",
        email: "student@example.com",
        password: "SecurePass123!",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(
      response.body.message,
      "Account registered successfully"
    );

    assert.equal(response.body.user.name, "Test Student");
    assert.equal(response.body.user.email, "student@example.com");
    assert.equal(response.body.user.role, "user");
    assert.ok(response.body.user.id);
    assert.ok(response.body.user.createdAt);

    assert.equal("password" in response.body.user, false);
    assert.equal("passwordHash" in response.body.user, false);
  });

  it("normalizes email addresses to lowercase", async () => {
    const response = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Email Test",
        email: "  STUDENT@EXAMPLE.COM  ",
        password: "SecurePass123!",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.email, "student@example.com");

    const user = await User.findOne({
      email: "student@example.com",
    });

    assert.ok(user);
    assert.equal(user.email, "student@example.com");
  });

  it("rejects duplicate email addresses with HTTP 409", async () => {
    const account = {
      name: "Test Student",
      email: "duplicate@example.com",
      password: "SecurePass123!",
    };

    const firstResponse = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrfToken)
      .send(account);

    assert.equal(firstResponse.status, 201);

    const secondResponse = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrfToken)
      .send(account);

    assert.equal(secondResponse.status, 409);
    assert.equal(secondResponse.body.success, false);

    const userCount = await User.countDocuments({
      email: "duplicate@example.com",
    });

    assert.equal(userCount, 1);
  });

  it("rejects an invalid email address with HTTP 400", async () => {
    const response = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Test Student",
        email: "invalid-email",
        password: "SecurePass123!",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("rejects a password shorter than eight characters", async () => {
    const response = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Test Student",
        email: "weak@example.com",
        password: "short",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("does not allow a user to register as an administrator", async () => {
    const response = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Attempted Admin",
        email: "attempted-admin@example.com",
        password: "SecurePass123!",
        role: "admin",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.role, "user");

    const user = await User.findOne({
      email: "attempted-admin@example.com",
    });

    assert.ok(user);
    assert.equal(user.role, "user");
  });

  it("stores a bcrypt hash instead of the plaintext password", async () => {
    const password = "SecurePass123!";

    const response = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Hash Test",
        email: "hash-test@example.com",
        password,
      });

    assert.equal(response.status, 201);

    const user = await User.findOne({
      email: "hash-test@example.com",
    }).select("+passwordHash");

    assert.ok(user);
    assert.notEqual(user.passwordHash, password);
    assert.match(user.passwordHash, /^\$2[aby]\$/);

    assert.equal(
      await bcrypt.compare(password, user.passwordHash),
      true
    );

    assert.equal("passwordHash" in response.body, false);
    assert.equal("password" in response.body, false);
  });

  it("rejects login with an incorrect password", async () => {
    await registerTestUser();

    const response = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({
        email: "login-test@example.com",
        password: "WrongPassword123!",
      });

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });

  it("rejects login for an unknown email", async () => {
    const response = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({
        email: "unknown@example.com",
        password: "SecurePass123!",
      });

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });

  it("creates a session and identifies the logged-in user", async () => {
    await registerTestUser();

    const loginResponse = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({
        email: "login-test@example.com",
        password: "SecurePass123!",
      });

    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.body.success, true);
    assert.equal(
      loginResponse.body.user.email,
      "login-test@example.com"
    );
    assert.equal(loginResponse.body.user.role, "user");
    assert.equal("passwordHash" in loginResponse.body.user, false);

    const cookie = loginResponse.headers["set-cookie"];

    assert.ok(cookie, "Login should set a session cookie");
    assert.ok(
      cookie.some((value) => value.startsWith("findora.sid=")),
      "Session cookie should use the expected name"
    );

    const meResponse = await agent.get("/api/auth/me");

    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.body.success, true);
    assert.equal(
      meResponse.body.user.email,
      "login-test@example.com"
    );
  });

  it("rejects current-user requests without a session", async () => {
    const response = await request(app).get("/api/auth/me");

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });

  it("destroys the session on logout", async () => {
    await registerTestUser();

    const loginResponse = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({
        email: "login-test@example.com",
        password: "SecurePass123!",
      });

    assert.equal(loginResponse.status, 200);

    // Login regenerates the session, so obtain a token for the new session.
    const freshCsrfResponse = await agent.get("/api/auth/csrf-token");

    assert.equal(freshCsrfResponse.status, 200);

    const freshCsrfToken = freshCsrfResponse.body.csrfToken;

    assert.ok(freshCsrfToken);

    const logoutResponse = await agent
      .post("/api/auth/logout")
      .set("x-csrf-token", freshCsrfToken);

    assert.equal(logoutResponse.status, 200);
    assert.equal(logoutResponse.body.success, true);

    const meResponse = await agent.get("/api/auth/me");

    assert.equal(meResponse.status, 401);
    assert.equal(meResponse.body.success, false);
  });
});
